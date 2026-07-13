import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";

const JWT_CONFIG = {
  accessSecret: "test-access-secret",
  refreshSecret: "test-refresh-secret",
  accessTtl: "15m",
  refreshTtl: "30d",
};

const PASSWORD = "correct-horse-battery";
// Cost factor 4: fastest bcrypt allows — fine for tests, never for prod.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    schoolId: "school-1",
    email: "head@school.test",
    phone: "+233200000000",
    passwordHash: PASSWORD_HASH,
    status: "active",
    userRoles: [{ role: { name: "admin" } }, { role: { name: "teacher" } }],
    ...overrides,
  };
}

describe("AuthService", () => {
  let prisma: { user: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock } };
  let jwtService: JwtService;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jwtService = new JwtService({});
    const configService = { get: jest.fn().mockReturnValue(JWT_CONFIG) };
    service = new AuthService(prisma as never, jwtService, configService as never);
  });

  describe("login", () => {
    it("rejects an unknown user with UnauthorizedException", async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const error = (await service.login({ email: "nobody@x.test", password: PASSWORD }).catch((e: unknown) => e)) as Error;
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.message).toBe("Invalid credentials");
    });

    it("rejects a wrong password with the SAME exception shape as unknown user (no enumeration signal)", async () => {
      prisma.user.findFirst.mockResolvedValue(makeUser());
      const wrongPassword = service.login({ email: "head@school.test", password: "wrong" }).catch((e: unknown) => e);

      prisma.user.findFirst.mockResolvedValue(null);
      const unknownUser = service.login({ email: "nobody@x.test", password: PASSWORD }).catch((e: unknown) => e);

      const [wrongErr, unknownErr] = (await Promise.all([wrongPassword, unknownUser])) as [
        UnauthorizedException,
        UnauthorizedException,
      ];

      expect(wrongErr).toBeInstanceOf(UnauthorizedException);
      expect(unknownErr).toBeInstanceOf(UnauthorizedException);
      expect(wrongErr.message).toBe(unknownErr.message);
      expect(wrongErr.getStatus()).toBe(unknownErr.getStatus());
      expect(wrongErr.getResponse()).toEqual(unknownErr.getResponse());
    });

    it("rejects an inactive account even with the right password", async () => {
      prisma.user.findFirst.mockResolvedValue(makeUser({ status: "suspended" }));

      await expect(service.login({ email: "head@school.test", password: PASSWORD })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("returns {auth, refreshToken} on success with the JWT payload fields and no refreshToken inside auth", async () => {
      prisma.user.findFirst.mockResolvedValue(makeUser());

      const result = await service.login({ email: "head@school.test", password: PASSWORD });

      // Access token carries sub/schoolId/roles and verifies against the access secret.
      const accessPayload = jwtService.verify(result.auth.accessToken, { secret: JWT_CONFIG.accessSecret });
      expect(accessPayload).toMatchObject({ sub: "user-1", schoolId: "school-1", roles: ["admin", "teacher"] });

      // Refresh token verifies against the refresh secret (and not the access secret).
      const refreshPayload = jwtService.verify(result.refreshToken, { secret: JWT_CONFIG.refreshSecret });
      expect(refreshPayload).toMatchObject({ sub: "user-1", schoolId: "school-1" });
      expect(() => jwtService.verify(result.refreshToken, { secret: JWT_CONFIG.accessSecret })).toThrow();

      // The response body must never contain the refresh token.
      expect(result.auth).not.toHaveProperty("refreshToken");
      expect(JSON.stringify(result.auth)).not.toContain(result.refreshToken);

      expect(result.auth.user).toEqual({
        id: "user-1",
        schoolId: "school-1",
        email: "head@school.test",
        phone: "+233200000000",
        roles: ["admin", "teacher"],
      });

      // Successful login stamps lastLoginAt.
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe("refresh", () => {
    function signRefreshToken(expiresIn: string | number = "30d") {
      return jwtService.sign(
        { sub: "user-1", schoolId: "school-1", roles: ["admin"] },
        { secret: JWT_CONFIG.refreshSecret, expiresIn },
      );
    }

    it("issues a new token pair for a valid refresh token", async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.refresh(signRefreshToken());

      const accessPayload = jwtService.verify(result.auth.accessToken, { secret: JWT_CONFIG.accessSecret });
      expect(accessPayload).toMatchObject({ sub: "user-1", schoolId: "school-1" });
      expect(jwtService.verify(result.refreshToken, { secret: JWT_CONFIG.refreshSecret })).toMatchObject({
        sub: "user-1",
      });
      expect(result.auth).not.toHaveProperty("refreshToken");
    });

    it("rejects a malformed refresh token", async () => {
      await expect(service.refresh("not-a-jwt")).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a token signed with the wrong secret", async () => {
      const forged = jwtService.sign(
        { sub: "user-1", schoolId: "school-1", roles: ["admin"] },
        { secret: "attacker-secret", expiresIn: "30d" },
      );
      await expect(service.refresh(forged)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects an expired refresh token", async () => {
      // exp == iat -> already expired at verification time.
      const expired = signRefreshToken(0);
      await expect(service.refresh(expired)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects a valid token whose user no longer exists or is inactive", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.refresh(signRefreshToken())).rejects.toBeInstanceOf(UnauthorizedException);

      prisma.user.findUnique.mockResolvedValue(makeUser({ status: "suspended" }));
      await expect(service.refresh(signRefreshToken())).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("getRefreshTtlMs", () => {
    it.each([
      ["30d", 30 * 86_400_000],
      ["12h", 12 * 3_600_000],
      ["15m", 15 * 60_000],
      ["45s", 45_000],
      ["3600", 3_600_000], // bare number = seconds
    ])("parses %s", (ttl, expectedMs) => {
      const configService = { get: jest.fn().mockReturnValue({ ...JWT_CONFIG, refreshTtl: ttl }) };
      const svc = new AuthService(prisma as never, jwtService, configService as never);
      expect(svc.getRefreshTtlMs()).toBe(expectedMs);
    });

    it("falls back to 30 days on an unrecognized format", () => {
      const configService = { get: jest.fn().mockReturnValue({ ...JWT_CONFIG, refreshTtl: "next tuesday" }) };
      const svc = new AuthService(prisma as never, jwtService, configService as never);
      expect(svc.getRefreshTtlMs()).toBe(30 * 86_400_000);
    });
  });
});

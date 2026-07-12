import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import type { AuthResponse, JwtPayload, Role } from "@sms/shared-types";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import type { LoginDto } from "./dto/login.dto";

/**
 * Result of a successful login/refresh. `auth` is what goes in the JSON
 * response body; `refreshToken` is kept out of the body on purpose — the
 * controller transports it exclusively via the `sms_refresh` httpOnly
 * cookie.
 */
export interface AuthResult {
  auth: AuthResponse;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findFirst({
      where: {
        AND: [
          dto.schoolCode ? { school: { code: dto.schoolCode } } : {},
          {
            OR: [dto.email ? { email: dto.email } : undefined, dto.phone ? { phone: dto.phone } : undefined].filter(
              Boolean,
            ) as object[],
          },
        ],
      },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.status !== "active") {
      throw new UnauthorizedException("Account is not active");
    }

    const roles = user.userRoles.map((userRole) => userRole.role.name as Role);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      sub: user.id,
      schoolId: user.schoolId,
      roles,
    };

    const { accessToken, refreshToken } = this.issueTokens(payload);

    return {
      auth: {
        accessToken,
        user: {
          id: user.id,
          schoolId: user.schoolId,
          email: user.email,
          phone: user.phone,
          roles,
        },
      },
      refreshToken,
    };
  }

  async refresh(refreshTokenInput: string): Promise<AuthResult> {
    const jwtConfig = this.configService.get("jwt", { infer: true });

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshTokenInput, {
        secret: jwtConfig.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const roles = user.userRoles.map((userRole) => userRole.role.name as Role);
    const nextPayload: JwtPayload = { sub: user.id, schoolId: user.schoolId, roles };
    const { accessToken, refreshToken } = this.issueTokens(nextPayload);

    return {
      auth: {
        accessToken,
        user: {
          id: user.id,
          schoolId: user.schoolId,
          email: user.email,
          phone: user.phone,
          roles,
        },
      },
      refreshToken,
    };
  }

  /**
   * Lifetime of the refresh cookie in milliseconds, derived from the same
   * `JWT_REFRESH_TTL` config the refresh JWT itself is signed with, so the
   * cookie and the token inside it expire together. Supports the common
   * ms-style duration strings used in `.env` ("30d", "12h", "15m", "45s")
   * and plain numbers (seconds, matching jsonwebtoken's convention).
   */
  getRefreshTtlMs(): number {
    const ttl = this.configService.get("jwt", { infer: true }).refreshTtl;
    const match = /^(\d+)\s*(d|h|m|s)?$/i.exec(ttl.trim());
    if (!match) {
      // Unrecognized format — fall back to 30 days rather than crashing.
      return 30 * 24 * 60 * 60 * 1000;
    }
    const value = Number(match[1]);
    const unit = (match[2] ?? "s").toLowerCase();
    const unitMs: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000 };
    return value * unitMs[unit];
  }

  private issueTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const jwtConfig = this.configService.get("jwt", { infer: true });

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtConfig.accessSecret,
      expiresIn: jwtConfig.accessTtl,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: jwtConfig.refreshSecret,
      expiresIn: jwtConfig.refreshTtl,
    });

    return { accessToken, refreshToken };
  }
}

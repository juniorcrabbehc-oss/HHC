import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import type { AuthResponse, JwtPayload, Role } from "@sms/shared-types";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../prisma/prisma.service";
import type { LoginDto } from "./dto/login.dto";
import type { RefreshDto } from "./dto/refresh.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
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
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        schoolId: user.schoolId,
        email: user.email,
        phone: user.phone,
        roles,
      },
    };
  }

  async refresh(dto: RefreshDto): Promise<AuthResponse> {
    const jwtConfig = this.configService.get("jwt", { infer: true });

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
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
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        schoolId: user.schoolId,
        email: user.email,
        phone: user.phone,
        roles,
      },
    };
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

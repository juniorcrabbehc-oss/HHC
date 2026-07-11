import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AppConfig } from "../../../config/configuration";
import type { AuthenticatedUser } from "../../../common/types/authenticated-user";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("jwt", { infer: true }).accessSecret,
    });
  }

  validate(payload: AuthenticatedUser): AuthenticatedUser {
    if (!payload?.sub || !payload?.schoolId) {
      throw new UnauthorizedException("Invalid token payload");
    }
    return {
      sub: payload.sub,
      schoolId: payload.schoolId,
      roles: payload.roles ?? [],
    };
  }
}

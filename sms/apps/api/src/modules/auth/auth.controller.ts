import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response, CookieOptions } from "express";
import type { AuthResponse } from "@sms/shared-types";
import type { AppConfig } from "../../config/configuration";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";

/**
 * Name of the httpOnly cookie carrying the refresh token. Scoped to
 * `Path=/auth` so the browser only ever sends it to /auth/* endpoints
 * (refresh/logout), not with every API call.
 */
export const REFRESH_COOKIE_NAME = "sms_refresh";

/**
 * Strict per-IP throttle for the credential endpoints (login/refresh) to
 * slow credential stuffing — much tighter than the global 100/60s default
 * configured in `AppModule`.
 */
const AUTH_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    const { auth, refreshToken } = await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return auth;
  }

  /**
   * Reads the refresh token from the `sms_refresh` httpOnly cookie
   * (preferred). A token in the request body is still accepted as a
   * deprecated fallback for one release — older clients stored it in
   * localStorage — and will be removed after that. On success the refresh
   * token is rotated: a new cookie replaces the old one.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLE)
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[REFRESH_COOKIE_NAME] || dto.refreshToken;
    if (!token) {
      throw new UnauthorizedException("Missing refresh token");
    }

    const { auth, refreshToken } = await this.authService.refresh(token);
    this.setRefreshCookie(res, refreshToken);
    return auth;
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    // clearCookie must use the same name/path/flags the cookie was set
    // with, or the browser treats it as a different cookie and keeps the
    // original.
    const { maxAge: _maxAge, ...options } = this.refreshCookieOptions();
    res.clearCookie(REFRESH_COOKIE_NAME, options);
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, this.refreshCookieOptions());
  }

  private refreshCookieOptions(): CookieOptions {
    // `secure` only in production so localhost dev over plain http still
    // gets the cookie; in production the cookie is HTTPS-only.
    const isProduction = this.configService.get("nodeEnv", { infer: true }) === "production";
    return {
      httpOnly: true,
      sameSite: "lax",
      path: "/auth",
      secure: isProduction,
      maxAge: this.authService.getRefreshTtlMs(),
    };
  }
}

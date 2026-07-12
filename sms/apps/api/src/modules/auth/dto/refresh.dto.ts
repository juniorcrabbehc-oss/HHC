import { IsOptional, IsString, MinLength } from "class-validator";

/**
 * The refresh token is normally read from the `sms_refresh` httpOnly
 * cookie, not the body. The body field is a deprecated fallback kept for
 * one release so pre-cookie clients keep working; remove it after that.
 */
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}

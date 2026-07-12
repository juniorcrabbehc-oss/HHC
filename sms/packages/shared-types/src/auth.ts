import { z } from "zod";
import { roleSchema } from "./roles";

/**
 * Login request accepts either an email or a phone number (at least one
 * must be present) plus a password.
 */
export const loginRequestSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    password: z.string().min(1),
    schoolCode: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.email) || Boolean(data.phone), {
    message: "Either email or phone is required",
    path: ["email"],
  });

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Shape of the payload encoded inside an access/refresh JWT.
 */
export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  schoolId: z.string().uuid(),
  roles: z.array(roleSchema),
});

export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export const authUserSummarySchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  roles: z.array(roleSchema),
});

export type AuthUserSummary = z.infer<typeof authUserSummarySchema>;

/**
 * Response body for login/refresh. The refresh token is deliberately NOT
 * part of this payload — it travels only in the `sms_refresh` httpOnly
 * cookie (set/rotated by the API on login and refresh), so it never
 * touches JavaScript-accessible storage on the client.
 */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSummarySchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

/**
 * The refresh token is normally read from the `sms_refresh` httpOnly
 * cookie. The body field remains accepted as a deprecated fallback for
 * one release (older clients that still stored it in localStorage) and
 * will be removed after that.
 */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

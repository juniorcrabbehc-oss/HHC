import type { Role } from "@sms/shared-types";

/**
 * Shape attached to `req.user` by the JWT strategy after a token is
 * validated. Mirrors the JWT payload defined in @sms/shared-types.
 */
export interface AuthenticatedUser {
  sub: string;
  schoolId: string;
  roles: Role[];
}

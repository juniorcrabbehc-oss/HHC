import type { Role } from "@sms/shared-types";

/**
 * Roles that represent school staff with broad read access to learner /
 * guardian records, as opposed to `parent` (self-scoped) or `learner`.
 */
export const STAFF_ROLES: Role[] = ["admin", "teacher", "bursar", "front_office"];

export function hasAnyRole(userRoles: Role[], allowed: Role[]): boolean {
  return userRoles.some((role) => allowed.includes(role));
}

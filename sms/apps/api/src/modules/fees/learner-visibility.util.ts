import { STAFF_ROLES, hasAnyRole } from "../../common/constants/roles";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

export function isStaffActor(actor: AuthenticatedUser): boolean {
  return hasAnyRole(actor.roles, STAFF_ROLES);
}

/**
 * Prisma `where` fragment that, for a model with a `learner` relation,
 * restricts results to the actor's own linked learner(s) when the actor is
 * not staff. Staff (admin/teacher/bursar/front_office) get no restriction
 * (`{}`). Mirrors `ReportCardsService.findById`'s visibility check —
 * duplicated here (rather than imported cross-module) since fees lives in
 * its own module, same precedent as `assertTeacherCanAccessClass` being
 * duplicated between attendance and academics.
 */
export function learnerScopeWhere(actor: AuthenticatedUser) {
  if (isStaffActor(actor)) return {};
  return {
    learner: {
      OR: [{ learnerUserId: actor.sub }, { guardianLearners: { some: { guardian: { userId: actor.sub } } } }],
    },
  };
}

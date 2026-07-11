import { ForbiddenException } from "@nestjs/common";
import type { ClassSubject } from "@prisma/client";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

/**
 * Score-entry ownership check, deliberately narrower than attendance's
 * `assertTeacherCanAccessClass`: a teacher may only record CA/exam scores
 * for a `ClassSubject` they are personally assigned to teach
 * (`ClassSubject.teacherId`), not merely any subject in a class they
 * happen to be the homeroom teacher for. Admins bypass the check entirely.
 */
export function assertTeacherCanScoreClassSubject(classSubject: Pick<ClassSubject, "teacherId">, actor: AuthenticatedUser): void {
  if (actor.roles.includes("admin")) return;

  if (!actor.roles.includes("teacher")) {
    throw new ForbiddenException("Only teachers or admins can record scores");
  }

  if (classSubject.teacherId !== actor.sub) {
    throw new ForbiddenException("You are not assigned to teach this subject for this class");
  }
}

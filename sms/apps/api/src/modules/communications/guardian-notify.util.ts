import type { Guardian } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Guardians eligible for an automated SMS trigger: every guardian linked
 * to the learner, minus those who've opted out (`smsOptIn === false`) or
 * have no primary phone on file. Deliberately not narrowed to
 * "primary contact only" — a secondary guardian who wants absence/fee
 * alerts shouldn't be silently excluded, and `smsOptIn` is already the
 * per-guardian opt-out lever. Shared by every automated trigger
 * (absence, fee reminder, report card, payment received) so the opt-out
 * rule is enforced in exactly one place.
 */
export async function getNotifiableGuardians(prisma: PrismaService, schoolId: string, learnerId: string): Promise<Guardian[]> {
  const links = await prisma.guardianLearner.findMany({
    where: { schoolId, learnerId },
    include: { guardian: true },
  });
  return links.map((link) => link.guardian).filter((guardian) => guardian.smsOptIn && Boolean(guardian.phonePrimary));
}

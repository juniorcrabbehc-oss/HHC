import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { AuditService } from "../../common/audit/audit.service";
import { STAFF_ROLES, hasAnyRole } from "../../common/constants/roles";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { GenerateReportCardsDto } from "./dto/report-card.dto";
import { serializeReportCard } from "./academics.mapper";
import { findGradingBand, round2 } from "./grading.util";
import { REPORT_CARD_PUBLISHED_EVENT, type ReportCardPublishedEvent } from "./report-card.events";

interface SubjectItemComputation {
  subjectId: string;
  caTotal: number;
  examTotal: number;
  totalScore: number;
  grade: string;
  remark: string | null;
}

const REPORT_CARD_INCLUDE = {
  items: { include: { subject: true } },
  learner: true,
  term: true,
  class: true,
} as const;

/**
 * Report card generation/publishing.
 *
 * Position-in-class tie-breaking rule: standard competition ("1224")
 * ranking. Learners tied on `overallAverage` share the same
 * `positionInClass`, and the next distinct average skips ahead by the
 * number of tied learners (e.g. two learners tied at rank 1 are both
 * "1st", the next learner is "3rd", not "2nd"). Learners with no scorable
 * subjects (null `overallAverage`) are excluded from ranking entirely
 * (`positionInClass` stays null) rather than being tied-last, since "no
 * data" and "ranked last" are different facts.
 */
@Injectable()
export class ReportCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async generate(dto: GenerateReportCardsDto, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;

    await this.assertStaffCanAccessClass(dto.classId, actor);

    const classRecord = await this.prisma.class.findFirst({
      where: { id: dto.classId, schoolId },
      include: { level: true },
    });
    if (!classRecord) throw new BadRequestException(`Class ${dto.classId} not found`);

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new BadRequestException(`Term ${dto.termId} not found`);

    const assessmentConfig = await this.prisma.assessmentConfig.findFirst({
      where: { schoolId, academicYearId: classRecord.academicYearId, levelStage: classRecord.level.stage },
    });
    if (!assessmentConfig) {
      throw new BadRequestException(
        `No assessment config found for level ${classRecord.level.stage} in this academic year — configure CA/exam weights before generating report cards`,
      );
    }

    const gradingBands = await this.prisma.gradingBand.findMany({
      where: { schoolId, levelStage: classRecord.level.stage, isActive: true },
    });
    if (gradingBands.length === 0) {
      throw new BadRequestException(`No active grading bands configured for level ${classRecord.level.stage}`);
    }

    const caWeightFraction = Number(assessmentConfig.caWeightPct) / 100;
    const examWeightFraction = Number(assessmentConfig.examWeightPct) / 100;

    const [classSubjects, enrollments] = await Promise.all([
      this.prisma.classSubject.findMany({ where: { schoolId, classId: dto.classId } }),
      this.prisma.classEnrollment.findMany({
        where: { schoolId, classId: dto.classId, status: "active" },
        include: { learner: true },
      }),
    ]);

    const interim: { learnerId: string; reportCardId: string; overallAverage: number | null }[] = [];

    // Sequential per learner — same "small batch, several awaited lookups
    // each" reasoning as AttendanceService.markBulk. A class register is
    // tens of learners, not thousands.
    for (const enrollment of enrollments) {
      const learnerId = enrollment.learnerId;
      const items: SubjectItemComputation[] = [];

      for (const classSubject of classSubjects) {
        const [caEntries, examEntries] = await Promise.all([
          this.prisma.caScore.findMany({
            where: { schoolId, learnerId, classSubjectId: classSubject.id, termId: dto.termId },
          }),
          this.prisma.examScore.findMany({
            where: { schoolId, learnerId, classSubjectId: classSubject.id, termId: dto.termId },
          }),
        ]);

        if (caEntries.length === 0 && examEntries.length === 0) {
          // No scores recorded for this subject/term — omit it from the
          // report card rather than fabricating a zero.
          continue;
        }

        // Each CA entry contributes its own slice of the CA weight pool
        // (assessmentType weights are expected to sum to ~100 across a
        // subject's CA entries for a term — not enforced here, entry is
        // whatever the teacher recorded).
        const caRawPct = caEntries.reduce(
          (sum, entry) => sum + (Number(entry.scoreObtained) / Number(entry.maxScore)) * Number(entry.weightPct),
          0,
        );

        // Multiple exam entries (e.g. theory + practical) are averaged as
        // percentages rather than summed, since ExamScore carries no
        // per-entry weight of its own.
        const examRawPct =
          examEntries.length > 0
            ? examEntries.reduce((sum, entry) => sum + (Number(entry.scoreObtained) / Number(entry.maxScore)) * 100, 0) /
              examEntries.length
            : 0;

        const caTotal = round2(caRawPct * caWeightFraction);
        const examTotal = round2(examRawPct * examWeightFraction);
        const totalScore = round2(caTotal + examTotal);

        const band = findGradingBand(gradingBands, totalScore);

        items.push({
          subjectId: classSubject.subjectId,
          caTotal,
          examTotal,
          totalScore,
          grade: band?.grade ?? "N/A",
          remark: band?.remark ?? null,
        });
      }

      const overallAverage = items.length > 0 ? round2(items.reduce((sum, item) => sum + item.totalScore, 0) / items.length) : null;
      const overallBand = overallAverage !== null ? findGradingBand(gradingBands, overallAverage) : undefined;

      const reportCard = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.reportCard.findFirst({ where: { schoolId, learnerId, termId: dto.termId } });

        const rc = existing
          ? await tx.reportCard.update({
              where: { id: existing.id },
              data: {
                classId: dto.classId,
                overallAverage,
                overallGrade: overallBand?.grade ?? null,
              },
            })
          : await tx.reportCard.create({
              data: {
                schoolId,
                learnerId,
                termId: dto.termId,
                classId: dto.classId,
                overallAverage,
                overallGrade: overallBand?.grade ?? null,
                status: "draft",
              },
            });

        // Recompute items from scratch each generation run — simpler and
        // always consistent than diff-based upserting, and avoids stale
        // items lingering for subjects that no longer have any scores.
        await tx.reportCardItem.deleteMany({ where: { reportCardId: rc.id } });
        if (items.length > 0) {
          await tx.reportCardItem.createMany({
            data: items.map((item) => ({
              reportCardId: rc.id,
              subjectId: item.subjectId,
              caTotal: item.caTotal,
              examTotal: item.examTotal,
              totalScore: item.totalScore,
              grade: item.grade,
              remark: item.remark,
            })),
          });
        }

        return rc;
      });

      interim.push({ learnerId, reportCardId: reportCard.id, overallAverage });
    }

    await this.assignPositions(interim);

    return this.listByClassTerm(dto.classId, dto.termId, actor);
  }

  /** Standard competition ("1224") ranking — see class-level doc comment. */
  private async assignPositions(interim: { reportCardId: string; overallAverage: number | null }[]): Promise<void> {
    const ranked = interim
      .filter((entry) => entry.overallAverage !== null)
      .map((entry) => ({ reportCardId: entry.reportCardId, overallAverage: entry.overallAverage as number }))
      .sort((a, b) => b.overallAverage - a.overallAverage);

    const positions = new Map<string, number>();
    let previousAverage: number | null = null;
    let currentRank = 0;

    ranked.forEach((entry, index) => {
      const rankIfDistinct = index + 1;
      if (previousAverage === null || entry.overallAverage !== previousAverage) {
        currentRank = rankIfDistinct;
      }
      positions.set(entry.reportCardId, currentRank);
      previousAverage = entry.overallAverage;
    });

    await Promise.all(
      interim.map((entry) =>
        this.prisma.reportCard.update({
          where: { id: entry.reportCardId },
          data: { positionInClass: positions.get(entry.reportCardId) ?? null },
        }),
      ),
    );
  }

  async publish(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes("admin")) {
      throw new ForbiddenException("Only admins can publish report cards");
    }

    const schoolId = this.tenant.schoolId;
    const reportCard = await this.prisma.reportCard.findFirst({ where: { id, schoolId } });
    if (!reportCard) {
      throw new NotFoundException(`Report card ${id} not found`);
    }

    const updated = await this.prisma.reportCard.update({
      where: { id },
      data: { status: "published" },
      include: REPORT_CARD_INCLUDE,
    });

    // Publishing (unlike individual score entry) is low-volume and
    // meaningful enough to warrant an audit trail — it's the moment a
    // draft becomes visible to parents/learners.
    await this.auditService.log({
      schoolId,
      actorUserId: actor.sub,
      action: "REPORT_CARD_PUBLISHED",
      entityType: "ReportCard",
      entityId: id,
      diff: { learnerId: reportCard.learnerId, termId: reportCard.termId, classId: reportCard.classId },
    });

    // Fire-and-forget notification hook (Phase 5) — see
    // `report-card.events.ts` for why this is an event rather than a
    // direct call into a notifications service.
    const event: ReportCardPublishedEvent = {
      schoolId,
      reportCardId: updated.id,
      learnerId: reportCard.learnerId,
      termId: reportCard.termId,
      classId: reportCard.classId,
    };
    this.eventEmitter.emit(REPORT_CARD_PUBLISHED_EVENT, event);

    return serializeReportCard(updated);
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const isStaff = hasAnyRole(actor.roles, STAFF_ROLES);

    const reportCard = await this.prisma.reportCard.findFirst({
      where: {
        id,
        schoolId,
        // Non-staff (parent/learner) callers only see report cards linked
        // to their own learner — via GuardianLearner (parent) or the
        // learner's own `learnerUserId` (learner login). Staff bypass.
        ...(isStaff
          ? {}
          : {
              learner: {
                OR: [{ learnerUserId: actor.sub }, { guardianLearners: { some: { guardian: { userId: actor.sub } } } }],
              },
            }),
      },
      include: REPORT_CARD_INCLUDE,
    });

    if (!reportCard) {
      // 404, not 403 — same non-leaking pattern as Phase 1's LearnersService.
      throw new NotFoundException(`Report card ${id} not found`);
    }

    // Explicit, separate status check: a parent/learner must never see a
    // draft, even for their own linked learner. Kept apart from the query
    // filter above so "not visible because draft" reads distinctly from
    // "not visible because not your child" in the code, even though both
    // resolve to the same 404 response.
    if (!isStaff && reportCard.status !== "published") {
      throw new NotFoundException(`Report card ${id} not found`);
    }

    return serializeReportCard(reportCard);
  }

  async listByClassTerm(classId: string, termId: string, actor: AuthenticatedUser) {
    if (!hasAnyRole(actor.roles, STAFF_ROLES)) {
      throw new ForbiddenException("Only staff can list report cards for a class");
    }

    const schoolId = this.tenant.schoolId;
    const reportCards = await this.prisma.reportCard.findMany({
      where: { schoolId, classId, termId },
      include: REPORT_CARD_INCLUDE,
      orderBy: [{ positionInClass: "asc" }, { learner: { lastName: "asc" } }],
    });

    return reportCards.map(serializeReportCard);
  }

  /**
   * Admins can generate/view report cards for any class. Teachers are
   * restricted to classes where they're the homeroom `classTeacherId` or
   * hold a `ClassSubject` teaching assignment — same shape as
   * `AttendanceService.assertTeacherCanAccessClass`, duplicated here since
   * report cards live in a different module.
   */
  private async assertStaffCanAccessClass(classId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.roles.includes("admin")) return;

    if (!actor.roles.includes("teacher")) {
      throw new ForbiddenException("Only teachers or admins can generate report cards");
    }

    const schoolId = this.tenant.schoolId;
    const accessibleClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        schoolId,
        OR: [{ classTeacherId: actor.sub }, { classSubjects: { some: { teacherId: actor.sub } } }],
      },
    });

    if (!accessibleClass) {
      throw new ForbiddenException("You are not assigned to this class");
    }
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CaScore } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { MarkCaScoreDto } from "./dto/ca-score.dto";
import { serializeCaScore } from "./academics.mapper";
import { assertTeacherCanScoreClassSubject } from "./class-subject-access.util";
import type { ScoreRosterRow, ScoreSyncOutcome, ScoreSyncResultItem } from "./score-sync.types";

export type { ScoreSyncOutcome, ScoreSyncResultItem } from "./score-sync.types";

/**
 * Mirrors `AttendanceService`'s idempotent-by-`clientUuid` upsert shape.
 * Simpler than attendance's dedup though: `CaScore` has no secondary
 * business-key unique constraint (a learner can have many CA entries per
 * subject/term — one per `assessmentType`), so `clientUuid` alone is both
 * necessary and sufficient as the idempotency key.
 */
@Injectable()
export class CaScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async markOne(dto: MarkCaScoreDto, actor: AuthenticatedUser) {
    const { record } = await this.upsertOne(dto, actor);
    return serializeCaScore(record);
  }

  async markBulk(dtos: MarkCaScoreDto[], actor: AuthenticatedUser): Promise<ScoreSyncResultItem[]> {
    const results: ScoreSyncResultItem[] = [];

    // Sequential on purpose — same reasoning as AttendanceService.markBulk:
    // batches are one class/subject's worth of entries, not thousands.
    for (const dto of dtos) {
      try {
        const { record, outcome } = await this.upsertOne(dto, actor);
        results.push({ clientUuid: dto.clientUuid, status: outcome, id: record.id });
      } catch (error) {
        results.push({
          clientUuid: dto.clientUuid,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  private async upsertOne(dto: MarkCaScoreDto, actor: AuthenticatedUser): Promise<{ record: CaScore; outcome: ScoreSyncOutcome }> {
    const schoolId = this.tenant.schoolId;

    const existingByClientUuid = await this.prisma.caScore.findUnique({
      where: { clientUuid: dto.clientUuid },
    });
    if (existingByClientUuid) {
      if (existingByClientUuid.schoolId !== schoolId) {
        throw new ForbiddenException("clientUuid belongs to a different school");
      }
      return { record: existingByClientUuid, outcome: "unchanged" };
    }

    const [learner, classSubject, term] = await Promise.all([
      this.prisma.learner.findFirst({ where: { id: dto.learnerId, schoolId } }),
      this.prisma.classSubject.findFirst({ where: { id: dto.classSubjectId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } }),
    ]);

    if (!learner) throw new BadRequestException(`Learner ${dto.learnerId} not found`);
    if (!classSubject) throw new BadRequestException(`Class subject ${dto.classSubjectId} not found`);
    if (!term) throw new BadRequestException(`Term ${dto.termId} not found`);

    assertTeacherCanScoreClassSubject(classSubject, actor);

    const activeEnrollment = await this.prisma.classEnrollment.findFirst({
      where: { schoolId, learnerId: dto.learnerId, classId: classSubject.classId, status: "active" },
    });
    if (!activeEnrollment) {
      throw new BadRequestException(`Learner ${dto.learnerId} is not actively enrolled in the class for this subject`);
    }

    try {
      const created = await this.prisma.caScore.create({
        data: {
          schoolId,
          learnerId: dto.learnerId,
          classSubjectId: dto.classSubjectId,
          termId: dto.termId,
          assessmentType: dto.assessmentType,
          maxScore: dto.maxScore,
          scoreObtained: dto.scoreObtained,
          weightPct: dto.weightPct,
          recordedBy: actor.sub,
          clientUuid: dto.clientUuid,
        },
      });
      return { record: created, outcome: "created" };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Lost a race with a concurrent request using the same clientUuid.
        const raced = await this.prisma.caScore.findUnique({ where: { clientUuid: dto.clientUuid } });
        if (raced) return { record: raced, outcome: "unchanged" };
      }
      throw error;
    }
  }

  async list(
    classSubjectId: string,
    termId: string,
    actor: AuthenticatedUser,
  ): Promise<ScoreRosterRow<ReturnType<typeof serializeCaScore>>[]> {
    const schoolId = this.tenant.schoolId;

    const classSubject = await this.prisma.classSubject.findFirst({
      where: { id: classSubjectId, schoolId },
    });
    if (!classSubject) {
      throw new NotFoundException(`Class subject ${classSubjectId} not found`);
    }
    assertTeacherCanScoreClassSubject(classSubject, actor);

    const [roster, scores] = await Promise.all([
      this.prisma.classEnrollment.findMany({
        where: { schoolId, classId: classSubject.classId, status: "active" },
        include: { learner: true },
      }),
      this.prisma.caScore.findMany({
        where: { schoolId, classSubjectId, termId },
      }),
    ]);

    const scoresByLearner = new Map<string, CaScore[]>();
    for (const score of scores) {
      const list = scoresByLearner.get(score.learnerId) ?? [];
      list.push(score);
      scoresByLearner.set(score.learnerId, list);
    }

    return roster
      .map((enrollment) => ({
        learnerId: enrollment.learnerId,
        firstName: enrollment.learner.firstName,
        lastName: enrollment.learner.lastName,
        admissionNumber: enrollment.learner.admissionNumber,
        scores: (scoresByLearner.get(enrollment.learnerId) ?? []).map(serializeCaScore),
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }
}

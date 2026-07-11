import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AttendanceRecord } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { STAFF_ROLES, hasAnyRole } from "../../common/constants/roles";
import { toDateOnly } from "../../common/utils/date";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto";
import { serializeAttendanceRecord, toPrismaSource, toPrismaStatus } from "./attendance.mapper";

export type SyncOutcome = "created" | "updated" | "unchanged";

export interface AttendanceSyncResultItem {
  clientUuid: string;
  status: SyncOutcome | "failed";
  id?: string;
  errorMessage?: string;
}

export interface RegisterRow {
  learnerId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  record: ReturnType<typeof serializeAttendanceRecord> | null;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async markOne(dto: MarkAttendanceDto, actor: AuthenticatedUser) {
    const { record } = await this.upsertOne(dto, actor);
    return serializeAttendanceRecord(record);
  }

  async markBulk(dtos: MarkAttendanceDto[], actor: AuthenticatedUser): Promise<AttendanceSyncResultItem[]> {
    const results: AttendanceSyncResultItem[] = [];

    // Sequential on purpose: batches are a single class register (tens of
    // rows, not thousands), each item does several awaited lookups, and
    // processing in order keeps error isolation per-item simple to reason
    // about. Not parallelized to avoid hammering the DB connection pool.
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

  /**
   * Idempotent upsert with two layers of dedup, per the offline-sync design:
   *  1. `clientUuid` — an exact replay of the same client-generated write
   *     returns the existing row untouched ("unchanged").
   *  2. `[schoolId, learnerId, date]` — the business key. If a *different*
   *     clientUuid collides with an existing same-day record for that
   *     learner (e.g. the teacher corrected a mark and it re-synced under a
   *     new clientUuid), the existing row is updated in place rather than
   *     erroring, mirroring the admissionNumber P2002-as-update precedent
   *     from the learners module.
   */
  private async upsertOne(
    dto: MarkAttendanceDto,
    actor: AuthenticatedUser,
  ): Promise<{ record: AttendanceRecord; outcome: SyncOutcome }> {
    const schoolId = this.tenant.schoolId;

    const existingByClientUuid = await this.prisma.attendanceRecord.findUnique({
      where: { clientUuid: dto.clientUuid },
    });
    if (existingByClientUuid) {
      if (existingByClientUuid.schoolId !== schoolId) {
        throw new ForbiddenException("clientUuid belongs to a different school");
      }
      return { record: existingByClientUuid, outcome: "unchanged" };
    }

    const [learner, classRecord, term] = await Promise.all([
      this.prisma.learner.findFirst({ where: { id: dto.learnerId, schoolId } }),
      this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } }),
      this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } }),
    ]);

    if (!learner) throw new BadRequestException(`Learner ${dto.learnerId} not found`);
    if (!classRecord) throw new BadRequestException(`Class ${dto.classId} not found`);
    if (!term) throw new BadRequestException(`Term ${dto.termId} not found`);

    await this.assertTeacherCanAccessClass(dto.classId, actor);

    const activeEnrollment = await this.prisma.classEnrollment.findFirst({
      where: { schoolId, learnerId: dto.learnerId, classId: dto.classId, status: "active" },
    });
    if (!activeEnrollment) {
      throw new BadRequestException(`Learner ${dto.learnerId} is not actively enrolled in class ${dto.classId}`);
    }

    const date = toDateOnly(dto.date);

    try {
      const created = await this.prisma.attendanceRecord.create({
        data: {
          schoolId,
          classId: dto.classId,
          learnerId: dto.learnerId,
          termId: dto.termId,
          date,
          status: toPrismaStatus(dto.status),
          recordedBy: actor.sub,
          source: toPrismaSource(dto.source),
          clientUuid: dto.clientUuid,
          notes: dto.notes,
        },
      });
      return { record: created, outcome: "created" };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]).join(",") : String(error.meta?.target ?? "");

        if (target.includes("clientUuid")) {
          // Lost a race with a concurrent request using the same clientUuid.
          const raced = await this.prisma.attendanceRecord.findUnique({ where: { clientUuid: dto.clientUuid } });
          if (raced) return { record: raced, outcome: "unchanged" };
          throw error;
        }

        // Business-key collision on [schoolId, learnerId, date]: update the
        // existing same-day record instead of failing the sync.
        const updated = await this.prisma.attendanceRecord.update({
          where: { schoolId_learnerId_date: { schoolId, learnerId: dto.learnerId, date } },
          data: {
            classId: dto.classId,
            termId: dto.termId,
            status: toPrismaStatus(dto.status),
            recordedBy: actor.sub,
            source: toPrismaSource(dto.source),
            clientUuid: dto.clientUuid,
            notes: dto.notes,
          },
        });
        return { record: updated, outcome: "updated" };
      }
      throw error;
    }
  }

  async getRegister(classId: string, date: string, actor: AuthenticatedUser): Promise<RegisterRow[]> {
    const schoolId = this.tenant.schoolId;

    if (!hasAnyRole(actor.roles, ["admin", "teacher"])) {
      throw new ForbiddenException("Only teachers or admins can view a class register");
    }
    await this.assertTeacherCanAccessClass(classId, actor);

    const dateOnly = toDateOnly(date);

    const [roster, records] = await Promise.all([
      this.prisma.classEnrollment.findMany({
        where: { schoolId, classId, status: "active" },
        include: { learner: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { schoolId, classId, date: dateOnly },
      }),
    ]);

    const recordsByLearnerId = new Map(records.map((record) => [record.learnerId, record]));

    return roster
      .map((enrollment) => ({
        learnerId: enrollment.learnerId,
        firstName: enrollment.learner.firstName,
        lastName: enrollment.learner.lastName,
        admissionNumber: enrollment.learner.admissionNumber,
        record: recordsByLearnerId.has(enrollment.learnerId)
          ? serializeAttendanceRecord(recordsByLearnerId.get(enrollment.learnerId)!)
          : null,
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }

  async getLearnerHistory(learnerId: string, from: string | undefined, to: string | undefined, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const isStaff = hasAnyRole(actor.roles, STAFF_ROLES);

    const learner = await this.prisma.learner.findFirst({
      where: {
        id: learnerId,
        schoolId,
        ...(isStaff
          ? {}
          : {
              guardianLearners: { some: { guardian: { userId: actor.sub } } },
            }),
      },
    });

    if (!learner) {
      // 404, not 403 — same non-leaking pattern as Phase 1's LearnersService.
      throw new NotFoundException(`Learner ${learnerId} not found`);
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        schoolId,
        learnerId,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: toDateOnly(from) } : {}),
                ...(to ? { lte: toDateOnly(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "desc" },
    });

    return records.map(serializeAttendanceRecord);
  }

  /**
   * Admins can mark/view attendance for any class in the school. Teachers
   * are restricted to classes where they're the homeroom `classTeacherId`
   * or hold a `ClassSubject` teaching assignment for that class.
   */
  private async assertTeacherCanAccessClass(classId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.roles.includes("admin")) return;

    if (!actor.roles.includes("teacher")) {
      throw new ForbiddenException("Only teachers or admins can access this class's attendance");
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

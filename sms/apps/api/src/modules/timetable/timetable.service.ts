import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { TimetableSlot } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { STAFF_ROLES, hasAnyRole } from "../../common/constants/roles";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CreateTimetableSlotDto, UpdateTimetableSlotDto } from "./dto/timetable-slot.dto";

/** Everything a timetable cell needs to render, in one query. */
const SLOT_INCLUDE = {
  subject: true,
  period: true,
  room: true,
  teacher: { select: { id: true, email: true, phone: true } },
  class: { select: { id: true, name: true } },
} satisfies Prisma.TimetableSlotInclude;

interface SlotPlacement {
  academicYearId: string;
  classId: string;
  dayOfWeek: number;
  periodId: string;
  teacherId: string | null;
  roomId: string | null;
  excludeSlotId?: string;
}

@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async createSlot(dto: CreateTimetableSlotDto): Promise<TimetableSlot> {
    const schoolId = this.tenant.schoolId;

    const classRecord = await this.prisma.class.findFirst({
      where: { id: dto.classId, schoolId },
    });
    if (!classRecord) {
      throw new NotFoundException(`Class ${dto.classId} not found`);
    }

    const subject = await this.prisma.subject.findFirst({
      where: { id: dto.subjectId, schoolId },
    });
    if (!subject) {
      throw new NotFoundException(`Subject ${dto.subjectId} not found`);
    }

    const period = await this.prisma.period.findFirst({
      where: { id: dto.periodId, schoolId },
    });
    if (!period) {
      throw new NotFoundException(`Period ${dto.periodId} not found`);
    }
    if (period.isBreak) {
      throw new BadRequestException(`"${period.name}" is a break period; lessons cannot be scheduled in it`);
    }

    // Omitted teacherId falls back to the subject teacher on ClassSubject;
    // explicit null means "deliberately unassigned".
    let teacherId: string | null;
    if (dto.teacherId === undefined) {
      const classSubject = await this.prisma.classSubject.findFirst({
        where: { classId: dto.classId, subjectId: dto.subjectId },
      });
      teacherId = classSubject?.teacherId ?? null;
    } else {
      teacherId = dto.teacherId;
      if (teacherId) await this.assertTeacherExists(teacherId);
    }

    if (dto.roomId) await this.assertRoomExists(dto.roomId);

    await this.assertNoConflicts({
      academicYearId: classRecord.academicYearId,
      classId: dto.classId,
      dayOfWeek: dto.dayOfWeek,
      periodId: dto.periodId,
      teacherId,
      roomId: dto.roomId ?? null,
    });

    try {
      return await this.prisma.timetableSlot.create({
        data: {
          schoolId,
          academicYearId: classRecord.academicYearId,
          classId: dto.classId,
          subjectId: dto.subjectId,
          teacherId,
          roomId: dto.roomId ?? null,
          periodId: dto.periodId,
          dayOfWeek: dto.dayOfWeek,
        },
        include: SLOT_INCLUDE,
      });
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  async updateSlot(id: string, dto: UpdateTimetableSlotDto): Promise<TimetableSlot> {
    const slot = await this.findSlotOrThrow(id);

    if (dto.subjectId !== undefined) {
      const subject = await this.prisma.subject.findFirst({
        where: { id: dto.subjectId, schoolId: this.tenant.schoolId },
      });
      if (!subject) {
        throw new NotFoundException(`Subject ${dto.subjectId} not found`);
      }
    }
    if (dto.periodId !== undefined) {
      const period = await this.prisma.period.findFirst({
        where: { id: dto.periodId, schoolId: this.tenant.schoolId },
      });
      if (!period) {
        throw new NotFoundException(`Period ${dto.periodId} not found`);
      }
      if (period.isBreak) {
        throw new BadRequestException(`"${period.name}" is a break period; lessons cannot be scheduled in it`);
      }
    }
    if (dto.teacherId) await this.assertTeacherExists(dto.teacherId);
    if (dto.roomId) await this.assertRoomExists(dto.roomId);

    const next = {
      dayOfWeek: dto.dayOfWeek ?? slot.dayOfWeek,
      periodId: dto.periodId ?? slot.periodId,
      teacherId: dto.teacherId !== undefined ? dto.teacherId : slot.teacherId,
      roomId: dto.roomId !== undefined ? dto.roomId : slot.roomId,
    };

    await this.assertNoConflicts({
      academicYearId: slot.academicYearId,
      classId: slot.classId,
      dayOfWeek: next.dayOfWeek,
      periodId: next.periodId,
      teacherId: next.teacherId,
      roomId: next.roomId,
      excludeSlotId: id,
    });

    try {
      return await this.prisma.timetableSlot.update({
        where: { id },
        data: {
          ...(dto.subjectId !== undefined ? { subjectId: dto.subjectId } : {}),
          dayOfWeek: next.dayOfWeek,
          periodId: next.periodId,
          teacherId: next.teacherId,
          roomId: next.roomId,
        },
        include: SLOT_INCLUDE,
      });
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  async deleteSlot(id: string): Promise<TimetableSlot> {
    await this.findSlotOrThrow(id);
    return this.prisma.timetableSlot.delete({ where: { id } });
  }

  /**
   * Class timetable grid. Staff see any class; parents/learners only a class
   * one of their linked learners is enrolled in.
   */
  async getClassTimetable(classId: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const classRecord = await this.prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, name: true, academicYearId: true },
    });
    if (!classRecord) {
      throw new NotFoundException(`Class ${classId} not found`);
    }

    if (!hasAnyRole(actor.roles, STAFF_ROLES)) {
      const enrollment = await this.prisma.classEnrollment.findFirst({
        where: {
          classId,
          schoolId,
          learner: {
            OR: [
              { learnerUserId: actor.sub },
              { guardianLearners: { some: { guardian: { userId: actor.sub } } } },
            ],
          },
        },
      });
      if (!enrollment) {
        throw new ForbiddenException("You can only view the timetable of your own child's class");
      }
    }

    const slots = await this.prisma.timetableSlot.findMany({
      where: { classId, schoolId },
      include: SLOT_INCLUDE,
      orderBy: [{ dayOfWeek: "asc" }, { period: { sortOrder: "asc" } }],
    });
    return { class: classRecord, slots };
  }

  /**
   * Parent/learner home view: one timetable per class the actor's linked
   * learner(s) are actively enrolled in, so the UI needs no class picker.
   */
  async getMyClassTimetables(actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        schoolId,
        status: "active",
        // Only the running year — learners keep historical enrollments
        // (e.g. last year's class), which must not surface here.
        academicYear: { isCurrent: true },
        learner: {
          OR: [
            { learnerUserId: actor.sub },
            { guardianLearners: { some: { guardian: { userId: actor.sub } } } },
          ],
        },
      },
      include: {
        class: { select: { id: true, name: true } },
        learner: { select: { firstName: true, lastName: true } },
      },
    });

    const byClass = new Map<string, { class: { id: string; name: string }; learnerNames: string[] }>();
    for (const enrollment of enrollments) {
      const entry = byClass.get(enrollment.classId) ?? { class: enrollment.class, learnerNames: [] };
      entry.learnerNames.push(`${enrollment.learner.firstName} ${enrollment.learner.lastName}`);
      byClass.set(enrollment.classId, entry);
    }

    return Promise.all(
      [...byClass.values()].map(async (entry) => ({
        ...entry,
        slots: await this.prisma.timetableSlot.findMany({
          where: { classId: entry.class.id, schoolId },
          include: SLOT_INCLUDE,
          orderBy: [{ dayOfWeek: "asc" }, { period: { sortOrder: "asc" } }],
        }),
      })),
    );
  }

  /** A teacher's own weekly timetable (or any teacher's, for admins). */
  async getTeacherTimetable(teacherId: string) {
    const slots = await this.prisma.timetableSlot.findMany({
      where: { teacherId, schoolId: this.tenant.schoolId },
      include: SLOT_INCLUDE,
      orderBy: [{ dayOfWeek: "asc" }, { period: { sortOrder: "asc" } }],
    });
    return { teacherId, slots };
  }

  private async findSlotOrThrow(id: string): Promise<TimetableSlot> {
    const slot = await this.prisma.timetableSlot.findFirst({
      where: { id, schoolId: this.tenant.schoolId },
    });
    if (!slot) {
      throw new NotFoundException(`Timetable slot ${id} not found`);
    }
    return slot;
  }

  private async assertTeacherExists(teacherId: string): Promise<void> {
    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, schoolId: this.tenant.schoolId },
    });
    if (!teacher) {
      throw new NotFoundException(`Teacher ${teacherId} not found`);
    }
  }

  private async assertRoomExists(roomId: string): Promise<void> {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, schoolId: this.tenant.schoolId },
    });
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
  }

  /**
   * The three double-booking rules, checked in one query: a class, a teacher,
   * and a room can each hold at most one lesson per (day, period) within an
   * academic year. The DB unique indexes are the race-proof backstop;
   * this pre-check exists to produce actionable 409 messages.
   */
  private async assertNoConflicts(placement: SlotPlacement): Promise<void> {
    const dimensions: Prisma.TimetableSlotWhereInput[] = [{ classId: placement.classId }];
    if (placement.teacherId) {
      dimensions.push({ academicYearId: placement.academicYearId, teacherId: placement.teacherId });
    }
    if (placement.roomId) {
      dimensions.push({ academicYearId: placement.academicYearId, roomId: placement.roomId });
    }

    const clashes = await this.prisma.timetableSlot.findMany({
      where: {
        dayOfWeek: placement.dayOfWeek,
        periodId: placement.periodId,
        ...(placement.excludeSlotId ? { id: { not: placement.excludeSlotId } } : {}),
        OR: dimensions,
      },
      include: {
        class: { select: { name: true } },
        subject: { select: { name: true } },
      },
    });
    if (clashes.length === 0) return;

    const reasons: string[] = [];
    const classClash = clashes.find((c) => c.classId === placement.classId);
    if (classClash) {
      reasons.push(`${classClash.class.name} already has ${classClash.subject.name} in this slot`);
    }
    const teacherClash = placement.teacherId
      ? clashes.find((c) => c.teacherId === placement.teacherId && c.classId !== placement.classId)
      : undefined;
    if (teacherClash) {
      reasons.push(`the teacher is already taking ${teacherClash.class.name} for ${teacherClash.subject.name}`);
    }
    const roomClash = placement.roomId
      ? clashes.find((c) => c.roomId === placement.roomId && c.classId !== placement.classId)
      : undefined;
    if (roomClash) {
      reasons.push(`the room is already used by ${roomClash.class.name} for ${roomClash.subject.name}`);
    }

    // A clash can be on a dimension we matched but classified under another
    // (e.g. teacher clash inside the same class row) — never let it pass.
    if (reasons.length === 0) {
      reasons.push("another lesson already occupies this slot");
    }
    throw new ConflictException(`Timetable conflict: ${reasons.join("; ")}`);
  }

  /** Backstop for races that slip past the pre-check. */
  private translateUniqueViolation(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new ConflictException("Timetable conflict: another lesson already occupies this slot");
    }
    return error;
  }
}

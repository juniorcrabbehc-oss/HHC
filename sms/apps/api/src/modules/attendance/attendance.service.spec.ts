import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AttendanceRecord } from "@prisma/client";
import { AttendanceService } from "./attendance.service";
import { ATTENDANCE_MARKED_EVENT } from "./attendance.events";
import type { MarkAttendanceDto } from "./dto/mark-attendance.dto";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

const SCHOOL_ID = "school-1";

const admin: AuthenticatedUser = { sub: "user-admin", schoolId: SCHOOL_ID, roles: ["admin"] };
const teacher: AuthenticatedUser = { sub: "user-teacher", schoolId: SCHOOL_ID, roles: ["teacher"] };
const bursar: AuthenticatedUser = { sub: "user-bursar", schoolId: SCHOOL_ID, roles: ["bursar"] };

function makeDto(overrides: Partial<MarkAttendanceDto> = {}): MarkAttendanceDto {
  return {
    clientUuid: "11111111-1111-4111-8111-111111111111",
    classId: "class-1",
    learnerId: "learner-1",
    termId: "term-1",
    date: "2026-07-10",
    status: "present",
    source: "offline_sync",
    ...overrides,
  };
}

function makeRecord(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: "rec-1",
    schoolId: SCHOOL_ID,
    classId: "class-1",
    learnerId: "learner-1",
    termId: "term-1",
    date: new Date("2026-07-10T00:00:00.000Z"),
    status: "PRESENT",
    recordedBy: "user-admin",
    source: "OFFLINE_SYNC",
    clientUuid: "11111111-1111-4111-8111-111111111111",
    notes: null,
    ...overrides,
  } as AttendanceRecord;
}

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target },
  });
}

type MockPrisma = {
  attendanceRecord: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  learner: { findFirst: jest.Mock };
  class: { findFirst: jest.Mock };
  term: { findFirst: jest.Mock };
  classEnrollment: { findFirst: jest.Mock; findMany: jest.Mock };
};

describe("AttendanceService", () => {
  let prisma: MockPrisma;
  let emitter: { emit: jest.Mock };
  let service: AttendanceService;

  beforeEach(() => {
    prisma = {
      attendanceRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      learner: { findFirst: jest.fn().mockResolvedValue({ id: "learner-1", schoolId: SCHOOL_ID }) },
      class: { findFirst: jest.fn().mockResolvedValue({ id: "class-1", schoolId: SCHOOL_ID }) },
      term: { findFirst: jest.fn().mockResolvedValue({ id: "term-1", schoolId: SCHOOL_ID }) },
      classEnrollment: {
        findFirst: jest.fn().mockResolvedValue({ id: "enr-1", status: "active" }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    emitter = { emit: jest.fn() };
    const tenant = { schoolId: SCHOOL_ID };
    service = new AttendanceService(prisma as never, tenant as never, emitter as never);
  });

  describe("clientUuid idempotency", () => {
    it("returns the existing record as 'unchanged' on exact replay, without creating or emitting", async () => {
      const existing = makeRecord();
      prisma.attendanceRecord.findUnique.mockResolvedValue(existing);

      const results = await service.markBulk([makeDto()], admin);

      expect(results).toEqual([{ clientUuid: makeDto().clientUuid, status: "unchanged", id: "rec-1" }]);
      expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
      expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it("rejects a clientUuid that belongs to a different school with ForbiddenException", async () => {
      prisma.attendanceRecord.findUnique.mockResolvedValue(makeRecord({ schoolId: "school-OTHER" }));

      await expect(service.markOne(makeDto(), admin)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    });
  });

  describe("create path", () => {
    it("creates a new record ('created'), normalizes the date, and emits the marked event", async () => {
      const created = makeRecord();
      prisma.attendanceRecord.create.mockResolvedValue(created);

      const result = await service.markOne(makeDto({ date: "2026-07-10T08:15:00.000Z" }), admin);

      expect(result.id).toBe("rec-1");
      expect(result.status).toBe("present");
      const createArgs = prisma.attendanceRecord.create.mock.calls[0][0];
      expect(createArgs.data.date).toEqual(new Date("2026-07-10T00:00:00.000Z"));
      expect(createArgs.data.schoolId).toBe(SCHOOL_ID);
      expect(createArgs.data.recordedBy).toBe(admin.sub);
      expect(emitter.emit).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledWith(
        ATTENDANCE_MARKED_EVENT,
        expect.objectContaining({ schoolId: SCHOOL_ID, learnerId: "learner-1", recordId: "rec-1" }),
      );
    });
  });

  describe("P2002 handling", () => {
    it("converts a business-key [schoolId, learnerId, date] collision into an update ('updated') and emits", async () => {
      prisma.attendanceRecord.create.mockRejectedValue(p2002(["schoolId", "learnerId", "date"]));
      prisma.attendanceRecord.update.mockResolvedValue(makeRecord({ status: "ABSENT" }));

      const results = await service.markBulk([makeDto({ status: "absent" })], admin);

      expect(results[0].status).toBe("updated");
      const updateArgs = prisma.attendanceRecord.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({
        schoolId_learnerId_date: {
          schoolId: SCHOOL_ID,
          learnerId: "learner-1",
          date: new Date("2026-07-10T00:00:00.000Z"),
        },
      });
      expect(updateArgs.data.status).toBe("ABSENT");
      expect(emitter.emit).toHaveBeenCalledTimes(1);
    });

    it("re-fetches on a clientUuid race and reports 'unchanged' without emitting", async () => {
      const raced = makeRecord();
      prisma.attendanceRecord.create.mockRejectedValue(p2002(["clientUuid"]));
      // First findUnique (pre-check) misses, second (post-race re-fetch) hits.
      prisma.attendanceRecord.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(raced);

      const results = await service.markBulk([makeDto()], admin);

      expect(results[0]).toEqual({ clientUuid: makeDto().clientUuid, status: "unchanged", id: "rec-1" });
      expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    });
  });

  describe("markBulk error isolation", () => {
    it("continues past a failing item and reports per-item statuses", async () => {
      const failing = makeDto({ clientUuid: "22222222-2222-4222-8222-222222222222", learnerId: "learner-missing" });
      const succeeding = makeDto();

      prisma.learner.findFirst.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === "learner-1" ? { id: "learner-1", schoolId: SCHOOL_ID } : null),
      );
      prisma.attendanceRecord.create.mockResolvedValue(makeRecord());

      const results = await service.markBulk([failing, succeeding], admin);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        clientUuid: failing.clientUuid,
        status: "failed",
        errorMessage: expect.stringContaining("learner-missing"),
      });
      expect(results[1]).toMatchObject({ clientUuid: succeeding.clientUuid, status: "created", id: "rec-1" });
      expect(prisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("teacher ownership", () => {
    it("rejects a teacher not assigned to the class with ForbiddenException", async () => {
      // First class.findFirst call is the existence lookup; the second is
      // the ownership check (classTeacherId / classSubjects filter) — the
      // teacher has no assignment, so it comes back empty.
      prisma.class.findFirst
        .mockResolvedValueOnce({ id: "class-1", schoolId: SCHOOL_ID })
        .mockResolvedValueOnce(null);

      await expect(service.markOne(makeDto(), teacher)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    });

    it("allows an assigned teacher (ownership query includes the teacher filter)", async () => {
      prisma.class.findFirst
        .mockResolvedValueOnce({ id: "class-1", schoolId: SCHOOL_ID })
        .mockResolvedValueOnce({ id: "class-1", schoolId: SCHOOL_ID });
      prisma.attendanceRecord.create.mockResolvedValue(makeRecord({ recordedBy: teacher.sub }));

      await service.markOne(makeDto(), teacher);

      const ownershipWhere = prisma.class.findFirst.mock.calls[1][0].where;
      expect(ownershipWhere.OR).toEqual([
        { classTeacherId: teacher.sub },
        { classSubjects: { some: { teacherId: teacher.sub } } },
      ]);
    });

    it("admin bypasses the ownership check entirely", async () => {
      prisma.attendanceRecord.create.mockResolvedValue(makeRecord());

      await service.markOne(makeDto(), admin);

      // Only the existence lookup — no second ownership query.
      expect(prisma.class.findFirst).toHaveBeenCalledTimes(1);
    });

    it("rejects staff who are neither teacher nor admin", async () => {
      await expect(service.markOne(makeDto(), bursar)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("referential validation", () => {
    it("rejects a learner not actively enrolled in the class", async () => {
      prisma.classEnrollment.findFirst.mockResolvedValue(null);

      await expect(service.markOne(makeDto(), admin)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
    });
  });
});

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TimetableService } from "./timetable.service";
import type { CreateTimetableSlotDto } from "./dto/timetable-slot.dto";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

const SCHOOL_ID = "school-1";
const YEAR_ID = "year-1";

const admin: AuthenticatedUser = { sub: "user-admin", schoolId: SCHOOL_ID, roles: ["admin"] };
const parent: AuthenticatedUser = { sub: "user-parent", schoolId: SCHOOL_ID, roles: ["parent"] };

function makeDto(overrides: Partial<CreateTimetableSlotDto> = {}): CreateTimetableSlotDto {
  return {
    classId: "class-1",
    subjectId: "subject-1",
    periodId: "period-1",
    dayOfWeek: 1,
    teacherId: "teacher-1",
    roomId: "room-1",
    ...overrides,
  };
}

function makeClash(overrides: Record<string, unknown> = {}) {
  return {
    id: "slot-existing",
    classId: "class-2",
    teacherId: "teacher-9",
    roomId: "room-9",
    class: { name: "JHS 1A" },
    subject: { name: "Mathematics" },
    ...overrides,
  };
}

type MockPrisma = {
  class: { findFirst: jest.Mock };
  subject: { findFirst: jest.Mock };
  period: { findFirst: jest.Mock };
  user: { findFirst: jest.Mock };
  room: { findFirst: jest.Mock };
  classSubject: { findFirst: jest.Mock };
  classEnrollment: { findFirst: jest.Mock };
  timetableSlot: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

describe("TimetableService", () => {
  let prisma: MockPrisma;
  let service: TimetableService;

  beforeEach(() => {
    prisma = {
      class: {
        findFirst: jest.fn().mockResolvedValue({ id: "class-1", schoolId: SCHOOL_ID, academicYearId: YEAR_ID, name: "Primary 1A" }),
      },
      subject: { findFirst: jest.fn().mockResolvedValue({ id: "subject-1", schoolId: SCHOOL_ID, name: "English" }) },
      period: {
        findFirst: jest.fn().mockResolvedValue({ id: "period-1", schoolId: SCHOOL_ID, name: "Period 1", isBreak: false }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "teacher-1", schoolId: SCHOOL_ID }) },
      room: { findFirst: jest.fn().mockResolvedValue({ id: "room-1", schoolId: SCHOOL_ID }) },
      classSubject: { findFirst: jest.fn().mockResolvedValue({ id: "cs-1", teacherId: "teacher-cs" }) },
      classEnrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      timetableSlot: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "slot-new", ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "slot-1", ...data })),
        delete: jest.fn(),
      },
    };
    const tenant = { schoolId: SCHOOL_ID };
    service = new TimetableService(prisma as never, tenant as never);
  });

  describe("createSlot conflict detection", () => {
    it("creates a slot when no clash exists on any dimension", async () => {
      const slot = await service.createSlot(makeDto());

      expect(prisma.timetableSlot.create).toHaveBeenCalledTimes(1);
      expect(slot).toMatchObject({ classId: "class-1", teacherId: "teacher-1", roomId: "room-1", dayOfWeek: 1 });
      // Conflict query must cover all three dimensions.
      const where = prisma.timetableSlot.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { classId: "class-1" },
        { academicYearId: YEAR_ID, teacherId: "teacher-1" },
        { academicYearId: YEAR_ID, roomId: "room-1" },
      ]);
    });

    it("rejects a class double-booking with a 409 naming the existing lesson", async () => {
      prisma.timetableSlot.findMany.mockResolvedValue([
        makeClash({ classId: "class-1", class: { name: "Primary 1A" } }),
      ]);

      await expect(service.createSlot(makeDto())).rejects.toMatchObject({
        constructor: ConflictException,
        message: expect.stringContaining("Primary 1A already has Mathematics"),
      });
      expect(prisma.timetableSlot.create).not.toHaveBeenCalled();
    });

    it("rejects a teacher double-booking across classes", async () => {
      prisma.timetableSlot.findMany.mockResolvedValue([makeClash({ teacherId: "teacher-1" })]);

      await expect(service.createSlot(makeDto())).rejects.toMatchObject({
        constructor: ConflictException,
        message: expect.stringContaining("teacher is already taking JHS 1A"),
      });
    });

    it("rejects a room double-booking across classes", async () => {
      prisma.timetableSlot.findMany.mockResolvedValue([makeClash({ roomId: "room-1" })]);

      await expect(service.createSlot(makeDto())).rejects.toMatchObject({
        constructor: ConflictException,
        message: expect.stringContaining("room is already used by JHS 1A"),
      });
    });

    it("reports every clashing dimension in one message", async () => {
      prisma.timetableSlot.findMany.mockResolvedValue([
        makeClash({ classId: "class-1", class: { name: "Primary 1A" } }),
        makeClash({ id: "slot-b", teacherId: "teacher-1" }),
        makeClash({ id: "slot-c", roomId: "room-1" }),
      ]);

      await expect(service.createSlot(makeDto())).rejects.toMatchObject({
        message: expect.stringMatching(/already has.*teacher is already.*room is already/s),
      });
    });

    it("does not check teacher/room dimensions for an unassigned slot", async () => {
      await service.createSlot(makeDto({ teacherId: null, roomId: null }));

      const where = prisma.timetableSlot.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ classId: "class-1" }]);
    });

    it("falls back to the ClassSubject teacher when teacherId is omitted", async () => {
      const slot = await service.createSlot(makeDto({ teacherId: undefined }));

      expect(prisma.classSubject.findFirst).toHaveBeenCalledWith({
        where: { classId: "class-1", subjectId: "subject-1" },
      });
      expect(slot).toMatchObject({ teacherId: "teacher-cs" });
    });

    it("refuses to schedule a lesson into a break period", async () => {
      prisma.period.findFirst.mockResolvedValue({ id: "period-1", schoolId: SCHOOL_ID, name: "Snack Break", isBreak: true });

      await expect(service.createSlot(makeDto())).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.timetableSlot.create).not.toHaveBeenCalled();
    });

    it("rejects a class from another school with 404", async () => {
      prisma.class.findFirst.mockResolvedValue(null);

      await expect(service.createSlot(makeDto())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("updateSlot conflict detection", () => {
    beforeEach(() => {
      prisma.timetableSlot.findFirst.mockResolvedValue({
        id: "slot-1",
        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        classId: "class-1",
        subjectId: "subject-1",
        teacherId: "teacher-1",
        roomId: "room-1",
        periodId: "period-1",
        dayOfWeek: 1,
      });
    });

    it("excludes the slot itself so an unchanged placement is not a self-conflict", async () => {
      await service.updateSlot("slot-1", { dayOfWeek: 2 });

      const where = prisma.timetableSlot.findMany.mock.calls[0][0].where;
      expect(where.id).toEqual({ not: "slot-1" });
      expect(where.dayOfWeek).toBe(2);
    });

    it("rejects moving a slot onto an occupied teacher slot", async () => {
      prisma.timetableSlot.findMany.mockResolvedValue([makeClash({ teacherId: "teacher-1" })]);

      await expect(service.updateSlot("slot-1", { dayOfWeek: 3 })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.timetableSlot.update).not.toHaveBeenCalled();
    });

    it("clears the teacher when teacherId is explicitly null", async () => {
      await service.updateSlot("slot-1", { teacherId: null });

      expect(prisma.timetableSlot.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ teacherId: null }) }),
      );
    });
  });

  describe("getClassTimetable visibility", () => {
    it("lets staff view any class timetable", async () => {
      const result = await service.getClassTimetable("class-1", admin);

      expect(result.class).toMatchObject({ id: "class-1" });
      expect(prisma.classEnrollment.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a parent with no linked learner in the class", async () => {
      await expect(service.getClassTimetable("class-1", parent)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("allows a parent whose child is enrolled in the class", async () => {
      prisma.classEnrollment.findFirst.mockResolvedValue({ id: "enr-1" });

      const result = await service.getClassTimetable("class-1", parent);

      expect(result.slots).toEqual([]);
      const where = prisma.classEnrollment.findFirst.mock.calls[0][0].where;
      expect(where.learner.OR).toEqual([
        { learnerUserId: "user-parent" },
        { guardianLearners: { some: { guardian: { userId: "user-parent" } } } },
      ]);
    });
  });
});

import { NotFoundException } from "@nestjs/common";
import { LearnersService } from "./learners.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

const SCHOOL_ID = "school-1";

const parent: AuthenticatedUser = { sub: "user-parent", schoolId: SCHOOL_ID, roles: ["parent"] };
const teacher: AuthenticatedUser = { sub: "user-teacher", schoolId: SCHOOL_ID, roles: ["teacher"] };

describe("LearnersService.findById — visibility scoping", () => {
  let prisma: { learner: { findFirst: jest.Mock } };
  let service: LearnersService;

  beforeEach(() => {
    prisma = { learner: { findFirst: jest.fn() } };
    const tenant = { schoolId: SCHOOL_ID };
    const audit = { log: jest.fn() };
    service = new LearnersService(prisma as never, tenant as never, audit as never);
  });

  it("applies the guardianLearners filter for a parent caller", async () => {
    prisma.learner.findFirst.mockResolvedValue({ id: "learner-1" });

    await service.findById("learner-1", parent);

    const where = prisma.learner.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: "learner-1",
      schoolId: SCHOOL_ID,
      guardianLearners: { some: { guardian: { userId: "user-parent" } } },
    });
  });

  it("does NOT apply the guardian filter for staff callers", async () => {
    prisma.learner.findFirst.mockResolvedValue({ id: "learner-1" });

    await service.findById("learner-1", teacher);

    const where = prisma.learner.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: "learner-1", schoolId: SCHOOL_ID });
    expect(where).not.toHaveProperty("guardianLearners");
  });

  it("always scopes by schoolId, even for staff", async () => {
    prisma.learner.findFirst.mockResolvedValue({ id: "learner-1" });

    await service.findById("learner-1", teacher);

    expect(prisma.learner.findFirst.mock.calls[0][0].where.schoolId).toBe(SCHOOL_ID);
  });

  it("throws NotFoundException (404, not 403) when a parent asks for an unlinked learner", async () => {
    // The filter makes "exists but not yours" and "does not exist" identical
    // from the caller's perspective — both come back null from Prisma.
    prisma.learner.findFirst.mockResolvedValue(null);

    await expect(service.findById("learner-someone-elses", parent)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException for staff when the learner does not exist in this school", async () => {
    prisma.learner.findFirst.mockResolvedValue(null);

    await expect(service.findById("learner-ghost", teacher)).rejects.toBeInstanceOf(NotFoundException);
  });
});

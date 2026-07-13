import { ReportCardsService } from "./report-cards.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";

const SCHOOL_ID = "school-1";
const admin: AuthenticatedUser = { sub: "user-admin", schoolId: SCHOOL_ID, roles: ["admin"] };

interface ScoreSeed {
  ca: { scoreObtained: number; maxScore: number; weightPct: number }[];
  exam: { scoreObtained: number; maxScore: number }[];
}

/**
 * Builds a mocked-Prisma ReportCardsService for `generate` tests.
 * `scores` maps `${learnerId}:${classSubjectId}` to the CA/exam entries
 * returned for that learner+subject; anything unmapped returns [].
 */
function buildHarness(options: {
  learnerIds: string[];
  classSubjectIds: string[];
  scores: Record<string, ScoreSeed>;
  caWeightPct?: number;
  examWeightPct?: number;
}) {
  const bands = [
    { id: "band-a", grade: "A", remark: "Excellent", minScore: 80, maxScore: 100 },
    { id: "band-b", grade: "B", remark: "Very Good", minScore: 70, maxScore: 79.99 },
    { id: "band-c", grade: "C", remark: "Good", minScore: 40, maxScore: 69.99 },
  ];

  const reportCardCreates: Array<{ data: Record<string, unknown> }> = [];
  const itemCreates: Array<{ data: Array<Record<string, unknown>> }> = [];
  const positionUpdates: Array<{ where: { id: string }; data: { positionInClass: number | null } }> = [];

  const tx = {
    reportCard: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args: { data: { learnerId: string } }) => {
        reportCardCreates.push(args);
        return Promise.resolve({ id: `rc-${args.data.learnerId}`, ...args.data });
      }),
      update: jest.fn(),
    },
    reportCardItem: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockImplementation((args: { data: Array<Record<string, unknown>> }) => {
        itemCreates.push(args);
        return Promise.resolve({ count: args.data.length });
      }),
    },
  };

  const prisma = {
    class: {
      findFirst: jest.fn().mockResolvedValue({
        id: "class-1",
        schoolId: SCHOOL_ID,
        academicYearId: "ay-1",
        level: { stage: "PRIMARY" },
      }),
    },
    term: { findFirst: jest.fn().mockResolvedValue({ id: "term-1", schoolId: SCHOOL_ID }) },
    assessmentConfig: {
      findFirst: jest.fn().mockResolvedValue({
        caWeightPct: options.caWeightPct ?? 40,
        examWeightPct: options.examWeightPct ?? 60,
      }),
    },
    gradingBand: { findMany: jest.fn().mockResolvedValue(bands) },
    classSubject: {
      findMany: jest.fn().mockResolvedValue(
        options.classSubjectIds.map((id) => ({ id, schoolId: SCHOOL_ID, classId: "class-1", subjectId: `subject-of-${id}` })),
      ),
    },
    classEnrollment: {
      findMany: jest.fn().mockResolvedValue(
        options.learnerIds.map((learnerId) => ({ learnerId, learner: { id: learnerId } })),
      ),
    },
    caScore: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { learnerId: string; classSubjectId: string } }) =>
        Promise.resolve(options.scores[`${where.learnerId}:${where.classSubjectId}`]?.ca ?? []),
      ),
    },
    examScore: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { learnerId: string; classSubjectId: string } }) =>
        Promise.resolve(options.scores[`${where.learnerId}:${where.classSubjectId}`]?.exam ?? []),
      ),
    },
    reportCard: {
      update: jest.fn().mockImplementation((args: { where: { id: string }; data: { positionInClass: number | null } }) => {
        positionUpdates.push(args);
        return Promise.resolve({ id: args.where.id });
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const tenant = { schoolId: SCHOOL_ID };
  const audit = { log: jest.fn() };
  const emitter = { emit: jest.fn() };
  const service = new ReportCardsService(prisma as never, tenant as never, audit as never, emitter as never);

  return { service, prisma, tx, reportCardCreates, itemCreates, positionUpdates };
}

describe("ReportCardsService.generate — score math", () => {
  it("applies the CA weighting formula and averages multiple exam entries", async () => {
    // caWeight 40 / examWeight 60.
    // CA: (8/10)*50 + (15/20)*50 = 40 + 37.5 = 77.5 raw -> caTotal 31.
    // Exam: avg(90%, 70%) = 80 raw -> examTotal 48. Total 79 -> band B.
    const { service, itemCreates, reportCardCreates } = buildHarness({
      learnerIds: ["learner-1"],
      classSubjectIds: ["cs-math"],
      scores: {
        "learner-1:cs-math": {
          ca: [
            { scoreObtained: 8, maxScore: 10, weightPct: 50 },
            { scoreObtained: 15, maxScore: 20, weightPct: 50 },
          ],
          exam: [
            { scoreObtained: 90, maxScore: 100 },
            { scoreObtained: 70, maxScore: 100 },
          ],
        },
      },
    });

    await service.generate({ classId: "class-1", termId: "term-1" }, admin);

    expect(itemCreates).toHaveLength(1);
    expect(itemCreates[0].data).toEqual([
      expect.objectContaining({
        subjectId: "subject-of-cs-math",
        caTotal: 31,
        examTotal: 48,
        totalScore: 79,
        grade: "B",
        remark: "Very Good",
      }),
    ]);
    expect(reportCardCreates[0].data).toMatchObject({ overallAverage: 79, overallGrade: "B" });
  });

  it("averages the overall across subjects and treats a missing exam as 0 exam contribution", async () => {
    // Subject 1: total 79 (as above). Subject 2: CA only, (10/10)*100 = 100
    // raw -> caTotal 40, examTotal 0, total 40 -> band C.
    // Overall: (79 + 40) / 2 = 59.5 -> band C.
    const { service, reportCardCreates, itemCreates } = buildHarness({
      learnerIds: ["learner-1"],
      classSubjectIds: ["cs-math", "cs-science"],
      scores: {
        "learner-1:cs-math": {
          ca: [
            { scoreObtained: 8, maxScore: 10, weightPct: 50 },
            { scoreObtained: 15, maxScore: 20, weightPct: 50 },
          ],
          exam: [
            { scoreObtained: 90, maxScore: 100 },
            { scoreObtained: 70, maxScore: 100 },
          ],
        },
        "learner-1:cs-science": {
          ca: [{ scoreObtained: 10, maxScore: 10, weightPct: 100 }],
          exam: [],
        },
      },
    });

    await service.generate({ classId: "class-1", termId: "term-1" }, admin);

    const items = itemCreates[0].data;
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ caTotal: 40, examTotal: 0, totalScore: 40, grade: "C" });
    expect(reportCardCreates[0].data).toMatchObject({ overallAverage: 59.5, overallGrade: "C" });
  });

  it("omits subjects with no scores and records a null overall for scoreless learners", async () => {
    const { service, reportCardCreates, itemCreates } = buildHarness({
      learnerIds: ["learner-blank"],
      classSubjectIds: ["cs-math"],
      scores: {},
    });

    await service.generate({ classId: "class-1", termId: "term-1" }, admin);

    expect(itemCreates).toHaveLength(0);
    expect(reportCardCreates[0].data).toMatchObject({ overallAverage: null, overallGrade: null });
  });
});

describe("ReportCardsService.assignPositions — competition (1224) ranking", () => {
  it("gives tied learners the same rank and skips the next rank(s)", async () => {
    const { service, positionUpdates } = buildHarness({ learnerIds: [], classSubjectIds: [], scores: {} });

    const interim = [
      { reportCardId: "rc-a", overallAverage: 90 },
      { reportCardId: "rc-b", overallAverage: 85 },
      { reportCardId: "rc-c", overallAverage: 85 },
      { reportCardId: "rc-d", overallAverage: 70 },
    ];

    await (service as unknown as { assignPositions: (i: typeof interim) => Promise<void> }).assignPositions(interim);

    const byId = Object.fromEntries(positionUpdates.map((u) => [u.where.id, u.data.positionInClass]));
    expect(byId).toEqual({ "rc-a": 1, "rc-b": 2, "rc-c": 2, "rc-d": 4 });
  });

  it("excludes null averages from ranking entirely (position stays null)", async () => {
    const { service, positionUpdates } = buildHarness({ learnerIds: [], classSubjectIds: [], scores: {} });

    const interim = [
      { reportCardId: "rc-a", overallAverage: 80 },
      { reportCardId: "rc-none", overallAverage: null },
      { reportCardId: "rc-b", overallAverage: 60 },
    ];

    await (service as unknown as { assignPositions: (i: typeof interim) => Promise<void> }).assignPositions(interim);

    const byId = Object.fromEntries(positionUpdates.map((u) => [u.where.id, u.data.positionInClass]));
    expect(byId).toEqual({ "rc-a": 1, "rc-none": null, "rc-b": 2 });
  });

  it("handles an all-tied class (everyone ranked 1st)", async () => {
    const { service, positionUpdates } = buildHarness({ learnerIds: [], classSubjectIds: [], scores: {} });

    const interim = [
      { reportCardId: "rc-a", overallAverage: 75 },
      { reportCardId: "rc-b", overallAverage: 75 },
      { reportCardId: "rc-c", overallAverage: 75 },
    ];

    await (service as unknown as { assignPositions: (i: typeof interim) => Promise<void> }).assignPositions(interim);

    const byId = Object.fromEntries(positionUpdates.map((u) => [u.where.id, u.data.positionInClass]));
    expect(byId).toEqual({ "rc-a": 1, "rc-b": 1, "rc-c": 1 });
  });
});

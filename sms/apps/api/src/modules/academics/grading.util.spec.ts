import type { GradingBand } from "@prisma/client";
import { findGradingBand, round2 } from "./grading.util";

function band(input: { minScore: number; maxScore: number; grade: string }): GradingBand {
  return {
    id: `band-${input.grade}`,
    schoolId: "school-1",
    levelStage: "PRIMARY",
    remark: null,
    isActive: true,
    ...input,
  } as unknown as GradingBand;
}

describe("round2", () => {
  it("rounds to two decimal places", () => {
    expect(round2(10 / 3)).toBe(3.33);
    expect(round2(2 / 3)).toBe(0.67);
    expect(round2(79.005)).toBeCloseTo(79.01, 2);
  });

  it("leaves already-2dp values untouched", () => {
    expect(round2(31)).toBe(31);
    expect(round2(48.25)).toBe(48.25);
    expect(round2(0)).toBe(0);
  });
});

describe("findGradingBand", () => {
  const bands = [
    band({ grade: "A", minScore: 80, maxScore: 100 }),
    band({ grade: "B", minScore: 70, maxScore: 79.99 }),
    band({ grade: "C", minScore: 60, maxScore: 69.99 }),
  ];

  it("matches a score strictly inside a band", () => {
    expect(findGradingBand(bands, 85)?.grade).toBe("A");
    expect(findGradingBand(bands, 65.5)?.grade).toBe("C");
  });

  it("includes both boundaries: score exactly at minScore and at maxScore", () => {
    expect(findGradingBand(bands, 80)?.grade).toBe("A");
    expect(findGradingBand(bands, 100)?.grade).toBe("A");
    expect(findGradingBand(bands, 79.99)?.grade).toBe("B");
    expect(findGradingBand(bands, 70)?.grade).toBe("B");
    expect(findGradingBand(bands, 60)?.grade).toBe("C");
  });

  it("returns undefined for scores falling in a gap between bands", () => {
    // 79.99 < score < 80 falls between B and A.
    expect(findGradingBand(bands, 79.995)).toBeUndefined();
    // Below the lowest configured band.
    expect(findGradingBand(bands, 59.99)).toBeUndefined();
    // Above the highest configured band.
    expect(findGradingBand(bands, 100.01)).toBeUndefined();
  });

  it("returns the first match when bands overlap", () => {
    const overlapping = [
      band({ grade: "FIRST", minScore: 50, maxScore: 100 }),
      band({ grade: "SECOND", minScore: 60, maxScore: 100 }),
    ];
    expect(findGradingBand(overlapping, 75)?.grade).toBe("FIRST");
  });

  it("returns undefined for an empty band list", () => {
    expect(findGradingBand([], 50)).toBeUndefined();
  });
});

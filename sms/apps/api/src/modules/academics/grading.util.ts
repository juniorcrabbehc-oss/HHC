import type { GradingBand } from "@prisma/client";

/** Rounds to 2dp, matching the `Decimal(6,2)` columns these values land in. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Finds the grading band whose [minScore, maxScore] range contains `score`.
 * Bands are expected to be non-overlapping per levelStage (an admin/config
 * concern, not enforced at the DB level) — the first match wins if they do
 * overlap. Returns `undefined` if no band covers the score (e.g. gaps in
 * the configured ranges), which callers treat as "ungraded".
 */
export function findGradingBand(bands: GradingBand[], score: number): GradingBand | undefined {
  return bands.find((band) => score >= Number(band.minScore) && score <= Number(band.maxScore));
}

/** Shared result/roster shapes for `CaScoresService` and `ExamScoresService`. */
export type ScoreSyncOutcome = "created" | "updated" | "unchanged";

export interface ScoreSyncResultItem {
  clientUuid: string;
  status: ScoreSyncOutcome | "failed";
  id?: string;
  errorMessage?: string;
}

export interface ScoreRosterRow<TScore> {
  learnerId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  scores: TScore[];
}

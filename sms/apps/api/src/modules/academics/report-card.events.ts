export const REPORT_CARD_PUBLISHED_EVENT = "report-card.published";

/**
 * Emitted by `ReportCardsService.publish` right after the status flips to
 * `"published"`. Same event-emitter seam as `attendance.events.ts` — see
 * that file's doc comment for the rationale (not touching
 * `ReportCardsService`'s carefully-scoped visibility logic beyond a
 * one-line `eventEmitter.emit(...)` call).
 */
export interface ReportCardPublishedEvent {
  schoolId: string;
  reportCardId: string;
  learnerId: string;
  termId: string;
  classId: string;
}

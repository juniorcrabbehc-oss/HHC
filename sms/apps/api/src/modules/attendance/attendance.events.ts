import type { AttendanceStatus } from "@prisma/client";

export const ATTENDANCE_MARKED_EVENT = "attendance.marked";

/**
 * Emitted by `AttendanceService` after a successful create/update in
 * `upsertOne` — deliberately *not* emitted for an exact-replay "unchanged"
 * outcome (a clientUuid seen before), so offline-sync retries of the same
 * write don't re-fire notifications. Phase 5's communications module
 * listens for this (see
 * `modules/communications/triggers/notification-triggers.service.ts`) to
 * fire absence-alert SMS without `AttendanceService` knowing anything
 * about notifications — kept as a narrow event/payload type here rather
 * than a direct cross-module service call, same "small, dependency-free
 * seam" spirit as `NotificationsPort` in the fees module.
 */
export interface AttendanceMarkedEvent {
  schoolId: string;
  learnerId: string;
  classId: string;
  termId: string;
  recordId: string;
  date: Date;
  status: AttendanceStatus;
  recordedBy: string;
}

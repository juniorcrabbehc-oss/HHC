import { AttendanceSource as PrismaSource, AttendanceStatus as PrismaStatus } from "@prisma/client";
import type { AttendanceRecord as PrismaAttendanceRecord } from "@prisma/client";
import type { AttendanceStatusInput, AttendanceSourceInput } from "./dto/mark-attendance.dto";

const STATUS_TO_PRISMA: Record<AttendanceStatusInput, PrismaStatus> = {
  present: PrismaStatus.PRESENT,
  absent: PrismaStatus.ABSENT,
  late: PrismaStatus.LATE,
  excused: PrismaStatus.EXCUSED,
};

const STATUS_FROM_PRISMA: Record<PrismaStatus, AttendanceStatusInput> = {
  [PrismaStatus.PRESENT]: "present",
  [PrismaStatus.ABSENT]: "absent",
  [PrismaStatus.LATE]: "late",
  [PrismaStatus.EXCUSED]: "excused",
};

export function toPrismaStatus(status: AttendanceStatusInput): PrismaStatus {
  return STATUS_TO_PRISMA[status];
}

export function fromPrismaStatus(status: PrismaStatus): AttendanceStatusInput {
  return STATUS_FROM_PRISMA[status];
}

export function toPrismaSource(source: AttendanceSourceInput | undefined): PrismaSource {
  return source === "offline_sync" ? PrismaSource.OFFLINE_SYNC : PrismaSource.WEB;
}

export function fromPrismaSource(source: PrismaSource): AttendanceSourceInput {
  return source === PrismaSource.OFFLINE_SYNC ? "offline_sync" : "web";
}

/**
 * Serializes a Prisma AttendanceRecord for API responses: lowercase
 * status/source strings to match `@sms/shared-types`' `attendance.ts`
 * schemas, which is what web/mobile clients validate against.
 */
export function serializeAttendanceRecord(record: PrismaAttendanceRecord) {
  return {
    ...record,
    status: fromPrismaStatus(record.status),
    source: fromPrismaSource(record.source),
  };
}

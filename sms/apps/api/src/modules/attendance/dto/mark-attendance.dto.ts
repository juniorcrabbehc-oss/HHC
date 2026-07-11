import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatusInput = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_SOURCES = ["web", "offline_sync"] as const;
export type AttendanceSourceInput = (typeof ATTENDANCE_SOURCES)[number];

/**
 * Mirrors `attendanceRecordWriteSchema` in `@sms/shared-types`. `clientUuid`
 * is generated client-side and is the idempotency key: replaying the same
 * DTO (e.g. after an offline sync retry) must not create a duplicate row.
 */
export class MarkAttendanceDto {
  @IsUUID()
  clientUuid!: string;

  @IsUUID()
  classId!: string;

  @IsUUID()
  learnerId!: string;

  @IsUUID()
  termId!: string;

  @IsDateString()
  date!: string;

  @IsIn(ATTENDANCE_STATUSES)
  status!: AttendanceStatusInput;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Defaults to "web" server-side when omitted. */
  @IsOptional()
  @IsIn(ATTENDANCE_SOURCES)
  source?: AttendanceSourceInput;
}

export class MarkAttendanceBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkAttendanceDto)
  records!: MarkAttendanceDto[];
}

import { IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from "class-validator";

export class CreateTimetableSlotDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  periodId!: string;

  /** ISO weekday: 1 = Monday ... 5 = Friday. */
  @IsInt()
  @Min(1)
  @Max(5)
  dayOfWeek!: number;

  /**
   * Omitted -> defaults to the subject teacher assigned on ClassSubject.
   * Explicit null -> slot created with no teacher.
   */
  @IsOptional()
  @ValidateIf((o) => o.teacherId !== null)
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.roomId !== null)
  @IsUUID()
  roomId?: string | null;
}

export class UpdateTimetableSlotDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  periodId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  dayOfWeek?: number;

  /** Explicit null clears the assignment (e.g. teacher on leave). */
  @IsOptional()
  @ValidateIf((o) => o.teacherId !== null)
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.roomId !== null)
  @IsUUID()
  roomId?: string | null;
}

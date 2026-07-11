import { IsDateString, IsOptional, IsUUID } from "class-validator";

/**
 * Backs `GET /attendance/records`, which supports two mutually exclusive
 * query shapes on the same path:
 *  - `classId` + `date`   -> a class register for one day
 *  - `learnerId` (+ `from`/`to`) -> one learner's attendance history
 */
export class AttendanceQueryDto {
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  learnerId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

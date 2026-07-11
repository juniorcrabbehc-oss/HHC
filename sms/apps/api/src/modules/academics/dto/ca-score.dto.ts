import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNumber, IsPositive, IsString, IsUUID, Max, Min, MinLength, ValidateNested } from "class-validator";

/**
 * Mirrors `caScoreWriteSchema` in `@sms/shared-types`. `clientUuid` is
 * generated client-side and is the idempotency key — same offline-sync
 * shape as `MarkAttendanceDto`.
 */
export class MarkCaScoreDto {
  @IsUUID()
  clientUuid!: string;

  @IsUUID()
  learnerId!: string;

  @IsUUID()
  classSubjectId!: string;

  @IsUUID()
  termId!: string;

  @IsString()
  @MinLength(1)
  assessmentType!: string;

  @IsNumber()
  @IsPositive()
  maxScore!: number;

  @IsNumber()
  @Min(0)
  scoreObtained!: number;

  /** This entry's share of the subject's overall CA weight pool (0-100). */
  @IsNumber()
  @Min(0)
  @Max(100)
  weightPct!: number;
}

export class MarkCaScoreBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkCaScoreDto)
  records!: MarkCaScoreDto[];
}

export class CaScoreQueryDto {
  @IsUUID()
  classSubjectId!: string;

  @IsUUID()
  termId!: string;
}

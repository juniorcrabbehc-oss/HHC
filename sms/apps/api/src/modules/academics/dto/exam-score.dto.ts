import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNumber, IsPositive, IsString, IsUUID, Min, MinLength, ValidateNested } from "class-validator";

/**
 * Mirrors `examScoreWriteSchema` in `@sms/shared-types`. Same idempotent
 * `clientUuid` shape as `MarkCaScoreDto` / `MarkAttendanceDto`.
 */
export class MarkExamScoreDto {
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
  examType!: string;

  @IsNumber()
  @IsPositive()
  maxScore!: number;

  @IsNumber()
  @Min(0)
  scoreObtained!: number;
}

export class MarkExamScoreBulkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkExamScoreDto)
  records!: MarkExamScoreDto[];
}

export class ExamScoreQueryDto {
  @IsUUID()
  classSubjectId!: string;

  @IsUUID()
  termId!: string;
}

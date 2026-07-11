import { IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from "class-validator";
import { LEVEL_STAGES, type LevelStageInput } from "./level-stage";

export class CreateAssessmentConfigDto {
  @IsIn(LEVEL_STAGES)
  levelStage!: LevelStageInput;

  @IsNumber()
  @Min(0)
  @Max(100)
  caWeightPct!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  examWeightPct!: number;

  @IsUUID()
  academicYearId!: string;
}

export class UpdateAssessmentConfigDto {
  @IsOptional()
  @IsIn(LEVEL_STAGES)
  levelStage?: LevelStageInput;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  caWeightPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  examWeightPct?: number;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class ListAssessmentConfigQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsIn(LEVEL_STAGES)
  levelStage?: LevelStageInput;
}

import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { LEVEL_STAGES, type LevelStageInput } from "./level-stage";

export class CreateGradingBandDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  minScore!: number;

  @IsNumber()
  maxScore!: number;

  @IsString()
  @MinLength(1)
  grade!: string;

  @IsString()
  @MinLength(1)
  descriptor!: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsIn(LEVEL_STAGES)
  levelStage!: LevelStageInput;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGradingBandDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  minScore?: number;

  @IsOptional()
  @IsNumber()
  maxScore?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  grade?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  descriptor?: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsIn(LEVEL_STAGES)
  levelStage?: LevelStageInput;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListGradingBandsQueryDto {
  @IsOptional()
  @IsIn(LEVEL_STAGES)
  levelStage?: LevelStageInput;
}

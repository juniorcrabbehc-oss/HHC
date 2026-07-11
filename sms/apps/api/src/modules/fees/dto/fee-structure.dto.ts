import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength, ValidateNested } from "class-validator";

export class FeeItemInputDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;
}

export class CreateFeeStructureDto {
  @IsUUID()
  academicYearId!: string;

  @IsUUID()
  termId!: string;

  @IsUUID()
  levelId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeItemInputDto)
  feeItems!: FeeItemInputDto[];
}

export class UpdateFeeStructureDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  /** Replaces the full set of fee items when present (delete + recreate). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeItemInputDto)
  feeItems?: FeeItemInputDto[];
}

export class ListFeeStructuresQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;
}

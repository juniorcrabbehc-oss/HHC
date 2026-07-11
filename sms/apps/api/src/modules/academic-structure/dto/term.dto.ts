import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateTermDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

export class UpdateTermDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}

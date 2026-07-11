import { IsInt, IsOptional, IsPositive, IsString, IsUUID, MinLength } from "class-validator";

export class CreateClassDto {
  @IsUUID()
  levelId!: string;

  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUUID()
  classTeacherId?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capacity?: number;
}

export class UpdateClassDto {
  @IsOptional()
  @IsUUID()
  levelId?: string;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  classTeacherId?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capacity?: number;
}

export class ListClassesQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;

  /** Used by the teacher attendance UI to fetch "my classes" (classTeacherId = current user). */
  @IsOptional()
  @IsUUID()
  classTeacherId?: string;
}

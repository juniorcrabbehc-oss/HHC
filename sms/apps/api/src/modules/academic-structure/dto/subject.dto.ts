import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateSubjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsBoolean()
  isCore?: boolean;
}

export class CreateClassSubjectDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  subjectId!: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;
}

export class ListClassSubjectsQueryDto {
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

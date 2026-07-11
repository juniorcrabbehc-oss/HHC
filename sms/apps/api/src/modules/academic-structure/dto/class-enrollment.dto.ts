import { IsIn, IsOptional, IsUUID } from "class-validator";

export const CLASS_ENROLLMENT_STATUSES = ["active", "inactive", "completed", "withdrawn"] as const;

export class CreateClassEnrollmentDto {
  @IsUUID()
  learnerId!: string;

  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsIn(CLASS_ENROLLMENT_STATUSES)
  status?: (typeof CLASS_ENROLLMENT_STATUSES)[number];
}

export class ListClassEnrollmentsQueryDto {
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  learnerId?: string;
}

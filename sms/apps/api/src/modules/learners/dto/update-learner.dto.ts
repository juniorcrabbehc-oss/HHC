import { IsDateString, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { GENDERS, LEARNER_STATUSES } from "./register-learner.dto";

export class UpdateLearnerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsString()
  otherNames?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @IsOptional()
  @IsIn(LEARNER_STATUSES)
  status?: (typeof LEARNER_STATUSES)[number];

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  medicalNotes?: string;

  @IsOptional()
  @IsString()
  allergies?: string;

  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}

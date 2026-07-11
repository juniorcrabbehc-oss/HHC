import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from "class-validator";

export const LEARNER_STATUSES = ["active", "inactive", "graduated", "withdrawn", "transferred"] as const;
export const GENDERS = ["male", "female"] as const;

/**
 * A guardian entry inside a learner registration payload. Either references
 * an existing guardian via `guardianId`, or supplies enough fields to create
 * a new one (`fullName` + `phonePrimary`) — validated in the service since
 * it's a cross-field rule that's awkward to express with decorators alone.
 */
export class GuardianLinkDto {
  @IsOptional()
  @IsUUID()
  guardianId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  phonePrimary?: string;

  @IsOptional()
  @IsString()
  phoneSecondary?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  idType?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsBoolean()
  smsOptIn?: boolean;

  @IsString()
  @MinLength(1)
  relationship!: string;

  @IsOptional()
  @IsBoolean()
  isPrimaryContact?: boolean;

  @IsOptional()
  @IsBoolean()
  isEmergencyContact?: boolean;
}

export class RegisterLearnerDto {
  @IsString()
  @MinLength(1)
  admissionNumber!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  otherNames?: string;

  @IsDateString()
  dob!: string;

  @IsIn(GENDERS)
  gender!: (typeof GENDERS)[number];

  @IsDateString()
  admissionDate!: string;

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

  /** Enrolls the learner into this class immediately (academic year is inferred from the class). */
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuardianLinkDto)
  guardians?: GuardianLinkDto[];
}

import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";
import { LEARNER_STATUSES } from "./register-learner.dto";

export class ListLearnersQueryDto {
  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsIn(LEARNER_STATUSES)
  status?: (typeof LEARNER_STATUSES)[number];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pageSize?: number;
}

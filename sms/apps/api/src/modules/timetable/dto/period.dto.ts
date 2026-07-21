import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min, MinLength } from "class-validator";

const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreatePeriodDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Matches(TIME_24H, { message: "startTime must be HH:mm (24h)" })
  startTime!: string;

  @Matches(TIME_24H, { message: "endTime must be HH:mm (24h)" })
  endTime!: string;

  @IsInt()
  @Min(1)
  sortOrder!: number;

  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

export class UpdatePeriodDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @Matches(TIME_24H, { message: "startTime must be HH:mm (24h)" })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_24H, { message: "endTime must be HH:mm (24h)" })
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

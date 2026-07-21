import { IsInt, IsOptional, IsPositive, IsString, MinLength } from "class-validator";

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capacity?: number;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capacity?: number;
}

import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class LoginDto {
  @ValidateIf((dto: LoginDto) => !dto.phone)
  @IsEmail()
  email?: string;

  @ValidateIf((dto: LoginDto) => !dto.email)
  @IsString()
  @MinLength(6)
  phone?: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  schoolCode?: string;
}

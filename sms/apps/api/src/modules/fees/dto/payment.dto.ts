import { IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from "class-validator";

const MOMO_PROVIDERS = ["mtn", "vodafone", "airteltigo"] as const;
export type MomoProviderInput = (typeof MOMO_PROVIDERS)[number];

export class InitiateMomoPaymentDto {
  @IsUUID()
  invoiceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  phone!: string;

  @IsIn(MOMO_PROVIDERS)
  provider!: MomoProviderInput;
}

const CASH_METHODS = ["cash", "bank_transfer"] as const;
export type CashMethodInput = (typeof CASH_METHODS)[number];

export class CashPaymentDto {
  @IsUUID()
  invoiceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsIn(CASH_METHODS)
  method!: CashMethodInput;

  @IsOptional()
  @IsString()
  reference?: string;
}

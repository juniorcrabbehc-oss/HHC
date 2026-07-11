import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MinLength, NotEquals, ValidateNested } from "class-validator";

export class GenerateInvoicesDto {
  @IsUUID()
  termId!: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  levelId?: string;
}

const INVOICE_STATUSES = ["unpaid", "partially_paid", "paid", "overdue"] as const;

export class ListInvoicesQueryDto {
  @IsOptional()
  @IsUUID()
  learnerId?: string;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: (typeof INVOICE_STATUSES)[number];
}

export class InvoiceAdjustmentLineItemDto {
  @IsString()
  @MinLength(1)
  description!: string;

  /** Positive = extra charge, negative = waiver/discount. */
  @IsNumber()
  @NotEquals(0)
  amount!: number;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceAdjustmentLineItemDto)
  addLineItems?: InvoiceAdjustmentLineItemDto[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsNotEmpty({ each: true })
  removeLineItemIds?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

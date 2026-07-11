import { IsUUID } from "class-validator";

export class GenerateReportCardsDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  termId!: string;
}

export class ListReportCardsQueryDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  termId!: string;
}

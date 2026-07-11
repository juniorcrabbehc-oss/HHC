import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export const MESSAGE_CHANNELS = ["sms", "in_app"] as const;
export const MESSAGE_EVENT_TRIGGERS = [
  "absence_alert",
  "fee_reminder",
  "report_card_ready",
  "payment_received",
  "manual",
] as const;

export class CreateMessageTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(MESSAGE_CHANNELS)
  channel!: (typeof MESSAGE_CHANNELS)[number];

  @IsIn(MESSAGE_EVENT_TRIGGERS)
  eventTrigger!: (typeof MESSAGE_EVENT_TRIGGERS)[number];

  @IsString()
  @MinLength(1)
  bodyTemplate!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateMessageTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyTemplate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListMessageTemplatesQueryDto {
  @IsOptional()
  @IsIn(MESSAGE_EVENT_TRIGGERS)
  eventTrigger?: string;

  @IsOptional()
  @IsIn(MESSAGE_CHANNELS)
  channel?: string;
}

import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { MESSAGE_CHANNELS } from "./message-template.dto";

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  guardianId?: string;

  @IsOptional()
  @IsUUID()
  learnerId?: string;

  @IsIn(MESSAGE_CHANNELS)
  channel!: (typeof MESSAGE_CHANNELS)[number];

  @IsString()
  @MinLength(1)
  body!: string;
}

const MESSAGE_BOXES = ["inbox"] as const;

export class ListMessagesQueryDto {
  @IsOptional()
  @IsIn(MESSAGE_BOXES)
  box?: (typeof MESSAGE_BOXES)[number];
}

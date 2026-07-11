import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { MessageTemplatesService } from "./message-templates.service";
import { CreateMessageTemplateDto, ListMessageTemplatesQueryDto, UpdateMessageTemplateDto } from "./dto/message-template.dto";

@Controller("message-templates")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessageTemplatesController {
  constructor(private readonly messageTemplatesService: MessageTemplatesService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateMessageTemplateDto) {
    return this.messageTemplatesService.create(dto);
  }

  @Get()
  @Roles("admin")
  list(@Query() query: ListMessageTemplatesQueryDto) {
    return this.messageTemplatesService.list(query);
  }

  @Get(":id")
  @Roles("admin")
  findOne(@Param("id") id: string) {
    return this.messageTemplatesService.findById(id);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.messageTemplatesService.update(id, dto);
  }
}

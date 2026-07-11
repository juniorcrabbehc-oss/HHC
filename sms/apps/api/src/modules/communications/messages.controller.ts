import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { MessagesService } from "./messages.service";
import { ListMessagesQueryDto, SendMessageDto } from "./dto/message.dto";

@Controller("messages")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /** Any authenticated role — `box=inbox` (the default/only supported box for now) resolves to "my own in-app messages". */
  @Get()
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  list(@Query() query: ListMessagesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.list(query, user);
  }

  @Post()
  @Roles("admin", "teacher", "bursar", "front_office")
  create(@Body() dto: SendMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.create(dto, user);
  }

  @Get(":id")
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.findById(id, user);
  }
}

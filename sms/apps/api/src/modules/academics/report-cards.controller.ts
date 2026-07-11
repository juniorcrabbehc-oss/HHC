import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ReportCardsService } from "./report-cards.service";
import { GenerateReportCardsDto, ListReportCardsQueryDto } from "./dto/report-card.dto";

@Controller("report-cards")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportCardsController {
  constructor(private readonly reportCardsService: ReportCardsService) {}

  @Post("generate")
  @Roles("admin", "teacher")
  generate(@Body() dto: GenerateReportCardsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportCardsService.generate(dto, user);
  }

  @Post(":id/publish")
  @Roles("admin")
  publish(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportCardsService.publish(id, user);
  }

  @Get(":id")
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportCardsService.findById(id, user);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  list(@Query() query: ListReportCardsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportCardsService.listByClassTerm(query.classId, query.termId, user);
  }
}

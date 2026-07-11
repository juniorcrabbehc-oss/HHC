import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { CaScoresService } from "./ca-scores.service";
import { CaScoreQueryDto, MarkCaScoreBulkDto, MarkCaScoreDto } from "./dto/ca-score.dto";

@Controller("ca-scores")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CaScoresController {
  constructor(private readonly caScoresService: CaScoresService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "teacher")
  markOne(@Body() dto: MarkCaScoreDto, @CurrentUser() user: AuthenticatedUser) {
    return this.caScoresService.markOne(dto, user);
  }

  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "teacher")
  markBulk(@Body() dto: MarkCaScoreBulkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.caScoresService.markBulk(dto.records, user);
  }

  @Get()
  @Roles("admin", "teacher")
  list(@Query() query: CaScoreQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.caScoresService.list(query.classSubjectId, query.termId, user);
  }
}

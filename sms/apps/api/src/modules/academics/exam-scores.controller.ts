import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ExamScoresService } from "./exam-scores.service";
import { ExamScoreQueryDto, MarkExamScoreBulkDto, MarkExamScoreDto } from "./dto/exam-score.dto";

@Controller("exam-scores")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamScoresController {
  constructor(private readonly examScoresService: ExamScoresService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "teacher")
  markOne(@Body() dto: MarkExamScoreDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examScoresService.markOne(dto, user);
  }

  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "teacher")
  markBulk(@Body() dto: MarkExamScoreBulkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examScoresService.markBulk(dto.records, user);
  }

  @Get()
  @Roles("admin", "teacher")
  list(@Query() query: ExamScoreQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.examScoresService.list(query.classSubjectId, query.termId, user);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AssessmentConfigService } from "./assessment-config.service";
import { CreateAssessmentConfigDto, ListAssessmentConfigQueryDto, UpdateAssessmentConfigDto } from "./dto/assessment-config.dto";

@Controller("assessment-config")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentConfigController {
  constructor(private readonly service: AssessmentConfigService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateAssessmentConfigDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(@Query() query: ListAssessmentConfigQueryDto) {
    return this.service.findAll(query);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateAssessmentConfigDto) {
    return this.service.update(id, dto);
  }
}

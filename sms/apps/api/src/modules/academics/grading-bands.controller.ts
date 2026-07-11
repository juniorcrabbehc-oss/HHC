import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { GradingBandsService } from "./grading-bands.service";
import { CreateGradingBandDto, ListGradingBandsQueryDto, UpdateGradingBandDto } from "./dto/grading-band.dto";

@Controller("grading-bands")
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradingBandsController {
  constructor(private readonly service: GradingBandsService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateGradingBandDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(@Query() query: ListGradingBandsQueryDto) {
    return this.service.findAll(query);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateGradingBandDto) {
    return this.service.update(id, dto);
  }
}

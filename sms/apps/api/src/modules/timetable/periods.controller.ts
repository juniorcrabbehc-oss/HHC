import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { Period } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PeriodsService } from "./periods.service";
import { CreatePeriodDto, UpdatePeriodDto } from "./dto/period.dto";

@Controller("periods")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreatePeriodDto): Promise<Period> {
    return this.periodsService.create(dto);
  }

  // Parents/learners need the period list to render the timetable grid.
  @Get()
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  findAll(): Promise<Period[]> {
    return this.periodsService.findAll();
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdatePeriodDto): Promise<Period> {
    return this.periodsService.update(id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@Param("id") id: string): Promise<Period> {
    return this.periodsService.remove(id);
  }
}

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { AcademicYear } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AcademicYearsService } from "./academic-years.service";
import { CreateAcademicYearDto, UpdateAcademicYearDto } from "./dto/academic-year.dto";

@Controller("academic-years")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateAcademicYearDto): Promise<AcademicYear> {
    return this.academicYearsService.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(): Promise<AcademicYear[]> {
    return this.academicYearsService.findAll();
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateAcademicYearDto): Promise<AcademicYear> {
    return this.academicYearsService.update(id, dto);
  }
}

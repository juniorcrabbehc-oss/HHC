import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { ClassEnrollment } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ClassEnrollmentsService } from "./class-enrollments.service";
import { CreateClassEnrollmentDto, ListClassEnrollmentsQueryDto } from "./dto/class-enrollment.dto";

@Controller("class-enrollments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassEnrollmentsController {
  constructor(private readonly classEnrollmentsService: ClassEnrollmentsService) {}

  @Post()
  @Roles("admin", "front_office")
  create(@Body() dto: CreateClassEnrollmentDto): Promise<ClassEnrollment> {
    return this.classEnrollmentsService.create(dto);
  }

  @Get()
  @Roles("admin", "front_office", "teacher")
  findAll(@Query() query: ListClassEnrollmentsQueryDto): Promise<ClassEnrollment[]> {
    return this.classEnrollmentsService.findAll(query);
  }
}

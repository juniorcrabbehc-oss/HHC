import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { ClassSubject, Subject } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { SubjectsService } from "./subjects.service";
import { CreateClassSubjectDto, CreateSubjectDto, ListClassSubjectsQueryDto } from "./dto/subject.dto";

@Controller("subjects")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateSubjectDto): Promise<Subject> {
    return this.subjectsService.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(): Promise<Subject[]> {
    return this.subjectsService.findAll();
  }
}

@Controller("class-subjects")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassSubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateClassSubjectDto): Promise<ClassSubject> {
    return this.subjectsService.createClassSubject(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(@Query() query: ListClassSubjectsQueryDto): Promise<ClassSubject[]> {
    return this.subjectsService.findAllClassSubjects(query);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { Class } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ClassesService } from "./classes.service";
import { CreateClassDto, ListClassesQueryDto, UpdateClassDto } from "./dto/class.dto";

@Controller("classes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @Roles("admin")
  create(@Body() dto: CreateClassDto): Promise<Class> {
    return this.classesService.create(dto);
  }

  @Get()
  @Roles("admin", "teacher", "bursar", "front_office")
  findAll(@Query() query: ListClassesQueryDto): Promise<Class[]> {
    return this.classesService.findAll(query);
  }

  @Get(":id")
  @Roles("admin", "teacher", "bursar", "front_office")
  findOne(@Param("id") id: string): Promise<Class> {
    return this.classesService.findOneOrThrow(id);
  }

  @Patch(":id")
  @Roles("admin")
  update(@Param("id") id: string, @Body() dto: UpdateClassDto): Promise<Class> {
    return this.classesService.update(id, dto);
  }
}

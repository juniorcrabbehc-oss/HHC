import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { TimetableSlot } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TimetableService } from "./timetable.service";
import { CreateTimetableSlotDto, UpdateTimetableSlotDto } from "./dto/timetable-slot.dto";

@Controller("timetable")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Post("slots")
  @Roles("admin")
  createSlot(@Body() dto: CreateTimetableSlotDto): Promise<TimetableSlot> {
    return this.timetableService.createSlot(dto);
  }

  @Patch("slots/:id")
  @Roles("admin")
  updateSlot(@Param("id") id: string, @Body() dto: UpdateTimetableSlotDto): Promise<TimetableSlot> {
    return this.timetableService.updateSlot(id, dto);
  }

  @Delete("slots/:id")
  @Roles("admin")
  deleteSlot(@Param("id") id: string): Promise<TimetableSlot> {
    return this.timetableService.deleteSlot(id);
  }

  @Get("mine")
  @Roles("parent", "learner")
  myClassTimetables(@CurrentUser() user: AuthenticatedUser) {
    return this.timetableService.getMyClassTimetables(user);
  }

  // Must be declared before "teacher/:teacherId" so "me" is not captured
  // as a teacherId param.
  @Get("teacher/me")
  @Roles("teacher", "admin")
  myTimetable(@CurrentUser() user: AuthenticatedUser) {
    return this.timetableService.getTeacherTimetable(user.sub);
  }

  @Get("teacher/:teacherId")
  @Roles("admin")
  teacherTimetable(@Param("teacherId") teacherId: string) {
    return this.timetableService.getTeacherTimetable(teacherId);
  }

  @Get("class/:classId")
  @Roles("admin", "teacher", "bursar", "front_office", "parent", "learner")
  classTimetable(@Param("classId") classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.timetableService.getClassTimetable(classId, user);
  }
}

import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AttendanceService } from "./attendance.service";
import { MarkAttendanceBulkDto, MarkAttendanceDto } from "./dto/mark-attendance.dto";
import { AttendanceQueryDto } from "./dto/attendance-query.dto";

@Controller("attendance/records")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "teacher")
  markOne(@Body() dto: MarkAttendanceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.markOne(dto, user);
  }

  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  @Roles("admin", "teacher")
  markBulk(@Body() dto: MarkAttendanceBulkDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.markBulk(dto.records, user);
  }

  /**
   * Two query shapes on one path:
   *  - classId + date        -> class register for that day (teacher/admin)
   *  - learnerId (+from/to)  -> one learner's history (staff, or the
   *    learner's own linked parent)
   */
  @Get()
  @Roles("admin", "teacher", "bursar", "front_office", "parent")
  findRecords(@Query() query: AttendanceQueryDto, @CurrentUser() user: AuthenticatedUser) {
    if (query.classId && query.date) {
      return this.attendanceService.getRegister(query.classId, query.date, user);
    }
    if (query.learnerId) {
      return this.attendanceService.getLearnerHistory(query.learnerId, query.from, query.to, user);
    }
    throw new BadRequestException("Provide either classId+date, or learnerId (optionally with from/to)");
  }
}

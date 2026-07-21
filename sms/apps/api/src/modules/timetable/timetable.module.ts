import { Module } from "@nestjs/common";
import { PeriodsController } from "./periods.controller";
import { PeriodsService } from "./periods.service";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { TimetableController } from "./timetable.controller";
import { TimetableService } from "./timetable.service";

@Module({
  controllers: [PeriodsController, RoomsController, TimetableController],
  providers: [PeriodsService, RoomsService, TimetableService],
})
export class TimetableModule {}

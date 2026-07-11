import { Module } from "@nestjs/common";
import { LevelsController } from "./levels.controller";
import { LevelsService } from "./levels.service";
import { AcademicYearsController } from "./academic-years.controller";
import { AcademicYearsService } from "./academic-years.service";
import { TermsController } from "./terms.controller";
import { TermsService } from "./terms.service";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";
import { ClassEnrollmentsController } from "./class-enrollments.controller";
import { ClassEnrollmentsService } from "./class-enrollments.service";
import { SubjectsController, ClassSubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";

@Module({
  controllers: [
    LevelsController,
    AcademicYearsController,
    TermsController,
    ClassesController,
    ClassEnrollmentsController,
    SubjectsController,
    ClassSubjectsController,
  ],
  providers: [
    LevelsService,
    AcademicYearsService,
    TermsService,
    ClassesService,
    ClassEnrollmentsService,
    SubjectsService,
  ],
  exports: [ClassesService, ClassEnrollmentsService],
})
export class AcademicStructureModule {}

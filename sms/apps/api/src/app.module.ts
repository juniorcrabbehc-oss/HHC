import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import configuration from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { TenantContextModule } from "./common/tenant/tenant-context.module";
import { AuditModule } from "./common/audit/audit.module";
import { AcademicStructureModule } from "./modules/academic-structure/academic-structure.module";
import { LearnersModule } from "./modules/learners/learners.module";
import { GuardiansModule } from "./modules/guardians/guardians.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { AcademicsModule } from "./modules/academics/academics.module";
import { FeesModule } from "./modules/fees/fees.module";
import { CommunicationsModule } from "./modules/communications/communications.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Powers the fees module's payment-reconciliation cron
    // (`PaymentsReconciliationScheduler`) — registered once, globally,
    // here, same as `ConfigModule.forRoot`.
    ScheduleModule.forRoot(),
    // Powers the attendance -> absence-alert and report-card ->
    // report-card-ready event seams the communications module listens on
    // (see `AttendanceService`/`ReportCardsService`'s `eventEmitter.emit`
    // calls and `NotificationTriggersService`'s `@OnEvent` handlers).
    // `forRoot()` registers `EventEmitter2` globally, same pattern as
    // `ConfigModule.forRoot({ isGlobal: true })`.
    EventEmitterModule.forRoot(),
    PrismaModule,
    TenantContextModule,
    AuditModule,
    HealthModule,
    AuthModule,
    AcademicStructureModule,
    LearnersModule,
    GuardiansModule,
    AttendanceModule,
    AcademicsModule,
    FeesModule,
    CommunicationsModule,
  ],
})
export class AppModule {}

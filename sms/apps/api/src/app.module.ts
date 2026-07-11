import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    TenantContextModule,
    AuditModule,
    HealthModule,
    AuthModule,
    AcademicStructureModule,
    LearnersModule,
    GuardiansModule,
    AttendanceModule,
  ],
})
export class AppModule {}

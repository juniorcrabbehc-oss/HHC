import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { FeaturesController } from "./features.controller";

@Module({
  controllers: [HealthController, FeaturesController],
})
export class HealthModule {}

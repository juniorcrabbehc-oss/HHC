import { Module } from "@nestjs/common";
import { LearnersController } from "./learners.controller";
import { LearnersService } from "./learners.service";

@Module({
  controllers: [LearnersController],
  providers: [LearnersService],
  exports: [LearnersService],
})
export class LearnersModule {}

import { Module } from "@nestjs/common";
import { AssessmentConfigController } from "./assessment-config.controller";
import { AssessmentConfigService } from "./assessment-config.service";
import { GradingBandsController } from "./grading-bands.controller";
import { GradingBandsService } from "./grading-bands.service";
import { CaScoresController } from "./ca-scores.controller";
import { CaScoresService } from "./ca-scores.service";
import { ExamScoresController } from "./exam-scores.controller";
import { ExamScoresService } from "./exam-scores.service";
import { ReportCardsController } from "./report-cards.controller";
import { ReportCardsService } from "./report-cards.service";

@Module({
  controllers: [
    AssessmentConfigController,
    GradingBandsController,
    CaScoresController,
    ExamScoresController,
    ReportCardsController,
  ],
  providers: [
    AssessmentConfigService,
    GradingBandsService,
    CaScoresService,
    ExamScoresService,
    ReportCardsService,
  ],
})
export class AcademicsModule {}

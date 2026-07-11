import type { Prisma } from "@prisma/client";
import type {
  AssessmentConfig as PrismaAssessmentConfig,
  CaScore as PrismaCaScore,
  ExamScore as PrismaExamScore,
  GradingBand as PrismaGradingBand,
  ReportCard as PrismaReportCard,
  ReportCardItem as PrismaReportCardItem,
} from "@prisma/client";

/**
 * Prisma's `Decimal` type serializes to a string via its own `toJSON()`
 * when passed straight through `JSON.stringify` (e.g. returned raw from a
 * controller). That's surprising for API consumers whose shared-types zod
 * schemas declare these fields as `z.number()` — so every academics
 * response is explicitly mapped to plain numbers here instead.
 */
function toNum(value: Prisma.Decimal): number {
  return Number(value);
}

function toNumOrNull(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

export function serializeAssessmentConfig(record: PrismaAssessmentConfig) {
  return {
    ...record,
    caWeightPct: toNum(record.caWeightPct),
    examWeightPct: toNum(record.examWeightPct),
  };
}

export function serializeGradingBand(record: PrismaGradingBand) {
  return {
    ...record,
    minScore: toNum(record.minScore),
    maxScore: toNum(record.maxScore),
  };
}

export function serializeCaScore(record: PrismaCaScore) {
  return {
    ...record,
    maxScore: toNum(record.maxScore),
    scoreObtained: toNum(record.scoreObtained),
    weightPct: toNum(record.weightPct),
  };
}

export function serializeExamScore(record: PrismaExamScore) {
  return {
    ...record,
    maxScore: toNum(record.maxScore),
    scoreObtained: toNum(record.scoreObtained),
  };
}

export function serializeReportCardItem(record: PrismaReportCardItem) {
  return {
    ...record,
    caTotal: toNum(record.caTotal),
    examTotal: toNum(record.examTotal),
    totalScore: toNum(record.totalScore),
  };
}

export function serializeReportCard(
  record: PrismaReportCard & { items?: PrismaReportCardItem[] },
) {
  return {
    ...record,
    overallAverage: toNumOrNull(record.overallAverage),
    items: record.items?.map(serializeReportCardItem),
  };
}

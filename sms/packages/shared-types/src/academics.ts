import { z } from "zod";

/**
 * Mirrors the Prisma `LevelStage` enum. Kept upper-case (matching the DB
 * enum + the existing `/levels` API response shape) rather than lower-cased
 * like `AttendanceStatus`, since `Level.stage` is already exposed to clients
 * in that casing (see `LevelDto` in the web app's api-client).
 */
export const levelStageSchema = z.enum([
  "CRECHE",
  "NURSERY",
  "KG",
  "PRIMARY",
  "JHS",
]);

export type LevelStage = z.infer<typeof levelStageSchema>;

// ---------------------------------------------------------------------------
// Assessment config (per-level CA/exam weight split)
// ---------------------------------------------------------------------------

export const assessmentConfigWriteSchema = z.object({
  levelStage: levelStageSchema,
  caWeightPct: z.number().min(0).max(100),
  examWeightPct: z.number().min(0).max(100),
  academicYearId: z.string().uuid(),
});

export type AssessmentConfigWrite = z.infer<typeof assessmentConfigWriteSchema>;

export const assessmentConfigSchema = assessmentConfigWriteSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
});

export type AssessmentConfig = z.infer<typeof assessmentConfigSchema>;

// ---------------------------------------------------------------------------
// Grading bands
// ---------------------------------------------------------------------------

export const gradingBandWriteSchema = z.object({
  name: z.string().min(1),
  minScore: z.number(),
  maxScore: z.number(),
  grade: z.string().min(1),
  descriptor: z.string().min(1),
  remark: z.string().optional().nullable(),
  levelStage: levelStageSchema,
  isActive: z.boolean().default(true),
});

export type GradingBandWrite = z.infer<typeof gradingBandWriteSchema>;

export const gradingBandSchema = gradingBandWriteSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
});

export type GradingBand = z.infer<typeof gradingBandSchema>;

// ---------------------------------------------------------------------------
// CA scores — `clientUuid` is the idempotency key, same offline-sync
// pattern as `attendanceRecordWriteSchema`.
// ---------------------------------------------------------------------------

export const caScoreWriteSchema = z.object({
  clientUuid: z.string().uuid(),
  learnerId: z.string().uuid(),
  classSubjectId: z.string().uuid(),
  termId: z.string().uuid(),
  assessmentType: z.string().min(1),
  maxScore: z.number().positive(),
  scoreObtained: z.number().min(0),
  weightPct: z.number().min(0).max(100),
});

export type CaScoreWrite = z.infer<typeof caScoreWriteSchema>;

export const caScoreBatchWriteSchema = z.object({
  records: z.array(caScoreWriteSchema).min(1),
});

export type CaScoreBatchWrite = z.infer<typeof caScoreBatchWriteSchema>;

export const caScoreSchema = caScoreWriteSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  recordedBy: z.string().uuid(),
});

export type CaScore = z.infer<typeof caScoreSchema>;

// ---------------------------------------------------------------------------
// Exam scores
// ---------------------------------------------------------------------------

export const examScoreWriteSchema = z.object({
  clientUuid: z.string().uuid(),
  learnerId: z.string().uuid(),
  classSubjectId: z.string().uuid(),
  termId: z.string().uuid(),
  examType: z.string().min(1),
  maxScore: z.number().positive(),
  scoreObtained: z.number().min(0),
});

export type ExamScoreWrite = z.infer<typeof examScoreWriteSchema>;

export const examScoreBatchWriteSchema = z.object({
  records: z.array(examScoreWriteSchema).min(1),
});

export type ExamScoreBatchWrite = z.infer<typeof examScoreBatchWriteSchema>;

export const examScoreSchema = examScoreWriteSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  recordedBy: z.string().uuid(),
});

export type ExamScore = z.infer<typeof examScoreSchema>;

// ---------------------------------------------------------------------------
// Report cards
// ---------------------------------------------------------------------------

export const reportCardStatusSchema = z.enum(["draft", "published"]);
export type ReportCardStatus = z.infer<typeof reportCardStatusSchema>;

export const reportCardItemSchema = z.object({
  id: z.string().uuid(),
  reportCardId: z.string().uuid(),
  subjectId: z.string().uuid(),
  caTotal: z.number(),
  examTotal: z.number(),
  totalScore: z.number(),
  grade: z.string(),
  remark: z.string().optional().nullable(),
});

export type ReportCardItem = z.infer<typeof reportCardItemSchema>;

export const reportCardSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  learnerId: z.string().uuid(),
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  overallAverage: z.number().optional().nullable(),
  overallGrade: z.string().optional().nullable(),
  positionInClass: z.number().int().optional().nullable(),
  conductRemark: z.string().optional().nullable(),
  teacherRemark: z.string().optional().nullable(),
  headRemark: z.string().optional().nullable(),
  pdfUrl: z.string().optional().nullable(),
  status: reportCardStatusSchema,
  items: z.array(reportCardItemSchema).optional(),
});

export type ReportCard = z.infer<typeof reportCardSchema>;

export const generateReportCardsSchema = z.object({
  classId: z.string().uuid(),
  termId: z.string().uuid(),
});

export type GenerateReportCardsInput = z.infer<typeof generateReportCardsSchema>;

import type {
  AttendanceStatus,
  AttendanceSource,
  Gender,
  GuardianRelationship,
  InvoiceStatus,
  LearnerStatus,
  LevelStage,
  MomoProvider,
  PaymentMethod,
  PaymentStatus,
  Role,
} from "@sms/shared-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
}

const ACCESS_TOKEN_KEY = "sms.accessToken";
// No longer written — the refresh token lives in the `sms_refresh`
// httpOnly cookie set by the API. Kept only so clearTokens/setTokens can
// scrub the value older builds left behind in localStorage.
const LEGACY_REFRESH_TOKEN_KEY = "sms.refreshToken";
const USER_KEY = "sms.user";

export interface StoredUser {
  id: string;
  schoolId: string;
  email?: string | null;
  phone?: string | null;
  roles: Role[];
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getCurrentUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

/**
 * Stores the short-lived access token (and user summary) in localStorage.
 * The refresh token is deliberately NOT handled here — it lives in the
 * `sms_refresh` httpOnly cookie the API sets on login/refresh, out of
 * reach of JavaScript. (Moving the access token itself out of
 * localStorage — e.g. into memory only — is a further-hardening
 * candidate, accepted tradeoff for now.)
 */
export function setTokens(auth: { accessToken: string; user?: StoredUser }): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, auth.accessToken);
  // Scrub any refresh token an older build persisted.
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  if (auth.user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
  }
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

/**
 * Ends the session: asks the API to clear the `sms_refresh` httpOnly
 * cookie (needs `credentials: "include"` so the cookie is sent), then
 * drops local state. Best-effort — local state is cleared even if the
 * network call fails.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch<undefined>("/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // Ignore — clearing local state below is what logs the UI out.
  }
  clearTokens();
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, auth, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = getAccessToken();
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : undefined;

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && String((data as { message: unknown }).message)) ||
      response.statusText;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers (Phase 1 — academic structure / learners / guardians)
// ---------------------------------------------------------------------------

export interface LevelDto {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  stage: "CRECHE" | "NURSERY" | "KG" | "PRIMARY" | "JHS";
}

export interface ClassDto {
  id: string;
  schoolId: string;
  levelId: string;
  academicYearId: string;
  name: string;
  classTeacherId: string | null;
  capacity: number | null;
  level?: LevelDto;
}

export interface ClassEnrollmentSummary {
  id: string;
  classId: string;
  academicYearId: string;
  status: string;
  class?: ClassDto;
}

export interface LearnerSummary {
  id: string;
  schoolId: string;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string | null;
  dob: string;
  gender: Gender;
  admissionDate: string;
  status: LearnerStatus;
  classEnrollments?: ClassEnrollmentSummary[];
}

export interface GuardianSummary {
  id: string;
  fullName: string;
  phonePrimary: string;
  phoneSecondary?: string | null;
  email?: string | null;
}

export interface GuardianLearnerLink {
  guardianId: string;
  learnerId: string;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
  isEmergencyContact: boolean;
  guardian?: GuardianSummary;
}

export interface LearnerDetail extends LearnerSummary {
  guardianLearners: GuardianLearnerLink[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GuardianLinkInput {
  guardianId?: string;
  fullName?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
  email?: string;
  address?: string;
  idType?: string;
  idNumber?: string;
  smsOptIn?: boolean;
  relationship: GuardianRelationship | string;
  isPrimaryContact?: boolean;
  isEmergencyContact?: boolean;
}

export interface RegisterLearnerInput {
  admissionNumber: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  dob: string;
  gender: Gender;
  admissionDate: string;
  medicalNotes?: string;
  allergies?: string;
  bloodGroup?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  classId?: string;
  guardians?: GuardianLinkInput[];
}

export interface ListLearnersParams {
  classId?: string;
  status?: LearnerStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TermDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface AttendanceRecordDto {
  id: string;
  schoolId: string;
  classId: string;
  learnerId: string;
  termId: string;
  date: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  clientUuid: string;
  notes?: string | null;
  recordedBy: string;
}

export interface AttendanceRegisterRow {
  learnerId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  record: AttendanceRecordDto | null;
}

export interface AttendanceSyncResultItem {
  clientUuid: string;
  status: "created" | "updated" | "unchanged" | "failed";
  id?: string;
  errorMessage?: string;
}

export interface FeatureFlagsDto {
  momoEnabled: boolean;
  smsEnabled: boolean;
}

/**
 * Provider-derived feature flags (public endpoint, no auth). Defaults to
 * everything-off on failure so a flaky network hides optional flows
 * rather than surfacing ones that would error when used.
 */
export async function getFeatures(): Promise<FeatureFlagsDto> {
  try {
    return await apiFetch<FeatureFlagsDto>("/config/features");
  } catch {
    return { momoEnabled: false, smsEnabled: false };
  }
}

export function getLevels(): Promise<LevelDto[]> {
  return apiFetch<LevelDto[]>("/levels", { auth: true });
}

export function getClasses(params: { classTeacherId?: string; academicYearId?: string } = {}): Promise<ClassDto[]> {
  const searchParams = new URLSearchParams();
  if (params.classTeacherId) searchParams.set("classTeacherId", params.classTeacherId);
  if (params.academicYearId) searchParams.set("academicYearId", params.academicYearId);
  const query = searchParams.toString();
  return apiFetch<ClassDto[]>(`/classes${query ? `?${query}` : ""}`, { auth: true });
}

export function getTerms(academicYearId: string): Promise<TermDto[]> {
  const searchParams = new URLSearchParams({ academicYearId });
  return apiFetch<TermDto[]>(`/terms?${searchParams.toString()}`, { auth: true });
}

export function getAttendanceRegister(classId: string, date: string): Promise<AttendanceRegisterRow[]> {
  const searchParams = new URLSearchParams({ classId, date });
  return apiFetch<AttendanceRegisterRow[]>(`/attendance/records?${searchParams.toString()}`, { auth: true });
}

export function markAttendance(payload: {
  clientUuid: string;
  classId: string;
  learnerId: string;
  termId: string;
  date: string;
  status: AttendanceStatus;
  notes?: string;
  source?: AttendanceSource;
}): Promise<AttendanceRecordDto> {
  return apiFetch<AttendanceRecordDto>("/attendance/records", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function markAttendanceBulk(records: unknown[]): Promise<AttendanceSyncResultItem[]> {
  return apiFetch<AttendanceSyncResultItem[]>("/attendance/records/bulk", {
    method: "POST",
    auth: true,
    body: { records },
  });
}

export function createLearner(input: RegisterLearnerInput): Promise<LearnerSummary> {
  return apiFetch<LearnerSummary>("/learners", {
    method: "POST",
    auth: true,
    body: input,
  });
}

export function listLearners(params: ListLearnersParams = {}): Promise<PaginatedResult<LearnerSummary>> {
  const searchParams = new URLSearchParams();
  if (params.classId) searchParams.set("classId", params.classId);
  if (params.status) searchParams.set("status", params.status);
  if (params.search) searchParams.set("search", params.search);
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

  const query = searchParams.toString();
  return apiFetch<PaginatedResult<LearnerSummary>>(`/learners${query ? `?${query}` : ""}`, { auth: true });
}

export function getLearner(id: string): Promise<LearnerDetail> {
  return apiFetch<LearnerDetail>(`/learners/${id}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers (Phase 3 — academics: CA/exam scores, report cards)
// ---------------------------------------------------------------------------

export interface SubjectDto {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  isCore: boolean;
}

export interface ClassSubjectDto {
  id: string;
  schoolId: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  subject?: SubjectDto;
  class?: ClassDto;
}

export interface AssessmentConfigDto {
  id: string;
  schoolId: string;
  levelStage: LevelStage;
  caWeightPct: number;
  examWeightPct: number;
  academicYearId: string;
}

export interface GradingBandDto {
  id: string;
  schoolId: string;
  name: string;
  minScore: number;
  maxScore: number;
  grade: string;
  descriptor: string;
  remark?: string | null;
  levelStage: LevelStage;
  isActive: boolean;
}

export interface CaScoreDto {
  id: string;
  schoolId: string;
  learnerId: string;
  classSubjectId: string;
  termId: string;
  assessmentType: string;
  maxScore: number;
  scoreObtained: number;
  weightPct: number;
  recordedBy: string;
  clientUuid: string;
}

export interface ExamScoreDto {
  id: string;
  schoolId: string;
  learnerId: string;
  classSubjectId: string;
  termId: string;
  examType: string;
  maxScore: number;
  scoreObtained: number;
  recordedBy: string;
  clientUuid: string;
}

export interface ScoreRosterRow<TScore> {
  learnerId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  scores: TScore[];
}

export interface ScoreSyncResultItem {
  clientUuid: string;
  status: "created" | "updated" | "unchanged" | "failed";
  id?: string;
  errorMessage?: string;
}

export interface ReportCardItemDto {
  id: string;
  reportCardId: string;
  subjectId: string;
  subject?: SubjectDto;
  caTotal: number;
  examTotal: number;
  totalScore: number;
  grade: string;
  remark?: string | null;
}

export interface ReportCardDto {
  id: string;
  schoolId: string;
  learnerId: string;
  termId: string;
  classId: string;
  overallAverage: number | null;
  overallGrade: string | null;
  positionInClass: number | null;
  conductRemark?: string | null;
  teacherRemark?: string | null;
  headRemark?: string | null;
  pdfUrl?: string | null;
  status: "draft" | "published";
  items?: ReportCardItemDto[];
  learner?: LearnerSummary;
  term?: TermDto;
  class?: ClassDto;
}

export function getClassSubjects(classId: string): Promise<ClassSubjectDto[]> {
  const searchParams = new URLSearchParams({ classId });
  return apiFetch<ClassSubjectDto[]>(`/class-subjects?${searchParams.toString()}`, { auth: true });
}

export function getAssessmentConfig(params: { academicYearId?: string; levelStage?: LevelStage } = {}): Promise<AssessmentConfigDto[]> {
  const searchParams = new URLSearchParams();
  if (params.academicYearId) searchParams.set("academicYearId", params.academicYearId);
  if (params.levelStage) searchParams.set("levelStage", params.levelStage);
  const query = searchParams.toString();
  return apiFetch<AssessmentConfigDto[]>(`/assessment-config${query ? `?${query}` : ""}`, { auth: true });
}

export function getGradingBands(levelStage?: LevelStage): Promise<GradingBandDto[]> {
  const query = levelStage ? `?levelStage=${levelStage}` : "";
  return apiFetch<GradingBandDto[]>(`/grading-bands${query}`, { auth: true });
}

export function getCaScoreRoster(classSubjectId: string, termId: string): Promise<ScoreRosterRow<CaScoreDto>[]> {
  const searchParams = new URLSearchParams({ classSubjectId, termId });
  return apiFetch<ScoreRosterRow<CaScoreDto>[]>(`/ca-scores?${searchParams.toString()}`, { auth: true });
}

export function markCaScore(payload: {
  clientUuid: string;
  learnerId: string;
  classSubjectId: string;
  termId: string;
  assessmentType: string;
  maxScore: number;
  scoreObtained: number;
  weightPct: number;
}): Promise<CaScoreDto> {
  return apiFetch<CaScoreDto>("/ca-scores", { method: "POST", auth: true, body: payload });
}

export function markCaScoreBulk(records: unknown[]): Promise<ScoreSyncResultItem[]> {
  return apiFetch<ScoreSyncResultItem[]>("/ca-scores/bulk", { method: "POST", auth: true, body: { records } });
}

export function getExamScoreRoster(classSubjectId: string, termId: string): Promise<ScoreRosterRow<ExamScoreDto>[]> {
  const searchParams = new URLSearchParams({ classSubjectId, termId });
  return apiFetch<ScoreRosterRow<ExamScoreDto>[]>(`/exam-scores?${searchParams.toString()}`, { auth: true });
}

export function markExamScore(payload: {
  clientUuid: string;
  learnerId: string;
  classSubjectId: string;
  termId: string;
  examType: string;
  maxScore: number;
  scoreObtained: number;
}): Promise<ExamScoreDto> {
  return apiFetch<ExamScoreDto>("/exam-scores", { method: "POST", auth: true, body: payload });
}

export function markExamScoreBulk(records: unknown[]): Promise<ScoreSyncResultItem[]> {
  return apiFetch<ScoreSyncResultItem[]>("/exam-scores/bulk", { method: "POST", auth: true, body: { records } });
}

export function generateReportCards(classId: string, termId: string): Promise<ReportCardDto[]> {
  return apiFetch<ReportCardDto[]>("/report-cards/generate", { method: "POST", auth: true, body: { classId, termId } });
}

export function publishReportCard(id: string): Promise<ReportCardDto> {
  return apiFetch<ReportCardDto>(`/report-cards/${id}/publish`, { method: "POST", auth: true });
}

export function getReportCard(id: string): Promise<ReportCardDto> {
  return apiFetch<ReportCardDto>(`/report-cards/${id}`, { auth: true });
}

export function listReportCards(classId: string, termId: string): Promise<ReportCardDto[]> {
  const searchParams = new URLSearchParams({ classId, termId });
  return apiFetch<ReportCardDto[]>(`/report-cards?${searchParams.toString()}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers (Phase 4 — fees & MoMo payments)
// ---------------------------------------------------------------------------

export interface FeeItemDto {
  id: string;
  schoolId: string;
  feeStructureId: string;
  name: string;
  amount: number;
  isOptional: boolean;
}

export interface FeeStructureDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  levelId: string;
  name: string;
  feeItems?: FeeItemDto[];
}

export interface InvoiceLineItemDto {
  id: string;
  schoolId: string;
  invoiceId: string;
  feeItemId?: string | null;
  description: string;
  amount: number;
}

export interface InvoiceDto {
  id: string;
  schoolId: string;
  learnerId: string;
  termId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: InvoiceStatus;
  lastReminderSentAt?: string | null;
  lineItems?: InvoiceLineItemDto[];
  payments?: PaymentDto[];
  learner?: LearnerSummary;
}

export interface GenerateInvoicesResultDto {
  created: InvoiceDto[];
  skipped: { learnerId: string; reason: string }[];
}

export interface PaymentDto {
  id: string;
  schoolId: string;
  learnerId: string;
  invoiceId?: string | null;
  amount: number;
  method: PaymentMethod;
  momoProvider?: MomoProvider | null;
  status: PaymentStatus;
  providerReference?: string | null;
  providerTransactionId?: string | null;
  clientUuid: string;
  paidAt?: string | null;
  receiptId?: string | null;
}

export interface InitiateMomoResponseDto {
  payment: PaymentDto;
  providerStatus: string;
  displayText: string | null;
}

export interface PaymentAllocationDto {
  id: string;
  schoolId: string;
  paymentId: string;
  invoiceId: string;
  amountAllocated: number;
}

export interface ReceiptDto {
  id: string;
  schoolId: string;
  paymentId: string;
  receiptNumber: string;
  issuedAt: string;
  pdfUrl?: string | null;
  payment?: PaymentDto;
  allocations?: PaymentAllocationDto[];
}

export function createFeeStructure(input: {
  academicYearId: string;
  termId: string;
  levelId: string;
  name: string;
  feeItems: { name: string; amount: number; isOptional?: boolean }[];
}): Promise<FeeStructureDto> {
  return apiFetch<FeeStructureDto>("/fee-structures", { method: "POST", auth: true, body: input });
}

export function listFeeStructures(params: { academicYearId?: string; termId?: string; levelId?: string } = {}): Promise<FeeStructureDto[]> {
  const searchParams = new URLSearchParams();
  if (params.academicYearId) searchParams.set("academicYearId", params.academicYearId);
  if (params.termId) searchParams.set("termId", params.termId);
  if (params.levelId) searchParams.set("levelId", params.levelId);
  const query = searchParams.toString();
  return apiFetch<FeeStructureDto[]>(`/fee-structures${query ? `?${query}` : ""}`, { auth: true });
}

export function getFeeStructure(id: string): Promise<FeeStructureDto> {
  return apiFetch<FeeStructureDto>(`/fee-structures/${id}`, { auth: true });
}

export function generateInvoices(input: { termId: string; classId?: string; levelId?: string }): Promise<GenerateInvoicesResultDto> {
  return apiFetch<GenerateInvoicesResultDto>("/invoices/generate", { method: "POST", auth: true, body: input });
}

export function listInvoices(params: { learnerId?: string; termId?: string; status?: InvoiceStatus } = {}): Promise<InvoiceDto[]> {
  const searchParams = new URLSearchParams();
  if (params.learnerId) searchParams.set("learnerId", params.learnerId);
  if (params.termId) searchParams.set("termId", params.termId);
  if (params.status) searchParams.set("status", params.status);
  const query = searchParams.toString();
  return apiFetch<InvoiceDto[]>(`/invoices${query ? `?${query}` : ""}`, { auth: true });
}

export function getInvoice(id: string): Promise<InvoiceDto> {
  return apiFetch<InvoiceDto>(`/invoices/${id}`, { auth: true });
}

export function updateInvoice(
  id: string,
  input: { addLineItems?: { description: string; amount: number }[]; removeLineItemIds?: string[]; dueDate?: string },
): Promise<InvoiceDto> {
  return apiFetch<InvoiceDto>(`/invoices/${id}`, { method: "PATCH", auth: true, body: input });
}

export function initiateMomoPayment(input: {
  invoiceId: string;
  amount: number;
  phone: string;
  provider: MomoProvider;
}): Promise<InitiateMomoResponseDto> {
  return apiFetch<InitiateMomoResponseDto>("/payments/momo/initiate", { method: "POST", auth: true, body: input });
}

export function createCashPayment(input: {
  invoiceId: string;
  amount: number;
  method: "cash" | "bank_transfer";
  reference?: string;
}): Promise<PaymentDto> {
  return apiFetch<PaymentDto>("/payments/cash", { method: "POST", auth: true, body: input });
}

export function getPaymentStatus(id: string): Promise<PaymentDto> {
  return apiFetch<PaymentDto>(`/payments/${id}/status`, { auth: true });
}

export function getReceipt(id: string): Promise<ReceiptDto> {
  return apiFetch<ReceiptDto>(`/receipts/${id}`, { auth: true });
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers (Phase 5 — communications: messages & templates)
// ---------------------------------------------------------------------------

export type MessageChannel = "sms" | "in_app";
export type MessageEventTrigger = "absence_alert" | "fee_reminder" | "report_card_ready" | "payment_received" | "manual";
export type MessageStatus = "queued" | "sent" | "delivered" | "failed";

export interface MessageTemplateDto {
  id: string;
  schoolId: string;
  name: string;
  channel: MessageChannel;
  eventTrigger: MessageEventTrigger;
  bodyTemplate: string;
  isActive: boolean;
}

export interface MessageDto {
  id: string;
  schoolId: string;
  channel: MessageChannel;
  templateId?: string | null;
  recipientGuardianId?: string | null;
  recipientPhone?: string | null;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  status: MessageStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
}

export function listMessages(box: "inbox" = "inbox"): Promise<MessageDto[]> {
  const searchParams = new URLSearchParams({ box });
  return apiFetch<MessageDto[]>(`/messages?${searchParams.toString()}`, { auth: true });
}

export function getMessage(id: string): Promise<MessageDto> {
  return apiFetch<MessageDto>(`/messages/${id}`, { auth: true });
}

export function sendMessage(input: {
  guardianId?: string;
  learnerId?: string;
  channel: MessageChannel;
  body: string;
}): Promise<MessageDto> {
  return apiFetch<MessageDto>("/messages", { method: "POST", auth: true, body: input });
}

export function listMessageTemplates(params: { eventTrigger?: MessageEventTrigger; channel?: MessageChannel } = {}): Promise<MessageTemplateDto[]> {
  const searchParams = new URLSearchParams();
  if (params.eventTrigger) searchParams.set("eventTrigger", params.eventTrigger);
  if (params.channel) searchParams.set("channel", params.channel);
  const query = searchParams.toString();
  return apiFetch<MessageTemplateDto[]>(`/message-templates${query ? `?${query}` : ""}`, { auth: true });
}

export function createMessageTemplate(input: {
  name: string;
  channel: MessageChannel;
  eventTrigger: MessageEventTrigger;
  bodyTemplate: string;
  isActive?: boolean;
}): Promise<MessageTemplateDto> {
  return apiFetch<MessageTemplateDto>("/message-templates", { method: "POST", auth: true, body: input });
}

export function updateMessageTemplate(
  id: string,
  input: { name?: string; bodyTemplate?: string; isActive?: boolean },
): Promise<MessageTemplateDto> {
  return apiFetch<MessageTemplateDto>(`/message-templates/${id}`, { method: "PATCH", auth: true, body: input });
}

// ---------------------------------------------------------------------------
// Typed endpoint helpers (Phase 6 — timetable & scheduling)
// ---------------------------------------------------------------------------

export interface PeriodDto {
  id: string;
  schoolId: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isBreak: boolean;
}

export interface RoomDto {
  id: string;
  schoolId: string;
  name: string;
  capacity: number | null;
}

export interface TimetableSlotDto {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
  periodId: string;
  /** ISO weekday: 1 = Monday ... 5 = Friday. */
  dayOfWeek: number;
  subject?: SubjectDto;
  period?: PeriodDto;
  room?: RoomDto | null;
  teacher?: { id: string; email: string | null; phone: string | null } | null;
  class?: { id: string; name: string };
}

export interface ClassTimetableDto {
  class: { id: string; name: string; academicYearId: string };
  slots: TimetableSlotDto[];
}

export interface MyClassTimetableDto {
  class: { id: string; name: string };
  learnerNames: string[];
  slots: TimetableSlotDto[];
}

export interface TeacherTimetableDto {
  teacherId: string;
  slots: TimetableSlotDto[];
}

export function getPeriods(): Promise<PeriodDto[]> {
  return apiFetch<PeriodDto[]>("/periods", { auth: true });
}

export function createPeriod(input: {
  name: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  isBreak?: boolean;
}): Promise<PeriodDto> {
  return apiFetch<PeriodDto>("/periods", { method: "POST", auth: true, body: input });
}

export function deletePeriod(id: string): Promise<PeriodDto> {
  return apiFetch<PeriodDto>(`/periods/${id}`, { method: "DELETE", auth: true });
}

export function getRooms(): Promise<RoomDto[]> {
  return apiFetch<RoomDto[]>("/rooms", { auth: true });
}

export function createRoom(input: { name: string; capacity?: number }): Promise<RoomDto> {
  return apiFetch<RoomDto>("/rooms", { method: "POST", auth: true, body: input });
}

export function deleteRoom(id: string): Promise<RoomDto> {
  return apiFetch<RoomDto>(`/rooms/${id}`, { method: "DELETE", auth: true });
}

export function getClassTimetable(classId: string): Promise<ClassTimetableDto> {
  return apiFetch<ClassTimetableDto>(`/timetable/class/${classId}`, { auth: true });
}

export function getMyTeacherTimetable(): Promise<TeacherTimetableDto> {
  return apiFetch<TeacherTimetableDto>("/timetable/teacher/me", { auth: true });
}

export function getMyClassTimetables(): Promise<MyClassTimetableDto[]> {
  return apiFetch<MyClassTimetableDto[]>("/timetable/mine", { auth: true });
}

export function createTimetableSlot(input: {
  classId: string;
  subjectId: string;
  periodId: string;
  dayOfWeek: number;
  teacherId?: string | null;
  roomId?: string | null;
}): Promise<TimetableSlotDto> {
  return apiFetch<TimetableSlotDto>("/timetable/slots", { method: "POST", auth: true, body: input });
}

export function deleteTimetableSlot(id: string): Promise<TimetableSlotDto> {
  return apiFetch<TimetableSlotDto>(`/timetable/slots/${id}`, { method: "DELETE", auth: true });
}

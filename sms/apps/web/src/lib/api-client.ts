import type { AttendanceStatus, AttendanceSource, Gender, GuardianRelationship, LearnerStatus, Role } from "@sms/shared-types";

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
const REFRESH_TOKEN_KEY = "sms.refreshToken";
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

export function setTokens(auth: { accessToken: string; refreshToken: string; user?: StoredUser }): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, auth.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
  if (auth.user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
  }
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
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

/**
 * Normalizes a date-only (or full ISO) string to midnight UTC so repeated
 * writes/reads for "the same calendar day" compare equal regardless of the
 * exact string format the client sent (`"2026-07-11"` vs a full ISO
 * timestamp). Used anywhere a DateTime column is really being used as a
 * per-day key (e.g. AttendanceRecord.date).
 */
export function toDateOnly(value: string | Date): Date {
  const isoDate = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  return new Date(`${isoDate}T00:00:00.000Z`);
}

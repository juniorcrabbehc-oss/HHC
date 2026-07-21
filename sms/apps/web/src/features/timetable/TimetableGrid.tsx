"use client";

import type { ReactNode } from "react";
import type { PeriodDto, TimetableSlotDto } from "../../lib/api-client";

export const SCHOOL_DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
] as const;

/** Short display handle for a teacher: email local part, else phone. */
export function teacherHandle(teacher: TimetableSlotDto["teacher"]): string | null {
  if (!teacher) return null;
  if (teacher.email) return teacher.email.split("@")[0];
  return teacher.phone ?? null;
}

interface TimetableGridProps {
  periods: PeriodDto[];
  slots: TimetableSlotDto[];
  /** Renders an occupied cell. */
  renderSlot: (slot: TimetableSlotDto) => ReactNode;
  /** Renders an empty (non-break) cell — used by the builder for "add" affordances. */
  renderEmptyCell?: (dayOfWeek: number, period: PeriodDto) => ReactNode;
}

/**
 * Read-only weekly grid: one row per period (breaks span the week), one
 * column per school day. Purely presentational — callers decide what an
 * occupied or empty cell looks like.
 */
export function TimetableGrid({ periods, slots, renderSlot, renderEmptyCell }: TimetableGridProps) {
  const slotFor = (dayOfWeek: number, periodId: string): TimetableSlotDto | undefined =>
    slots.find((slot) => slot.dayOfWeek === dayOfWeek && slot.periodId === periodId);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {SCHOOL_DAYS.map((day) => (
              <th key={day.value} scope="col">
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <th scope="row" className="nowrap">
                {period.name}
                <div className="muted">
                  {period.startTime}–{period.endTime}
                </div>
              </th>
              {period.isBreak ? (
                <td colSpan={SCHOOL_DAYS.length} className="muted" style={{ textAlign: "center" }}>
                  {period.name}
                </td>
              ) : (
                SCHOOL_DAYS.map((day) => {
                  const slot = slotFor(day.value, period.id);
                  return (
                    <td key={day.value}>
                      {slot ? renderSlot(slot) : renderEmptyCell ? renderEmptyCell(day.value, period) : null}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

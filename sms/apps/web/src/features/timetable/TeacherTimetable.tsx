"use client";

import { useEffect, useState } from "react";
import { ApiError, getMyTeacherTimetable, getPeriods } from "../../lib/api-client";
import type { PeriodDto, TimetableSlotDto } from "../../lib/api-client";
import { TimetableGrid } from "./TimetableGrid";

/** A teacher's own weekly timetable, read-only. */
export function TeacherTimetable() {
  const [periods, setPeriods] = useState<PeriodDto[]>([]);
  const [slots, setSlots] = useState<TimetableSlotDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPeriods(), getMyTeacherTimetable()])
      .then(([fetchedPeriods, timetable]) => {
        if (cancelled) return;
        setPeriods(fetchedPeriods);
        setSlots(timetable.slots);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load your timetable.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <p className="loading">Loading your timetable...</p>;
  if (error)
    return (
      <p role="alert" className="alert alert-error">
        {error}
      </p>
    );
  if (slots.length === 0) return <p className="muted">No lessons on your timetable yet.</p>;

  return (
    <div className="card">
      <TimetableGrid
        periods={periods}
        slots={slots}
        renderSlot={(slot) => (
          <div>
            <strong>{slot.class?.name ?? "Class"}</strong>
            <div>{slot.subject?.name}</div>
            {slot.room ? <div className="muted">{slot.room.name}</div> : null}
          </div>
        )}
      />
    </div>
  );
}

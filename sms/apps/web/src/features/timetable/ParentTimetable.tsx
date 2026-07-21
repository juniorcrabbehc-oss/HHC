"use client";

import { useEffect, useState } from "react";
import { ApiError, getMyClassTimetables, getPeriods } from "../../lib/api-client";
import type { MyClassTimetableDto, PeriodDto } from "../../lib/api-client";
import { TimetableGrid, teacherHandle } from "./TimetableGrid";

/**
 * Parent/learner view: one read-only weekly grid per class a linked
 * learner is enrolled in (server-scoped — no class picker needed).
 */
export function ParentTimetable() {
  const [periods, setPeriods] = useState<PeriodDto[]>([]);
  const [timetables, setTimetables] = useState<MyClassTimetableDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPeriods(), getMyClassTimetables()])
      .then(([fetchedPeriods, fetchedTimetables]) => {
        if (cancelled) return;
        setPeriods(fetchedPeriods);
        setTimetables(fetchedTimetables);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load the timetable.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <p className="loading">Loading timetable...</p>;
  if (error)
    return (
      <p role="alert" className="alert alert-error">
        {error}
      </p>
    );
  if (timetables.length === 0)
    return <p className="muted">No class timetable available yet for your linked learner(s).</p>;

  return (
    <div>
      {timetables.map((timetable) => (
        <div key={timetable.class.id} className="card">
          <h2>
            {timetable.class.name}
            <span className="muted"> — {timetable.learnerNames.join(", ")}</span>
          </h2>
          {timetable.slots.length === 0 ? (
            <p className="muted">No lessons scheduled yet.</p>
          ) : (
            <TimetableGrid
              periods={periods}
              slots={timetable.slots}
              renderSlot={(slot) => (
                <div>
                  <strong>{slot.subject?.name ?? "Lesson"}</strong>
                  {slot.room ? <div className="muted">{slot.room.name}</div> : null}
                  {teacherHandle(slot.teacher) ? <div className="muted">{teacherHandle(slot.teacher)}</div> : null}
                </div>
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

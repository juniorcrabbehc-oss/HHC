"use client";

import { TimetableBuilder } from "../../../../features/timetable/TimetableBuilder";

export default function AdminTimetablePage() {
  return (
    <main className="page">
      <h1 className="page-title">Timetable builder</h1>
      <TimetableBuilder />
    </main>
  );
}

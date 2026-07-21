"use client";

import { TeacherTimetable } from "../../../../features/timetable/TeacherTimetable";

export default function TeacherTimetablePage() {
  return (
    <main className="page">
      <h1 className="page-title">My timetable</h1>
      <TeacherTimetable />
    </main>
  );
}

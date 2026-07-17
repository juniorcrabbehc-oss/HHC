"use client";

import { AttendanceRegister } from "../../../../features/attendance/AttendanceRegister";

export default function TeacherAttendancePage() {
  return (
    <main className="page">
      <h1 className="page-title">Attendance</h1>
      <AttendanceRegister />
    </main>
  );
}

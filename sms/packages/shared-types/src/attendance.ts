import { z } from "zod";

export const attendanceStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "excused",
]);

export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const attendanceSourceSchema = z.enum(["web", "offline_sync"]);

export type AttendanceSource = z.infer<typeof attendanceSourceSchema>;

/**
 * A single attendance write. `clientUuid` is generated on the client
 * (web or offline PWA) so that repeated syncs of the same record are
 * idempotent server-side.
 */
export const attendanceRecordWriteSchema = z.object({
  clientUuid: z.string().uuid(),
  classId: z.string().uuid(),
  learnerId: z.string().uuid(),
  termId: z.string().uuid(),
  date: z.coerce.date(),
  status: attendanceStatusSchema,
  source: attendanceSourceSchema.default("web"),
  notes: z.string().optional().nullable(),
});

export type AttendanceRecordWrite = z.infer<typeof attendanceRecordWriteSchema>;

export const attendanceRecordBatchWriteSchema = z.object({
  records: z.array(attendanceRecordWriteSchema).min(1),
});

export type AttendanceRecordBatchWrite = z.infer<
  typeof attendanceRecordBatchWriteSchema
>;

export const attendanceRecordSchema = attendanceRecordWriteSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  recordedBy: z.string().uuid(),
});

export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

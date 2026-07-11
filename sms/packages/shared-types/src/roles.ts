import { z } from "zod";

export const ROLES = [
  "admin",
  "teacher",
  "bursar",
  "front_office",
  "parent",
  "learner",
] as const;

export const roleSchema = z.enum(ROLES);

export type Role = z.infer<typeof roleSchema>;

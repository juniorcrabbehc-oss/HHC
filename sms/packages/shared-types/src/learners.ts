import { z } from "zod";

export const genderSchema = z.enum(["male", "female"]);
export type Gender = z.infer<typeof genderSchema>;

export const learnerStatusSchema = z.enum([
  "active",
  "inactive",
  "graduated",
  "withdrawn",
  "transferred",
]);
export type LearnerStatus = z.infer<typeof learnerStatusSchema>;

export const createLearnerSchema = z.object({
  admissionNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  otherNames: z.string().optional().nullable(),
  dob: z.coerce.date(),
  gender: genderSchema,
  admissionDate: z.coerce.date(),
  status: learnerStatusSchema.default("active"),
  photoUrl: z.string().url().optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
  allergies: z.string().optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
});

export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;

export const learnerSchema = createLearnerSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  learnerUserId: z.string().uuid().optional().nullable(),
  retentionHoldUntil: z.coerce.date().optional().nullable(),
});

export type Learner = z.infer<typeof learnerSchema>;

export const guardianRelationshipSchema = z.enum([
  "mother",
  "father",
  "guardian",
  "grandparent",
  "sibling",
  "other",
]);
export type GuardianRelationship = z.infer<typeof guardianRelationshipSchema>;

export const createGuardianSchema = z.object({
  fullName: z.string().min(1),
  phonePrimary: z.string().min(6),
  phoneSecondary: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  idType: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  smsOptIn: z.boolean().default(true),
});

export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;

export const guardianSchema = createGuardianSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
});

export type Guardian = z.infer<typeof guardianSchema>;

export const guardianLearnerLinkSchema = z.object({
  guardianId: z.string().uuid(),
  learnerId: z.string().uuid(),
  relationship: guardianRelationshipSchema,
  isPrimaryContact: z.boolean().default(false),
  isEmergencyContact: z.boolean().default(false),
});

export type GuardianLearnerLink = z.infer<typeof guardianLearnerLinkSchema>;

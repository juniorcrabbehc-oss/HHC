/**
 * Mirrors the Prisma `LevelStage` enum and `@sms/shared-types`'
 * `levelStageSchema`. Kept as a plain string union (not re-exported from
 * `@prisma/client`) so `class-validator`'s `@IsIn` can validate request
 * bodies without importing Prisma's generated enum into DTOs.
 */
export const LEVEL_STAGES = ["CRECHE", "NURSERY", "KG", "PRIMARY", "JHS"] as const;
export type LevelStageInput = (typeof LEVEL_STAGES)[number];

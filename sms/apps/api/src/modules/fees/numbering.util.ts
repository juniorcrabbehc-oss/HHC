import { Prisma } from "@prisma/client";

/**
 * Generates a readable, human-facing document number (`INV-2026-00042`,
 * `RCT-2026-00007`) and retries on a unique-constraint collision.
 *
 * The sequence is derived from a row count, which is a best-effort hint
 * rather than a strict counter — two concurrent generations can compute the
 * same sequence. Rather than serializing generation behind a lock, we let
 * the DB's `@@unique([schoolId, xNumber])` constraint be the source of
 * truth: on a `P2002` collision, bump the sequence and retry. For fee
 * invoice/receipt volumes (tens to low hundreds per school per term) this
 * is simpler than introducing a dedicated counter table and collides in
 * practice only under genuine concurrent writes.
 */
export async function withNumberRetry<T>(
  attemptFn: (sequence: number) => Promise<T>,
  startingSequence: number,
  targetColumnHint: string,
  maxAttempts = 5,
): Promise<{ result: T; sequence: number }> {
  let sequence = startingSequence;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await attemptFn(sequence);
      return { result, sequence };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]).join(",") : String(error.meta?.target ?? "");
        if (target.includes(targetColumnHint)) {
          lastError = error;
          sequence += 1;
          continue;
        }
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to generate a unique number after ${maxAttempts} attempts`);
}

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(5, "0")}`;
}

export function formatReceiptNumber(year: number, sequence: number): string {
  return `RCT-${year}-${String(sequence).padStart(5, "0")}`;
}

import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface AuditLogInput {
  schoolId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  diff?: Record<string, unknown> | null;
}

/**
 * Central place to write AuditLog rows. Feature modules should call
 * `AuditService.log(...)` instead of writing to `prisma.auditLog` directly
 * so the shape/semantics stay consistent across Phase 1+.
 *
 * Pass the transaction client (`tx`) when the audit entry must be committed
 * atomically alongside the mutation it describes (e.g. inside a
 * `prisma.$transaction(async (tx) => ...)` block).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;

    let diff: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (input.diff === null) {
      diff = Prisma.JsonNull;
    } else if (input.diff !== undefined) {
      diff = input.diff as Prisma.InputJsonValue;
    }

    await client.auditLog.create({
      data: {
        schoolId: input.schoolId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        diff,
      },
    });
  }
}

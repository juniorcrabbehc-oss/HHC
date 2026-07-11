import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { FeeStructure, FeeItem } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { AuditService } from "../../common/audit/audit.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { GenerateInvoicesDto, ListInvoicesQueryDto, UpdateInvoiceDto } from "./dto/invoice.dto";
import { serializeInvoice } from "./fees.mapper";
import { formatInvoiceNumber, withNumberRetry } from "./numbering.util";
import { learnerScopeWhere } from "./learner-visibility.util";

const INVOICE_INCLUDE = {
  lineItems: true,
  payments: true,
  learner: true,
} as const;

export interface GenerateInvoicesResult {
  created: ReturnType<typeof serializeInvoice>[];
  skipped: { learnerId: string; reason: string }[];
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Generates one Invoice per actively-enrolled learner matching the given
   * term (+ optional class/level filter), from the FeeStructure that
   * matches the learner's class's level for that academic year + term.
   * Non-optional FeeItems become InvoiceLineItems; optional items are
   * skipped entirely (selecting individual optional items per learner is
   * left as a deferred nicety — see module report).
   *
   * Idempotent at the learner+term level: a learner who already has an
   * Invoice for this term is skipped rather than double-invoiced.
   */
  async generate(dto: GenerateInvoicesDto, actor: AuthenticatedUser): Promise<GenerateInvoicesResult> {
    const schoolId = this.tenant.schoolId;

    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new BadRequestException(`Term ${dto.termId} not found`);

    if (dto.classId) {
      const classRecord = await this.prisma.class.findFirst({ where: { id: dto.classId, schoolId } });
      if (!classRecord) throw new BadRequestException(`Class ${dto.classId} not found`);
    }
    if (dto.levelId) {
      const level = await this.prisma.level.findFirst({ where: { id: dto.levelId } });
      if (!level) throw new BadRequestException(`Level ${dto.levelId} not found`);
    }

    const enrollments = await this.prisma.classEnrollment.findMany({
      where: {
        schoolId,
        academicYearId: term.academicYearId,
        status: "active",
        ...(dto.classId ? { classId: dto.classId } : {}),
        ...(dto.levelId ? { class: { levelId: dto.levelId } } : {}),
      },
      include: { learner: true, class: true },
    });

    const feeStructureCache = new Map<string, (FeeStructure & { feeItems: FeeItem[] }) | null>();
    const created: ReturnType<typeof serializeInvoice>[] = [];
    const skipped: { learnerId: string; reason: string }[] = [];

    const year = new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
    let sequenceCounter =
      (await this.prisma.invoice.count({ where: { schoolId, issueDate: { gte: yearStart, lt: yearEnd } } })) + 1;

    // Sequential per learner — same "small batch, several awaited lookups
    // each" reasoning as AttendanceService.markBulk / ReportCardsService.generate.
    for (const enrollment of enrollments) {
      const levelId = enrollment.class.levelId;

      if (!feeStructureCache.has(levelId)) {
        const feeStructure = await this.prisma.feeStructure.findFirst({
          where: { schoolId, academicYearId: term.academicYearId, termId: dto.termId, levelId },
          include: { feeItems: true },
        });
        feeStructureCache.set(levelId, feeStructure);
      }
      const feeStructure = feeStructureCache.get(levelId) ?? null;

      if (!feeStructure) {
        skipped.push({ learnerId: enrollment.learnerId, reason: `No fee structure for level ${levelId} in this term` });
        continue;
      }

      const existingInvoice = await this.prisma.invoice.findFirst({
        where: { schoolId, learnerId: enrollment.learnerId, termId: dto.termId },
      });
      if (existingInvoice) {
        skipped.push({ learnerId: enrollment.learnerId, reason: "Invoice already exists for this learner/term" });
        continue;
      }

      const chargeableItems = feeStructure.feeItems.filter((item) => !item.isOptional);
      if (chargeableItems.length === 0) {
        skipped.push({ learnerId: enrollment.learnerId, reason: "Fee structure has no non-optional fee items" });
        continue;
      }

      const totalAmount = chargeableItems.reduce((sum, item) => sum + Number(item.amount), 0);
      const now = new Date();

      const { result: invoice, sequence: usedSequence } = await withNumberRetry(
        (sequence) =>
          this.prisma.$transaction(async (tx) => {
            const invoiceNumber = formatInvoiceNumber(year, sequence);
            const createdInvoice = await tx.invoice.create({
              data: {
                schoolId,
                learnerId: enrollment.learnerId,
                termId: dto.termId,
                invoiceNumber,
                issueDate: now,
                dueDate: term.endDate,
                totalAmount,
                amountPaid: 0,
                balance: totalAmount,
                status: "unpaid",
                lineItems: {
                  create: chargeableItems.map((item) => ({
                    schoolId,
                    feeItemId: item.id,
                    description: item.name,
                    amount: item.amount,
                  })),
                },
              },
              include: INVOICE_INCLUDE,
            });

            await this.auditService.log(
              {
                schoolId,
                actorUserId: actor.sub,
                action: "INVOICE_GENERATED",
                entityType: "Invoice",
                entityId: createdInvoice.id,
                diff: { learnerId: enrollment.learnerId, termId: dto.termId, invoiceNumber, totalAmount },
              },
              tx,
            );

            return createdInvoice;
          }),
        sequenceCounter,
        "invoiceNumber",
      );

      sequenceCounter = usedSequence + 1;
      created.push(serializeInvoice(invoice));
    }

    return { created, skipped };
  }

  async list(query: ListInvoicesQueryDto, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const visibilityWhere = learnerScopeWhere(actor);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        ...(query.learnerId ? { learnerId: query.learnerId } : {}),
        ...(query.termId ? { termId: query.termId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...visibilityWhere,
      },
      include: INVOICE_INCLUDE,
      orderBy: { issueDate: "desc" },
    });

    return invoices.map(serializeInvoice);
  }

  async findById(id: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const visibilityWhere = learnerScopeWhere(actor);

    const invoice = await this.prisma.invoice.findFirst({
      where: { id, schoolId, ...visibilityWhere },
      include: {
        ...INVOICE_INCLUDE,
        paymentAllocations: { include: { payment: true } },
      },
    });

    if (!invoice) {
      // 404, not 403 — same non-leaking pattern as report cards/attendance.
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return serializeInvoice(invoice);
  }

  /**
   * Manual adjustment: add/remove line items and/or push out the due date.
   * Recomputes `totalAmount`/`balance`/`status` from the resulting line
   * items and existing `amountPaid`. Audit-logged with a before/after diff.
   */
  async update(id: string, dto: UpdateInvoiceDto, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const existing = await this.prisma.invoice.findFirst({ where: { id, schoolId }, include: INVOICE_INCLUDE });
    if (!existing) throw new NotFoundException(`Invoice ${id} not found`);

    if (dto.removeLineItemIds && dto.removeLineItemIds.length > 0) {
      const unknownIds = dto.removeLineItemIds.filter((lineItemId) => !existing.lineItems.some((li) => li.id === lineItemId));
      if (unknownIds.length > 0) {
        throw new BadRequestException(`Line item(s) not found on this invoice: ${unknownIds.join(", ")}`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.removeLineItemIds && dto.removeLineItemIds.length > 0) {
        await tx.invoiceLineItem.deleteMany({ where: { id: { in: dto.removeLineItemIds }, invoiceId: id } });
      }
      if (dto.addLineItems && dto.addLineItems.length > 0) {
        await tx.invoiceLineItem.createMany({
          data: dto.addLineItems.map((item) => ({
            schoolId,
            invoiceId: id,
            description: item.description,
            amount: item.amount,
          })),
        });
      }

      const remainingLineItems = await tx.invoiceLineItem.findMany({ where: { invoiceId: id } });
      const totalAmount = remainingLineItems.reduce((sum, item) => sum + Number(item.amount), 0);
      const amountPaid = Number(existing.amountPaid);
      const balance = totalAmount - amountPaid;
      const status = computeInvoiceStatus(totalAmount, amountPaid, balance);

      const invoice = await tx.invoice.update({
        where: { id },
        data: {
          totalAmount,
          balance,
          status,
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        },
        include: INVOICE_INCLUDE,
      });

      await this.auditService.log(
        {
          schoolId,
          actorUserId: actor.sub,
          action: "INVOICE_UPDATED",
          entityType: "Invoice",
          entityId: id,
          diff: {
            addLineItems: dto.addLineItems ?? [],
            removeLineItemIds: dto.removeLineItemIds ?? [],
            dueDate: dto.dueDate ? { from: existing.dueDate, to: dto.dueDate } : undefined,
            totalAmount: { from: Number(existing.totalAmount), to: totalAmount },
            balance: { from: Number(existing.balance), to: balance },
            status: { from: existing.status, to: status },
          },
        },
        tx,
      );

      return invoice;
    });

    return serializeInvoice(updated);
  }
}

/** Shared status-recompute rule: consistent between manual PATCH and payment allocation. */
export function computeInvoiceStatus(totalAmount: number, amountPaid: number, balance: number): "unpaid" | "partially_paid" | "paid" {
  if (balance <= 0 && totalAmount > 0) return "paid";
  if (amountPaid > 0) return "partially_paid";
  return "unpaid";
}

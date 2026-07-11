import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Invoice, Learner } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { MessageDispatchService } from "../message-dispatch.service";
import { getNotifiableGuardians } from "../guardian-notify.util";

const FEE_REMINDER_FALLBACK =
  "Reminder: {{learnerName}}'s invoice {{invoiceNumber}} has an outstanding balance of GHS {{balance}}, due {{dueDate}}.";

const LOOKAHEAD_DAYS = 3; // remind for invoices due within the next N days, or already overdue
const THROTTLE_DAYS = 3; // don't re-remind the same invoice more than once every N days
const BATCH_SIZE = 50; // small batches per run — see class doc comment

/**
 * Daily sweep for outstanding invoices near/past their due date. Singleton
 * (not request-scoped), same rationale as `PaymentsReconciliationScheduler`
 * in the fees module — a `@Cron` job has no HTTP request in flight, so it
 * queries across all schools directly using each `Invoice`'s own
 * `schoolId` rather than `TenantContextService`.
 *
 * Throttled via `Invoice.lastReminderSentAt`, which already existed in
 * the schema before this task (no migration needed) — a still-unpaid
 * invoice is re-reminded at most once every `THROTTLE_DAYS` days rather
 * than getting a fresh SMS on every cron tick.
 *
 * Batched at `BATCH_SIZE` invoices per run (mirrors the "small batch,
 * sequential" reasoning behind `AttendanceService.markBulk` and
 * `PaymentsReconciliationScheduler`) rather than an unbounded loop — a
 * school with a large backlog of overdue invoices gets worked down over
 * several daily ticks instead of one run hammering the SMS provider.
 */
@Injectable()
export class FeeReminderScheduler {
  private readonly logger = new Logger(FeeReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: MessageDispatchService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendFeeReminders(): Promise<void> {
    const now = new Date();
    const lookaheadCutoff = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    const throttleCutoff = new Date(now.getTime() - THROTTLE_DAYS * 24 * 60 * 60 * 1000);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        balance: { gt: 0 },
        dueDate: { lte: lookaheadCutoff },
        OR: [{ lastReminderSentAt: null }, { lastReminderSentAt: { lte: throttleCutoff } }],
      },
      orderBy: { dueDate: "asc" },
      take: BATCH_SIZE,
      include: { learner: true },
    });

    if (invoices.length === 0) return;

    this.logger.log(`Sending fee reminders for ${invoices.length} invoice(s)`);

    // Sequential, small batch — see class doc comment.
    for (const invoice of invoices) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.remindOne(invoice);
      } catch (error) {
        this.logger.error(`Failed to send fee reminder for invoice ${invoice.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async remindOne(invoice: Invoice & { learner: Learner }): Promise<void> {
    const guardians = await getNotifiableGuardians(this.prisma, invoice.schoolId, invoice.learnerId);

    if (guardians.length > 0) {
      const { body, templateId } = await this.dispatch.renderBody(invoice.schoolId, "fee_reminder", "sms", FEE_REMINDER_FALLBACK, {
        learnerName: `${invoice.learner.firstName} ${invoice.learner.lastName}`,
        invoiceNumber: invoice.invoiceNumber,
        balance: Number(invoice.balance).toFixed(2),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
      });

      for (const guardian of guardians) {
        // eslint-disable-next-line no-await-in-loop
        await this.dispatch.sendSmsToGuardian({
          schoolId: invoice.schoolId,
          guardian,
          body,
          templateId,
          relatedEntityType: "Invoice",
          relatedEntityId: invoice.id,
        });
      }
    }

    // Stamp `lastReminderSentAt` even when there were no notifiable
    // guardians, so a learner with no opted-in contact doesn't get
    // re-selected (and re-logged as a no-op) on every single cron tick.
    await this.prisma.invoice.update({ where: { id: invoice.id }, data: { lastReminderSentAt: new Date() } });
  }
}

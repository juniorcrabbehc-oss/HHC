import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PaystackClient } from "./paystack/paystack.client";
import { NOTIFICATIONS_PORT, type NotificationsPort } from "./notifications/notifications.port";
import { formatReceiptNumber } from "./numbering.util";
import { computeInvoiceStatus } from "./invoices.service";

const RECONCILE_AFTER_MINUTES = 10;

/**
 * Singleton home for the payment-confirmation pipeline shared by the
 * Paystack webhook, the reconciliation cron, and cash/bank payments
 * (`allocateAndReceipt` only, for the latter — cash payments are already
 * `success` at creation, no verify/apply step needed).
 *
 * Deliberately **not** request-scoped (unlike most other feature services
 * in this codebase, which inject `TenantContextService` and so become
 * request-scoped by DI propagation). `PaymentsReconciliationScheduler`'s
 * `@Cron` job runs with no HTTP request in flight, so anything it depends
 * on — transitively — must be a singleton. Every method here takes an
 * already-resolved `Payment` row (which carries its own `schoolId`)
 * instead of deriving tenant from `TenantContextService`.
 *
 * Known gap: methods here run without an acting `User`, and
 * `AuditLog.actorUserId` is a required FK — there's no natural actor for a
 * Paystack webhook or a cron tick. So payment success/failure transitions
 * applied here are **not** audit-logged (unlike `PAYMENT_INITIATED` /
 * `PAYMENT_RECORDED`, which have a real actor and are logged in
 * `PaymentsService`). See the Phase 4 report for the fuller rationale.
 */
@Injectable()
export class PaymentsProcessingService {
  private readonly logger = new Logger(PaymentsProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackClient: PaystackClient,
    @Inject(NOTIFICATIONS_PORT) private readonly notifications: NotificationsPort,
  ) {}

  /** Called by `PaymentsWebhookController` after signature verification. */
  async handleWebhookEvent(event: string, data: { reference: string; status?: string; id?: number }): Promise<void> {
    if (!data.reference) return;

    const payment = await this.prisma.payment.findFirst({ where: { providerReference: data.reference } });
    if (!payment) {
      this.logger.warn(`Webhook event ${event} referenced unknown payment reference ${data.reference}`);
      return; // Not a reference we issued (or already purged) — ack quietly, nothing to do.
    }

    if (event === "charge.success") {
      await this.markSuccessAndApply(payment, data.id !== undefined ? String(data.id) : undefined);
    } else if (event === "charge.failed") {
      await this.markFailed(payment);
    }
  }

  /** Called by the reconciliation cron for stuck-pending payments. */
  async reconcilePayment(payment: Payment): Promise<void> {
    if (!payment.providerReference) return;

    const verifyResponse = await this.paystackClient.verifyTransaction(payment.providerReference);
    const status = verifyResponse.data.status;

    if (status === "success") {
      await this.markSuccessAndApply(payment, String(verifyResponse.data.id));
    } else if (status === "failed" || status === "abandoned") {
      await this.markFailed(payment);
    }
    // Any other status (still "pending" on Paystack's side, etc.) — leave
    // as-is; the next cron tick will check again.
  }

  async findPendingForReconciliation(): Promise<Payment[]> {
    const cutoff = new Date(Date.now() - RECONCILE_AFTER_MINUTES * 60 * 1000);
    return this.prisma.payment.findMany({
      where: {
        status: "pending",
        providerReference: { not: null },
        createdAt: { lte: cutoff },
      },
    });
  }

  /**
   * Idempotent: a no-op if the payment is already `success` — webhooks can
   * (and do) get delivered more than once, and the reconciliation job can
   * race a late-arriving webhook for the same payment.
   */
  private async markSuccessAndApply(payment: Payment, providerTransactionId: string | undefined): Promise<void> {
    if (payment.status === "success") return;

    const updated = await this.prisma.$transaction(async (tx) => {
      const refreshed = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "success",
          providerTransactionId: providerTransactionId ?? payment.providerTransactionId,
          paidAt: new Date(),
        },
      });

      await this.allocateAndReceipt(tx, refreshed);
      return refreshed;
    });

    await this.notifications.notifyPaymentReceived(updated);
  }

  /** Idempotent: a no-op if the payment already resolved (either way). */
  private async markFailed(payment: Payment): Promise<void> {
    if (payment.status === "success" || payment.status === "failed") return;
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
  }

  /**
   * Allocates a successful payment across the learner's outstanding
   * invoices, **oldest-due-date-first**, then issues one `Receipt` for the
   * payment as a whole. Public so `PaymentsService.createCashPayment` can
   * reuse it (a cash payment is `success` from the moment it's created —
   * there's no separate "verify" step — but it needs the exact same
   * allocation + receipt logic).
   *
   * Tie-break when two+ outstanding invoices share the same `dueDate`:
   * earlier `createdAt` wins (the invoice that was generated first), then
   * `id` ascending as a final deterministic tiebreak. In practice this
   * agrees with invoice-number order too, since invoice numbers are
   * assigned in creation order.
   *
   * If the payment amount exceeds the sum of every outstanding invoice's
   * balance (an overpayment), the leftover is simply not allocated — this
   * schema has no credit-balance/wallet concept yet, so an overpayment
   * just means the `Payment.amount` won't equal the sum of its
   * `PaymentAllocation`s. Documented as a deliberate simplification, not
   * an oversight (see module report).
   */
  async allocateAndReceipt(tx: Prisma.TransactionClient, payment: Payment): Promise<void> {
    const outstandingInvoices = await tx.invoice.findMany({
      where: { schoolId: payment.schoolId, learnerId: payment.learnerId, status: { in: ["unpaid", "partially_paid"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    let remaining = Number(payment.amount);

    for (const invoice of outstandingInvoices) {
      if (remaining <= 0) break;

      const invoiceBalance = Number(invoice.balance);
      if (invoiceBalance <= 0) continue;

      const amountToApply = Math.min(remaining, invoiceBalance);

      await tx.paymentAllocation.create({
        data: {
          schoolId: payment.schoolId,
          paymentId: payment.id,
          invoiceId: invoice.id,
          amountAllocated: amountToApply,
        },
      });

      const newAmountPaid = Number(invoice.amountPaid) + amountToApply;
      const newBalance = Number(invoice.totalAmount) - newAmountPaid;
      const newStatus = computeInvoiceStatus(Number(invoice.totalAmount), newAmountPaid, newBalance);

      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amountPaid: newAmountPaid, balance: newBalance, status: newStatus },
      });

      remaining -= amountToApply;
    }

    // Receipt numbering: a count-based sequence, same spirit as invoice
    // numbering, but *without* the P2002-retry-with-a-fresh-transaction
    // trick `InvoicesService.generate` uses — this method already runs
    // inside a caller-supplied transaction (payment status update +
    // allocations must commit atomically together), and Prisma's
    // interactive transactions don't support retrying a single statement
    // via a savepoint: a collision here would abort the whole transaction.
    // Left as a known, documented edge case (see module report) rather
    // than adding savepoint-based retry — receipt volume per school is low
    // and payment processing is effectively serialized per payment via the
    // `status === "success"` idempotency check in `markSuccessAndApply`.
    const year = new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
    const sequence = (await tx.receipt.count({ where: { schoolId: payment.schoolId, issuedAt: { gte: yearStart, lt: yearEnd } } })) + 1;

    await tx.receipt.create({
      data: {
        schoolId: payment.schoolId,
        paymentId: payment.id,
        receiptNumber: formatReceiptNumber(year, sequence),
      },
    });
  }
}

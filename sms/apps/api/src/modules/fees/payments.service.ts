import { randomUUID } from "crypto";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantContextService } from "../../common/tenant/tenant-context.service";
import { AuditService } from "../../common/audit/audit.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { PaystackClient } from "./paystack/paystack.client";
import { PaymentsProcessingService } from "./payments-processing.service";
import { NOTIFICATIONS_PORT, type NotificationsPort } from "./notifications/notifications.port";
import type { CashPaymentDto, InitiateMomoPaymentDto } from "./dto/payment.dto";
import { serializePayment, serializeReceipt } from "./fees.mapper";
import { isStaffActor, learnerScopeWhere } from "./learner-visibility.util";

const PESEWAS_PER_CEDI = 100;

/**
 * Request-scoped (via `TenantContextService`) — the controller-facing half
 * of the payments module: initiating a MoMo charge, recording a cash
 * payment, and read endpoints, all of which need the current actor's
 * `schoolId`/role. The shared verify/apply/allocate pipeline used by the
 * webhook and the reconciliation cron lives in the singleton
 * `PaymentsProcessingService` instead — see that file's doc comment for
 * why the split is necessary (a `@Cron` job has no request-scoped DI
 * context to resolve `TenantContextService` from).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly auditService: AuditService,
    private readonly paystackClient: PaystackClient,
    private readonly paymentsProcessing: PaymentsProcessingService,
    @Inject(NOTIFICATIONS_PORT) private readonly notifications: NotificationsPort,
  ) {}

  /**
   * Parent (or bursar acting on a parent's behalf — bursar bypasses the
   * learner-scope check via `learnerScopeWhere`) kicks off a mobile money
   * charge via Paystack. The `Payment` row is created `pending`
   * immediately; it only becomes `success`/`failed` once the webhook (or
   * the reconciliation cron) fires.
   */
  async initiateMomo(dto: InitiateMomoPaymentDto, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, schoolId, ...learnerScopeWhere(actor) },
      include: { learner: { include: { guardianLearners: { include: { guardian: true } } } } },
    });
    if (!invoice) {
      // 404, not 403 — same non-leaking pattern as report cards/attendance.
      throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);
    }
    if (invoice.status === "paid") {
      throw new BadRequestException("Invoice is already fully paid");
    }

    // Paystack's charge endpoint requires an `email`, even for mobile
    // money. Guardians in this system aren't guaranteed one on file, so
    // fall back to a stable, clearly-synthetic placeholder tied to the
    // learner rather than failing the charge outright.
    const guardianEmail = invoice.learner.guardianLearners.find((gl) => gl.guardian.email)?.guardian.email;
    const email = guardianEmail ?? `learner-${invoice.learnerId}@noemail.smsplaceholder`;
    const amountPesewas = Math.round(dto.amount * PESEWAS_PER_CEDI);

    const chargeResponse = await this.paystackClient.chargeMobileMoney({
      email,
      amountPesewas,
      phone: dto.phone,
      provider: dto.provider,
    });

    const payment = await this.prisma.payment.create({
      data: {
        schoolId,
        learnerId: invoice.learnerId,
        invoiceId: invoice.id,
        amount: dto.amount,
        method: "momo",
        momoProvider: dto.provider,
        status: "pending",
        providerReference: chargeResponse.data.reference,
        clientUuid: randomUUID(),
      },
    });

    await this.auditService.log({
      schoolId,
      actorUserId: actor.sub,
      action: "PAYMENT_INITIATED",
      entityType: "Payment",
      entityId: payment.id,
      diff: { invoiceId: invoice.id, amount: dto.amount, method: "momo", provider: dto.provider },
    });

    return {
      payment: serializePayment(payment),
      providerStatus: chargeResponse.data.status,
      displayText: chargeResponse.data.display_text ?? null,
    };
  }

  /** Manual cash/bank entry by bursar/admin — succeeds immediately, no Paystack round trip. */
  async createCashPayment(dto: CashPaymentDto, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;

    const invoice = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, schoolId } });
    if (!invoice) throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);
    if (invoice.status === "paid") {
      throw new BadRequestException("Invoice is already fully paid");
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          schoolId,
          learnerId: invoice.learnerId,
          invoiceId: invoice.id,
          amount: dto.amount,
          method: dto.method,
          status: "success",
          providerReference: dto.reference ?? null,
          clientUuid: randomUUID(),
          paidAt: new Date(),
        },
      });

      await this.auditService.log(
        {
          schoolId,
          actorUserId: actor.sub,
          action: "PAYMENT_RECORDED",
          entityType: "Payment",
          entityId: created.id,
          diff: { invoiceId: invoice.id, amount: dto.amount, method: dto.method, reference: dto.reference ?? null },
        },
        tx,
      );

      await this.paymentsProcessing.allocateAndReceipt(tx, created);
      return created;
    });

    await this.notifications.notifyPaymentReceived(payment);

    return serializePayment(payment);
  }

  async getStatus(id: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const payment = await this.prisma.payment.findFirst({
      where: { id, schoolId, ...learnerScopeWhere(actor) },
      include: { receipt: true },
    });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return serializePayment(payment);
  }

  async getReceipt(id: string, actor: AuthenticatedUser) {
    const schoolId = this.tenant.schoolId;
    const isStaff = isStaffActor(actor);

    const receipt = await this.prisma.receipt.findFirst({
      where: {
        id,
        schoolId,
        ...(isStaff
          ? {}
          : {
              payment: {
                learner: {
                  OR: [{ learnerUserId: actor.sub }, { guardianLearners: { some: { guardian: { userId: actor.sub } } } }],
                },
              },
            }),
      },
      include: { payment: { include: { allocations: true } } },
    });
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`);
    return serializeReceipt(receipt);
  }
}

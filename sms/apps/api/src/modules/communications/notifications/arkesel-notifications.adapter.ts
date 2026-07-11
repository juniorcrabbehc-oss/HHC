import { Injectable, Logger } from "@nestjs/common";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { MessageDispatchService } from "../message-dispatch.service";
import { getNotifiableGuardians } from "../guardian-notify.util";
import type { NotificationsPort } from "../../fees/notifications/notifications.port";

const PAYMENT_RECEIVED_FALLBACK = "We've received a payment of GHS {{amount}} for {{learnerName}}. Thank you!";

/**
 * Phase 5's real implementation of the fees module's `NotificationsPort`
 * seam (see `modules/fees/notifications/notifications.port.ts`). Bound in
 * `FeesModule` in place of `NoopNotificationsAdapter` — nothing in
 * `PaymentsService`/`PaymentsProcessingService` changes, since they only
 * ever depended on the `NotificationsPort` interface, not a concrete
 * class.
 *
 * Deliberately swallows its own errors (never throws out of
 * `notifyPaymentReceived`) — same contract as `NoopNotificationsAdapter`.
 * A payment has already been committed successfully by the time this
 * runs; an SMS provider hiccup must not turn into a failed payment
 * response for the payer.
 */
@Injectable()
export class ArkeselNotificationsAdapter implements NotificationsPort {
  private readonly logger = new Logger(ArkeselNotificationsAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: MessageDispatchService,
  ) {}

  async notifyPaymentReceived(payment: Payment): Promise<void> {
    try {
      const learner = await this.prisma.learner.findFirst({ where: { id: payment.learnerId, schoolId: payment.schoolId } });
      if (!learner) return;

      const guardians = await getNotifiableGuardians(this.prisma, payment.schoolId, payment.learnerId);
      if (guardians.length === 0) return;

      const { body, templateId } = await this.dispatch.renderBody(
        payment.schoolId,
        "payment_received",
        "sms",
        PAYMENT_RECEIVED_FALLBACK,
        {
          learnerName: `${learner.firstName} ${learner.lastName}`,
          amount: Number(payment.amount).toFixed(2),
        },
      );

      for (const guardian of guardians) {
        // eslint-disable-next-line no-await-in-loop
        await this.dispatch.sendSmsToGuardian({
          schoolId: payment.schoolId,
          guardian,
          body,
          templateId,
          relatedEntityType: "Payment",
          relatedEntityId: payment.id,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to send payment-received notification for payment ${payment.id}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

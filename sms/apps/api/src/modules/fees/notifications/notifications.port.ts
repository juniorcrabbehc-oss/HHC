import { Injectable, Logger } from "@nestjs/common";
import type { Payment } from "@prisma/client";

/**
 * Outbound-notification seam for the fees module. No SMS infrastructure
 * exists yet — that's Phase 5 (Communications, Arkesel) — so fees code
 * depends on this narrow interface instead of talking to a provider
 * directly. When Phase 5 lands, swap the provider binding in
 * `FeesModule` from `NoopNotificationsAdapter` to a real adapter (e.g.
 * `ArkeselNotificationsAdapter`) that implements the same interface;
 * nothing in `payments.service.ts` needs to change.
 *
 * `notifyPaymentReceived` is called once per successfully-applied payment
 * (webhook success, reconciliation-job success, and cash/bank payments),
 * after the `Receipt` row is committed.
 */
export interface NotificationsPort {
  notifyPaymentReceived(payment: Payment): Promise<void>;
}

export const NOTIFICATIONS_PORT = Symbol("NOTIFICATIONS_PORT");

@Injectable()
export class NoopNotificationsAdapter implements NotificationsPort {
  private readonly logger = new Logger(NoopNotificationsAdapter.name);

  async notifyPaymentReceived(payment: Payment): Promise<void> {
    // Phase 5 replaces this with a real SMS/receipt-confirmation send.
    this.logger.log(
      `[noop] Would notify guardian(s) of learner ${payment.learnerId}: payment ${payment.id} (GHS ${payment.amount}) received.`,
    );
    await Promise.resolve();
  }
}

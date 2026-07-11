import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PaymentsProcessingService } from "./payments-processing.service";

/**
 * Safety net for missed Paystack webhooks: every 5 minutes, re-verify any
 * `Payment` that's been `pending` (with a `providerReference`) for more
 * than 10 minutes directly against Paystack's transaction-verify endpoint,
 * and apply the same success/failure handling the webhook path uses
 * (`PaymentsProcessingService.reconcilePayment` -> the same
 * `markSuccessAndApply`/`markFailed` methods `handleWebhookEvent` calls).
 *
 * Injects the singleton `PaymentsProcessingService`, not the request-scoped
 * `PaymentsService` — a `@Cron` handler runs with no HTTP request in
 * flight, so anything it depends on (transitively) must not require
 * request-scoped DI resolution. Queries span all schools directly (no
 * `TenantContextService`) for the same reason: `Payment` rows already
 * carry their own `schoolId`, so there's no tenant context to resolve.
 */
@Injectable()
export class PaymentsReconciliationScheduler {
  private readonly logger = new Logger(PaymentsReconciliationScheduler.name);

  constructor(private readonly paymentsProcessing: PaymentsProcessingService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingPayments(): Promise<void> {
    const pending = await this.paymentsProcessing.findPendingForReconciliation();
    if (pending.length === 0) return;

    this.logger.log(`Reconciling ${pending.length} pending payment(s) against Paystack`);

    // Sequential: this is a low-frequency background sweep over a small
    // set of stuck payments, not a hot path — no need to parallelize
    // against Paystack's API.
    for (const payment of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.paymentsProcessing.reconcilePayment(payment);
      } catch (error) {
        this.logger.error(
          `Failed to reconcile payment ${payment.id} (reference ${payment.providerReference}): ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }
}

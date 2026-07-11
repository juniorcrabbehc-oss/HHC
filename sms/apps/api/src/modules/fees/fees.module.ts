import { Module } from "@nestjs/common";
import { FeeStructuresController } from "./fee-structures.controller";
import { FeeStructuresService } from "./fee-structures.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaymentsProcessingService } from "./payments-processing.service";
import { PaymentsWebhookController } from "./payments-webhook.controller";
import { PaymentsReconciliationScheduler } from "./payments-reconciliation.scheduler";
import { ReceiptsController } from "./receipts.controller";
import { PaystackClient } from "./paystack/paystack.client";
import { NOTIFICATIONS_PORT, NoopNotificationsAdapter } from "./notifications/notifications.port";

@Module({
  controllers: [
    FeeStructuresController,
    InvoicesController,
    PaymentsController,
    PaymentsWebhookController,
    ReceiptsController,
  ],
  providers: [
    FeeStructuresService,
    InvoicesService,
    PaymentsService,
    PaymentsProcessingService,
    PaymentsReconciliationScheduler,
    PaystackClient,
    // Phase 5 (Communications) swaps this binding for a real SMS adapter
    // that implements the same `NotificationsPort` interface — nothing
    // else in this module needs to change. See `notifications.port.ts`.
    { provide: NOTIFICATIONS_PORT, useClass: NoopNotificationsAdapter },
  ],
})
export class FeesModule {}

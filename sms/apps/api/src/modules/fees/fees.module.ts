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
import { NOTIFICATIONS_PORT } from "./notifications/notifications.port";
import { CommunicationsModule } from "../communications/communications.module";
import { ArkeselNotificationsAdapter } from "../communications/notifications/arkesel-notifications.adapter";

@Module({
  // Needed so `ArkeselNotificationsAdapter` (exported by
  // CommunicationsModule) is resolvable for the `useExisting` binding
  // below — CommunicationsModule has no dependency back on FeesModule, so
  // this doesn't introduce a cycle.
  imports: [CommunicationsModule],
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
    // Phase 5 (Communications): bound to the real SMS adapter in place of
    // `NoopNotificationsAdapter` — nothing else in this module changed.
    // See `notifications.port.ts`.
    { provide: NOTIFICATIONS_PORT, useExisting: ArkeselNotificationsAdapter },
  ],
})
export class FeesModule {}

import { Module } from "@nestjs/common";
import { MessageTemplatesController } from "./message-templates.controller";
import { MessageTemplatesService } from "./message-templates.service";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { MessagesWebhookController } from "./messages-webhook.controller";
import { MessageDispatchService } from "./message-dispatch.service";
import { NotificationTriggersService } from "./triggers/notification-triggers.service";
import { FeeReminderScheduler } from "./triggers/fee-reminder.scheduler";
import { ArkeselNotificationsAdapter } from "./notifications/arkesel-notifications.adapter";
import { SMS_PROVIDER } from "./sms/sms-provider.interface";
import { ArkeselSmsProvider } from "./sms/arkesel-sms-provider";

@Module({
  controllers: [MessageTemplatesController, MessagesController, MessagesWebhookController],
  providers: [
    MessageTemplatesService,
    MessagesService,
    MessageDispatchService,
    NotificationTriggersService,
    FeeReminderScheduler,
    ArkeselNotificationsAdapter,
    { provide: SMS_PROVIDER, useClass: ArkeselSmsProvider },
  ],
  // `ArkeselNotificationsAdapter` is exported so `FeesModule` can bind its
  // `NOTIFICATIONS_PORT` token to this already-instantiated singleton via
  // `useExisting` — see `fees.module.ts`.
  exports: [ArkeselNotificationsAdapter],
})
export class CommunicationsModule {}

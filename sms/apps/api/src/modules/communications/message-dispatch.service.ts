import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Guardian, Message } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SMS_PROVIDER, type SmsProvider } from "./sms/sms-provider.interface";
import { renderTemplate } from "./template-render.util";

export interface RenderedBody {
  body: string;
  templateId: string | null;
}

/**
 * Central place every trigger (attendance, report cards, fee reminders,
 * payment received) and the ad-hoc "message a guardian" endpoint goes
 * through to render a template and actually create+send a `Message` row.
 * Keeping this in one place means every send path shares the same
 * opt-out check, `Message` bookkeeping, and error handling — mirrors how
 * `PaymentsProcessingService` centralizes the payment pipeline shared by
 * the webhook, the cron, and cash payments.
 */
@Injectable()
export class MessageDispatchService {
  private readonly logger = new Logger(MessageDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  /**
   * Looks up an active `MessageTemplate` for this school + eventTrigger +
   * channel; falls back to a hardcoded default body if the school hasn't
   * configured one (or has deactivated it). Returns the resolved
   * `templateId` too, so callers can stamp `Message.templateId` even when
   * a real template was used.
   */
  async renderBody(
    schoolId: string,
    eventTrigger: string,
    channel: "sms" | "in_app",
    fallback: string,
    vars: Record<string, string>,
  ): Promise<RenderedBody> {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { schoolId, eventTrigger, channel, isActive: true },
    });
    return {
      body: renderTemplate(template?.bodyTemplate ?? fallback, vars),
      templateId: template?.id ?? null,
    };
  }

  /**
   * Creates a `Message` row and sends it via the configured `SmsProvider`.
   * Never sends to an opted-out (or phone-less) guardian — returns `null`
   * instead of creating any row, since "don't SMS this guardian" is
   * routine, expected behavior, not a failure. A provider error still
   * leaves the `Message` row in place with `status: "failed"` rather than
   * throwing, so callers (crons, event listeners) don't need their own
   * try/catch around every send.
   */
  async sendSmsToGuardian(params: {
    schoolId: string;
    guardian: Guardian;
    body: string;
    templateId?: string | null;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<Message | null> {
    if (!params.guardian.smsOptIn || !params.guardian.phonePrimary) {
      return null;
    }

    const message = await this.prisma.message.create({
      data: {
        schoolId: params.schoolId,
        channel: "sms",
        templateId: params.templateId ?? null,
        recipientGuardianId: params.guardian.id,
        recipientPhone: params.guardian.phonePrimary,
        body: params.body,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        status: "queued",
      },
    });

    try {
      const result = await this.smsProvider.send(params.guardian.phonePrimary, params.body);
      return await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: "sent",
          provider: "arkesel",
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send SMS (message ${message.id}) to guardian ${params.guardian.id}: ${error instanceof Error ? error.message : error}`,
      );
      return this.prisma.message.update({ where: { id: message.id }, data: { status: "failed" } });
    }
  }

  /**
   * In-app messages have no provider round trip — they're "delivered" the
   * moment the row exists, since the inbox (`GET /messages?box=inbox`)
   * reads straight from `Message`.
   */
  async sendInApp(params: {
    schoolId: string;
    guardian: Guardian;
    body: string;
    templateId?: string | null;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }): Promise<Message> {
    const now = new Date();
    return this.prisma.message.create({
      data: {
        schoolId: params.schoolId,
        channel: "in_app",
        templateId: params.templateId ?? null,
        recipientGuardianId: params.guardian.id,
        body: params.body,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        status: "delivered",
        sentAt: now,
        deliveredAt: now,
      },
    });
  }
}

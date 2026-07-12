import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type DeliveryStatus = "delivered" | "failed" | "sent";

/**
 * Public — POSTed by Arkesel's servers when a delivery report (DLR) is
 * available for an SMS this school sent, not by a logged-in user. No
 * `JwtAuthGuard`/`RolesGuard`, same "opt-in per controller" precedent as
 * `PaymentsWebhookController` in the fees module.
 *
 * Unlike Paystack's webhook (`x-paystack-signature` HMAC over the raw
 * body), Arkesel's public documentation describes no shared-secret or
 * signature scheme for authenticating this inbound callback — see
 * `sms/arkesel.types.ts`'s doc comment for what was checked. Inventing a
 * fake verification scheme here would be worse than none (a false sense
 * of security), so this endpoint is deliberately left open and only acts
 * on payloads whose `providerMessageId` matches a `Message` this school
 * actually sent; anything else is logged and dropped. In production this
 * should additionally be locked down at the network layer (e.g. a
 * source-IP allowlist on the load balancer, or a `?token=` query param
 * configured out-of-band in the Arkesel dashboard's callback URL field) —
 * both are infra-level concerns out of scope for this task.
 *
 * The exact DLR payload shape isn't verifiable without a live account, so
 * this handler reads defensively across the field-name variants commonly
 * used by SMS aggregators (`message_id`/`messageId`/`id`,
 * `status`/`delivery_status`/`dlr_status`) and always records the raw
 * body into `MessageDeliveryEvent`, so nothing is silently lost even if
 * the real field names differ from what's guessed here.
 */
// Exempt from the global rate limit: SMS aggregators retry DLR callbacks
// on non-2xx (including 429), and that retry churn is worse than the
// throttling benefit for an endpoint that only annotates existing rows.
@SkipThrottle()
@Controller("messages/webhooks")
export class MessagesWebhookController {
  private readonly logger = new Logger(MessagesWebhookController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post("arkesel/dlr")
  @HttpCode(HttpStatus.OK)
  async handleArkeselDlr(@Body() body: Record<string, unknown>): Promise<{ received: true }> {
    const providerMessageId = this.firstString(body, ["message_id", "messageId", "id"]);
    const rawStatus = this.firstString(body, ["status", "delivery_status", "dlr_status"]) ?? "unknown";

    if (!providerMessageId) {
      this.logger.warn(`Arkesel DLR webhook payload had no recognizable message id: ${JSON.stringify(body)}`);
      return { received: true };
    }

    const message = await this.prisma.message.findFirst({ where: { providerMessageId } });
    if (!message) {
      this.logger.warn(`Arkesel DLR webhook referenced unknown providerMessageId ${providerMessageId}`);
      return { received: true };
    }

    const mappedStatus = this.mapDeliveryStatus(rawStatus);

    await this.prisma.$transaction([
      this.prisma.messageDeliveryEvent.create({
        data: { messageId: message.id, status: rawStatus, rawPayload: body as Prisma.InputJsonValue },
      }),
      this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: mappedStatus,
          ...(mappedStatus === "delivered" ? { deliveredAt: new Date() } : {}),
        },
      }),
    ]);

    return { received: true };
  }

  private firstString(body: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = body[key];
      if (typeof value === "string" && value.length > 0) return value;
      if (typeof value === "number") return String(value);
    }
    return undefined;
  }

  private mapDeliveryStatus(rawStatus: string): DeliveryStatus {
    const normalized = rawStatus.toLowerCase();
    if (normalized.includes("deliver")) return "delivered";
    if (normalized.includes("fail") || normalized.includes("undeliver") || normalized.includes("reject")) return "failed";
    return "sent";
  }
}

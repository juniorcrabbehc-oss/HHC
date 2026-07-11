import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { PaystackClient } from "./paystack/paystack.client";
import { PaymentsProcessingService } from "./payments-processing.service";
import type { PaystackWebhookEvent } from "./paystack/paystack.types";

/**
 * Public — called by Paystack's servers, not a logged-in user. Deliberately
 * carries no `JwtAuthGuard`/`RolesGuard`, mirroring how `AuthController`
 * (login/refresh) also has no `@UseGuards`: guards in this codebase are
 * opt-in per controller, not applied globally, so a controller that simply
 * never declares them is public by construction — no `@Public()` bypass
 * decorator needed.
 *
 * "Authentication" for this route is the HMAC-SHA512 signature check
 * against the *raw* request body (see `main.ts`'s `rawBody: true` and
 * `PaystackClient.verifyWebhookSignature`), not a JWT.
 */
@Controller("payments/webhooks")
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly paystackClient: PaystackClient,
    private readonly paymentsProcessing: PaymentsProcessingService,
  ) {}

  @Post("paystack")
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-paystack-signature") signature: string | undefined,
    @Body() body: PaystackWebhookEvent,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody;
    if (!rawBody || !this.paystackClient.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException("Invalid Paystack webhook signature");
    }

    try {
      await this.paymentsProcessing.handleWebhookEvent(body.event, body.data);
    } catch (error) {
      // Log and still ack 200 — Paystack retries on non-2xx, and a
      // transient failure here (e.g. a DB blip) is better resolved by the
      // reconciliation cron than by triggering Paystack's retry/backoff
      // behavior indefinitely for an event we've already seen.
      this.logger.error(
        `Failed to process Paystack webhook event ${body.event} for reference ${body.data?.reference}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    return { received: true };
  }
}

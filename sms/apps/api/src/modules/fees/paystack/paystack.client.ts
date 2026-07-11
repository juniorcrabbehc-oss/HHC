import * as crypto from "crypto";
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MomoProvider } from "@sms/shared-types";
import type { AppConfig } from "../../../config/configuration";
import type {
  PaystackChargeMobileMoneyRequest,
  PaystackChargeResponse,
  PaystackMobileMoneyProviderCode,
  PaystackVerifyResponse,
} from "./paystack.types";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

const PROVIDER_CODE_MAP: Record<MomoProvider, PaystackMobileMoneyProviderCode> = {
  mtn: "mtn",
  vodafone: "vod",
  airteltigo: "atl",
};

/**
 * Thin wrapper around Paystack's HTTP API. Keeps provider-specific request
 * shapes, auth headers, and signature verification out of `payments.service.ts`
 * — same spirit as keeping an SMS provider swappable behind
 * `NotificationsPort`. If Paystack is ever swapped for another PSP, only
 * this file (and its interface below) needs to change.
 */
export interface IPaystackClient {
  chargeMobileMoney(params: { email: string; amountPesewas: number; phone: string; provider: MomoProvider }): Promise<PaystackChargeResponse>;
  verifyTransaction(reference: string): Promise<PaystackVerifyResponse>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
}

@Injectable()
export class PaystackClient implements IPaystackClient {
  private readonly logger = new Logger(PaystackClient.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  private get secretKey(): string {
    return this.configService.get("paystack", { infer: true }).secretKey;
  }

  private get webhookSecret(): string {
    return this.configService.get("paystack", { infer: true }).webhookSecret;
  }

  async chargeMobileMoney(params: {
    email: string;
    amountPesewas: number;
    phone: string;
    provider: MomoProvider;
  }): Promise<PaystackChargeResponse> {
    const body: PaystackChargeMobileMoneyRequest = {
      email: params.email,
      amount: params.amountPesewas,
      currency: "GHS",
      mobile_money: {
        phone: params.phone,
        provider: PROVIDER_CODE_MAP[params.provider],
      },
    };

    return this.request<PaystackChargeResponse>("/charge", "POST", body);
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    return this.request<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference)}`, "GET");
  }

  /**
   * HMAC-SHA512 of the raw request body, keyed with the webhook secret,
   * compared to the `x-paystack-signature` header. Uses `timingSafeEqual`
   * to avoid leaking timing information about how much of the signature
   * matched.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !this.webhookSecret) return false;

    const expected = crypto.createHmac("sha512", this.webhookSecret).update(rawBody).digest("hex");

    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(signatureHeader, "utf8");
    if (expectedBuf.length !== actualBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  private async request<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
    if (!this.secretKey) {
      throw new InternalServerErrorException("PAYSTACK_SECRET_KEY is not configured");
    }

    let response: Response;
    try {
      response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      this.logger.error(`Paystack request to ${path} failed: ${error instanceof Error ? error.message : error}`);
      throw new InternalServerErrorException("Failed to reach Paystack");
    }

    const data = (await response.json().catch(() => undefined)) as T | undefined;

    if (!response.ok || !data) {
      this.logger.error(`Paystack request to ${path} returned ${response.status}: ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(`Paystack request failed (${response.status})`);
    }

    return data;
  }
}

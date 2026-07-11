/**
 * Shapes for Paystack's Charge / Transaction-Verify APIs, scoped to the
 * mobile-money-in-Ghana flow this module uses. Not exhaustive of
 * Paystack's full API surface — only the fields this module reads/sends.
 *
 * Source (could not be live-verified — no Paystack account/keys exist in
 * this environment; shapes below are Paystack's documented, stable
 * request/response contracts as of general knowledge, cross-checked via
 * web search against https://paystack.com/docs/api/charge/ and
 * https://paystack.com/docs/payments/webhooks/):
 *  - `POST /charge` accepts `mobile_money: { phone, provider }` where
 *    `provider` is one of `mtn | vod | atl` for Ghana (Paystack's own
 *    short codes — NOT the same casing as our `MomoProvider` shared-type,
 *    hence the mapping in `paystack.client.ts`).
 *  - Response `data.status` for a mobile money charge is typically
 *    `"pay_offline"` (customer approves via USSD prompt on their phone)
 *    or `"send_otp"`; `data.display_text` carries any USSD instructions to
 *    surface to the payer. Final settlement arrives via the
 *    `charge.success` / `charge.failed` webhook, not the initiate response.
 *  - `x-paystack-signature` is HMAC-SHA512 of the *raw* request body,
 *    keyed with the secret key.
 */

export type PaystackMobileMoneyProviderCode = "mtn" | "vod" | "atl";

export interface PaystackChargeMobileMoneyRequest {
  email: string;
  amount: number; // smallest currency unit (pesewas for GHS), integer
  currency: "GHS";
  mobile_money: {
    phone: string;
    provider: PaystackMobileMoneyProviderCode;
  };
}

export interface PaystackChargeResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status: string; // e.g. "pay_offline" | "send_otp" | "success" | "failed"
    display_text?: string;
    id?: number;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    status: "success" | "failed" | "abandoned" | string;
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    channel: string;
  };
}

export interface PaystackWebhookEvent {
  event: string; // e.g. "charge.success" | "charge.failed"
  data: {
    id: number;
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    channel: string;
  };
}

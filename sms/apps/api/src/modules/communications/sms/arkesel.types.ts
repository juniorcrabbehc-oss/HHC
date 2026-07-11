/**
 * Shapes for Arkesel's SMS v2 API, scoped to what this module needs
 * (single-recipient send). Not exhaustive of Arkesel's full API surface.
 *
 * Source (could not be live-verified — no Arkesel account/API key exists
 * in this environment; shapes below are cross-checked via web search
 * against https://arkesel.com/how-to-send-sms-via-an-api-with-arkesel/
 * and https://arkesel.com/developer-api/sms-api/, current as of this
 * writing):
 *  - `POST https://sms.arkesel.com/api/v2/sms/send`, header `api-key:
 *    <API_KEY>` (Arkesel uses its own `api-key` header, not a Bearer
 *    token like Paystack), JSON body `{ sender, message, recipients:
 *    string[] }`.
 *  - Success response: `{ status: "success", data: {...} }`. Arkesel's
 *    own published examples aren't fully consistent on whether `data` is
 *    a single object (`{ id, credits_used }`) or an array of
 *    per-recipient results (`[{ id, recipient, status }]`) for a
 *    single-recipient send — this client (`arkesel-sms-provider.ts`)
 *    reads both shapes defensively rather than committing to one without
 *    live verification.
 *  - Delivery reports (DLR) arrive via a webhook URL configured in the
 *    Arkesel dashboard, POSTed when the network confirms delivery/
 *    failure. Arkesel's public docs describe no shared-secret/signature
 *    scheme for authenticating that inbound POST (unlike Paystack's
 *    `x-paystack-signature` HMAC) — see `messages-webhook.controller.ts`'s
 *    doc comment for how this module handles that gap.
 */
export interface ArkeselSendSmsRequest {
  sender: string;
  message: string;
  recipients: string[];
}

export interface ArkeselSendSmsResultItem {
  id?: string;
  recipient?: string;
  status?: string;
}

export interface ArkeselSendSmsResponse {
  status: string; // "success" | "error" | ...
  message?: string;
  data?: ArkeselSendSmsResultItem[] | (ArkeselSendSmsResultItem & { credits_used?: number });
}

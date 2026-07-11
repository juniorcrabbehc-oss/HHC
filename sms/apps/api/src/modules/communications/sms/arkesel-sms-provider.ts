import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../../config/configuration";
import type { SmsProvider, SmsSendResult } from "./sms-provider.interface";
import type { ArkeselSendSmsRequest, ArkeselSendSmsResponse } from "./arkesel.types";

const ARKESEL_BASE_URL = "https://sms.arkesel.com/api/v2";

/**
 * Thin wrapper around Arkesel's HTTP SMS API. Keeps provider-specific
 * request shapes and auth headers out of `MessageDispatchService` and the
 * trigger/scheduler code — same spirit as `PaystackClient` in the fees
 * module. See `arkesel.types.ts` for the documented (not live-verified)
 * request/response contract this implementation targets.
 */
@Injectable()
export class ArkeselSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ArkeselSmsProvider.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  private get apiKey(): string {
    return this.configService.get("arkesel", { infer: true }).apiKey;
  }

  private get senderId(): string {
    return this.configService.get("arkesel", { infer: true }).senderId;
  }

  async send(to: string, message: string): Promise<SmsSendResult> {
    if (!this.apiKey) {
      throw new InternalServerErrorException("ARKESEL_API_KEY is not configured");
    }

    const body: ArkeselSendSmsRequest = {
      sender: this.senderId,
      message,
      recipients: [to],
    };

    let response: Response;
    try {
      response = await fetch(`${ARKESEL_BASE_URL}/sms/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": this.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(`Arkesel request to /sms/send failed: ${error instanceof Error ? error.message : error}`);
      throw new InternalServerErrorException("Failed to reach Arkesel");
    }

    const data = (await response.json().catch(() => undefined)) as ArkeselSendSmsResponse | undefined;

    if (!response.ok || !data || data.status !== "success") {
      this.logger.error(`Arkesel send to ${to} returned ${response.status}: ${JSON.stringify(data)}`);
      throw new InternalServerErrorException(`Arkesel SMS send failed (${response.status})`);
    }

    return { providerMessageId: this.extractMessageId(data) ?? `arkesel-${Date.now()}`, status: data.status };
  }

  /**
   * Defensive: Arkesel's `data` shape isn't consistently documented as an
   * array vs. a single object for a single-recipient send — see
   * `arkesel.types.ts`. Falls back to a locally-generated id (logged
   * above via the raw response) rather than throwing, since the send
   * itself already succeeded server-side by the time we're parsing this.
   */
  private extractMessageId(data: ArkeselSendSmsResponse): string | undefined {
    if (Array.isArray(data.data)) {
      return data.data[0]?.id;
    }
    return data.data?.id;
  }
}

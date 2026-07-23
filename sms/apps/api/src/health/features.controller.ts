import { Controller, Get } from "@nestjs/common";

/**
 * Public, non-sensitive feature flags derived from environment presence.
 * Lets the web UI hide flows whose provider isn't configured yet (MoMo
 * payments without a Paystack key, SMS without an Arkesel key) — and
 * auto-reveal them the moment the keys are added to the API environment,
 * with no code change or redeploy of the web app.
 */
@Controller("config")
export class FeaturesController {
  @Get("features")
  features(): { momoEnabled: boolean; smsEnabled: boolean } {
    return {
      momoEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY),
      smsEnabled: Boolean(process.env.ARKESEL_API_KEY),
    };
  }
}

export interface SmsSendResult {
  providerMessageId: string;
  status: string;
}

/**
 * Narrow seam between the communications module's dispatch logic and
 * whichever SMS gateway actually sends the message — same spirit as
 * `IPaystackClient` in the fees module. Swapping providers (e.g. away
 * from Arkesel) means writing one new class against this interface;
 * nothing in `MessageDispatchService` or the trigger/scheduler code that
 * calls it needs to change.
 */
export interface SmsProvider {
  send(to: string, message: string): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

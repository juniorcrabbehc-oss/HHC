import { z } from "zod";

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

export const messageChannelSchema = z.enum(["sms", "in_app"]);
export type MessageChannel = z.infer<typeof messageChannelSchema>;

export const messageEventTriggerSchema = z.enum([
  "absence_alert",
  "fee_reminder",
  "report_card_ready",
  "payment_received",
  "manual",
]);
export type MessageEventTrigger = z.infer<typeof messageEventTriggerSchema>;

export const messageStatusSchema = z.enum(["queued", "sent", "delivered", "failed"]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const messageTemplateWriteSchema = z.object({
  name: z.string().min(1),
  channel: messageChannelSchema,
  eventTrigger: messageEventTriggerSchema,
  bodyTemplate: z.string().min(1),
  isActive: z.boolean().default(true),
});

export type MessageTemplateWrite = z.infer<typeof messageTemplateWriteSchema>;

export const updateMessageTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  bodyTemplate: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>;

export const messageTemplateSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  name: z.string(),
  channel: messageChannelSchema,
  eventTrigger: messageEventTriggerSchema,
  bodyTemplate: z.string(),
  isActive: z.boolean(),
});

export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const sendMessageSchema = z.object({
  // Exactly one of guardianId / learnerId should be supplied — learnerId is
  // resolved server-side to that learner's primary-contact guardian (or the
  // first linked guardian if none is flagged primary).
  guardianId: z.string().uuid().optional(),
  learnerId: z.string().uuid().optional(),
  channel: messageChannelSchema,
  body: z.string().min(1),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  channel: messageChannelSchema,
  templateId: z.string().uuid().optional().nullable(),
  recipientGuardianId: z.string().uuid().optional().nullable(),
  recipientPhone: z.string().optional().nullable(),
  body: z.string(),
  relatedEntityType: z.string().optional().nullable(),
  relatedEntityId: z.string().optional().nullable(),
  status: messageStatusSchema,
  provider: z.string().optional().nullable(),
  providerMessageId: z.string().optional().nullable(),
  costPesewas: z.number().int().optional().nullable(),
  sentAt: z.coerce.date().optional().nullable(),
  deliveredAt: z.coerce.date().optional().nullable(),
  createdAt: z.coerce.date(),
});

export type Message = z.infer<typeof messageSchema>;

export const messageDeliveryEventSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  status: z.string(),
  receivedAt: z.coerce.date(),
});

export type MessageDeliveryEvent = z.infer<typeof messageDeliveryEventSchema>;

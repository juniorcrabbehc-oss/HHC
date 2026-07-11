import { z } from "zod";

// ---------------------------------------------------------------------------
// Fee structures / fee items
// ---------------------------------------------------------------------------

export const feeItemWriteSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  isOptional: z.boolean().default(false),
});

export type FeeItemWrite = z.infer<typeof feeItemWriteSchema>;

export const feeItemSchema = feeItemWriteSchema.extend({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  feeStructureId: z.string().uuid(),
});

export type FeeItem = z.infer<typeof feeItemSchema>;

export const feeStructureWriteSchema = z.object({
  academicYearId: z.string().uuid(),
  termId: z.string().uuid(),
  levelId: z.string().uuid(),
  name: z.string().min(1),
  feeItems: z.array(feeItemWriteSchema).min(1),
});

export type FeeStructureWrite = z.infer<typeof feeStructureWriteSchema>;

export const feeStructureSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  termId: z.string().uuid(),
  levelId: z.string().uuid(),
  name: z.string(),
  feeItems: z.array(feeItemSchema).optional(),
});

export type FeeStructure = z.infer<typeof feeStructureSchema>;

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export const invoiceStatusSchema = z.enum(["unpaid", "partially_paid", "paid", "overdue"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceLineItemSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  feeItemId: z.string().uuid().optional().nullable(),
  description: z.string(),
  amount: z.number(),
});

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  learnerId: z.string().uuid(),
  termId: z.string().uuid(),
  invoiceNumber: z.string(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  totalAmount: z.number(),
  amountPaid: z.number(),
  balance: z.number(),
  status: invoiceStatusSchema,
  lastReminderSentAt: z.coerce.date().optional().nullable(),
  lineItems: z.array(invoiceLineItemSchema).optional(),
});

export type Invoice = z.infer<typeof invoiceSchema>;

export const generateInvoicesSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  levelId: z.string().uuid().optional(),
});

export type GenerateInvoicesInput = z.infer<typeof generateInvoicesSchema>;

export const invoiceAdjustmentLineItemSchema = z.object({
  description: z.string().min(1),
  // Positive amounts add a charge (e.g. a fine); negative amounts apply a
  // waiver/discount. Zero is rejected — it's a no-op line item.
  amount: z.number().refine((value) => value !== 0, "amount must not be zero"),
});

export type InvoiceAdjustmentLineItem = z.infer<typeof invoiceAdjustmentLineItemSchema>;

export const updateInvoiceSchema = z.object({
  addLineItems: z.array(invoiceAdjustmentLineItemSchema).optional(),
  removeLineItemIds: z.array(z.string().uuid()).optional(),
  dueDate: z.coerce.date().optional(),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const paymentMethodSchema = z.enum(["momo", "cash", "bank_transfer"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const momoProviderSchema = z.enum(["mtn", "vodafone", "airteltigo"]);
export type MomoProvider = z.infer<typeof momoProviderSchema>;

export const paymentStatusSchema = z.enum(["pending", "success", "failed"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  learnerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  amount: z.number(),
  method: paymentMethodSchema,
  momoProvider: momoProviderSchema.optional().nullable(),
  status: paymentStatusSchema,
  providerReference: z.string().optional().nullable(),
  providerTransactionId: z.string().optional().nullable(),
  clientUuid: z.string().uuid(),
  paidAt: z.coerce.date().optional().nullable(),
  receiptId: z.string().uuid().optional().nullable(),
});

export type Payment = z.infer<typeof paymentSchema>;

export const initiateMomoPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  phone: z.string().min(1),
  provider: momoProviderSchema,
});

export type InitiateMomoPaymentInput = z.infer<typeof initiateMomoPaymentSchema>;

export const cashPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(["cash", "bank_transfer"]),
  reference: z.string().optional(),
});

export type CashPaymentInput = z.infer<typeof cashPaymentSchema>;

// ---------------------------------------------------------------------------
// Payment allocations / receipts
// ---------------------------------------------------------------------------

export const paymentAllocationSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  paymentId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  amountAllocated: z.number(),
});

export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

export const receiptSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  paymentId: z.string().uuid(),
  receiptNumber: z.string(),
  issuedAt: z.coerce.date(),
  pdfUrl: z.string().optional().nullable(),
  payment: paymentSchema.optional(),
  allocations: z.array(paymentAllocationSchema).optional(),
});

export type Receipt = z.infer<typeof receiptSchema>;

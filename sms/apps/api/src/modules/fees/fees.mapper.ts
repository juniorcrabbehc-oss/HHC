import type { Prisma } from "@prisma/client";
import type {
  FeeStructure as PrismaFeeStructure,
  FeeItem as PrismaFeeItem,
  Invoice as PrismaInvoice,
  InvoiceLineItem as PrismaInvoiceLineItem,
  Learner as PrismaLearner,
  Payment as PrismaPayment,
  PaymentAllocation as PrismaPaymentAllocation,
  Receipt as PrismaReceipt,
} from "@prisma/client";

/**
 * Same rationale as `academics.mapper.ts`: Prisma's `Decimal` serializes to
 * a string via its own `toJSON()` when returned raw from a controller,
 * which doesn't match the `z.number()` fields declared in
 * `@sms/shared-types`. Every fees response is explicitly mapped to plain
 * numbers here instead.
 */
function toNum(value: Prisma.Decimal): number {
  return Number(value);
}

export function serializeFeeItem(record: PrismaFeeItem) {
  return {
    ...record,
    amount: toNum(record.amount),
  };
}

export function serializeFeeStructure(record: PrismaFeeStructure & { feeItems?: PrismaFeeItem[] }) {
  return {
    ...record,
    feeItems: record.feeItems?.map(serializeFeeItem),
  };
}

export function serializeInvoiceLineItem(record: PrismaInvoiceLineItem) {
  return {
    ...record,
    amount: toNum(record.amount),
  };
}

export function serializeInvoice(
  record: PrismaInvoice & { lineItems?: PrismaInvoiceLineItem[]; payments?: PrismaPayment[]; learner?: PrismaLearner },
) {
  return {
    ...record,
    totalAmount: toNum(record.totalAmount),
    amountPaid: toNum(record.amountPaid),
    balance: toNum(record.balance),
    lineItems: record.lineItems?.map(serializeInvoiceLineItem),
    payments: record.payments?.map(serializePayment),
  };
}

export function serializePayment(record: PrismaPayment & { receipt?: PrismaReceipt | null }) {
  const { receipt, ...rest } = record;
  return {
    ...rest,
    amount: toNum(rest.amount),
    // Flat receiptId (not the full embedded receipt) so callers can decide
    // whether to fetch `GET /receipts/:id` — Receipt is 1:1 with Payment
    // (`Receipt.paymentId @unique`) but has no reverse lookup by payment id
    // otherwise, which is exactly the gap this field closes.
    receiptId: receipt?.id ?? null,
  };
}

export function serializePaymentAllocation(record: PrismaPaymentAllocation) {
  return {
    ...record,
    amountAllocated: toNum(record.amountAllocated),
  };
}

export function serializeReceipt(
  record: PrismaReceipt & { payment?: PrismaPayment & { allocations?: PrismaPaymentAllocation[] } },
) {
  return {
    ...record,
    payment: record.payment ? serializePayment(record.payment) : undefined,
    // PaymentAllocation has no direct FK to Receipt in the schema — it
    // relates to Payment (and Invoice). A Receipt is 1:1 with a Payment
    // (`Receipt.paymentId @unique`), so "this receipt's allocations" means
    // "its payment's allocations".
    allocations: record.payment?.allocations?.map(serializePaymentAllocation),
  };
}

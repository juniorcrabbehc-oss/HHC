import type { Payment } from "@prisma/client";
import { PaymentsProcessingService } from "./payments-processing.service";

const SCHOOL_ID = "school-1";

function makePayment(overrides: Record<string, unknown> = {}): Payment {
  return {
    id: "pay-1",
    schoolId: SCHOOL_ID,
    learnerId: "learner-1",
    amount: 180,
    status: "pending",
    providerReference: "ref-abc",
    providerTransactionId: null,
    paidAt: null,
    ...overrides,
  } as unknown as Payment;
}

interface InvoiceSeed {
  id: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: "unpaid" | "partially_paid";
}

function makeTx(invoices: InvoiceSeed[], existingReceiptCount = 0) {
  const allocations: Array<Record<string, unknown>> = [];
  const invoiceUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const receipts: Array<Record<string, unknown>> = [];

  const tx = {
    invoice: {
      findMany: jest.fn().mockResolvedValue(invoices),
      update: jest.fn().mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) => {
        invoiceUpdates.push(args);
        return Promise.resolve({ id: args.where.id, ...args.data });
      }),
    },
    paymentAllocation: {
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        allocations.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
    receipt: {
      count: jest.fn().mockResolvedValue(existingReceiptCount),
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        receipts.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
    payment: {
      update: jest.fn().mockImplementation((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...makePayment(), ...args.data, id: args.where.id }),
      ),
    },
  };

  return { tx, allocations, invoiceUpdates, receipts };
}

function buildService(txBundle: ReturnType<typeof makeTx>, payment: Payment | null) {
  const prisma = {
    payment: {
      findFirst: jest.fn().mockResolvedValue(payment),
      update: jest.fn().mockResolvedValue(payment),
    },
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(txBundle.tx)),
  };
  const paystackClient = { verifyTransaction: jest.fn() };
  const notifications = { notifyPaymentReceived: jest.fn().mockResolvedValue(undefined) };
  const service = new PaymentsProcessingService(prisma as never, paystackClient as never, notifications as never);
  return { service, prisma, paystackClient, notifications };
}

describe("PaymentsProcessingService — allocation (oldest-due-first)", () => {
  it("allocates across multiple invoices in the order returned, updating amountPaid/balance/status", async () => {
    // Payment of 180 against inv-old (balance 100, unpaid) then inv-new
    // (balance 150, partially_paid): inv-old fully paid, inv-new gets the
    // remaining 80 and stays partially_paid.
    const txBundle = makeTx([
      { id: "inv-old", totalAmount: 100, amountPaid: 0, balance: 100, status: "unpaid" },
      { id: "inv-new", totalAmount: 200, amountPaid: 50, balance: 150, status: "partially_paid" },
    ]);
    const { service } = buildService(txBundle, null);
    const payment = makePayment({ amount: 180, status: "success" });

    await service.allocateAndReceipt(txBundle.tx as never, payment);

    expect(txBundle.allocations).toEqual([
      expect.objectContaining({ paymentId: "pay-1", invoiceId: "inv-old", amountAllocated: 100 }),
      expect.objectContaining({ paymentId: "pay-1", invoiceId: "inv-new", amountAllocated: 80 }),
    ]);
    expect(txBundle.invoiceUpdates).toEqual([
      { where: { id: "inv-old" }, data: { amountPaid: 100, balance: 0, status: "paid" } },
      { where: { id: "inv-new" }, data: { amountPaid: 130, balance: 70, status: "partially_paid" } },
    ]);
  });

  it("queries only outstanding invoices ordered oldest-due-first with deterministic tiebreaks", async () => {
    const txBundle = makeTx([]);
    const { service } = buildService(txBundle, null);

    await service.allocateAndReceipt(txBundle.tx as never, makePayment());

    expect(txBundle.tx.invoice.findMany).toHaveBeenCalledWith({
      where: { schoolId: SCHOOL_ID, learnerId: "learner-1", status: { in: ["unpaid", "partially_paid"] } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  });

  it("moves an invoice unpaid -> partially_paid on partial coverage and stops when the payment is exhausted", async () => {
    const txBundle = makeTx([
      { id: "inv-1", totalAmount: 500, amountPaid: 0, balance: 500, status: "unpaid" },
      { id: "inv-2", totalAmount: 300, amountPaid: 0, balance: 300, status: "unpaid" },
    ]);
    const { service } = buildService(txBundle, null);

    await service.allocateAndReceipt(txBundle.tx as never, makePayment({ amount: 200 }));

    expect(txBundle.allocations).toEqual([expect.objectContaining({ invoiceId: "inv-1", amountAllocated: 200 })]);
    expect(txBundle.invoiceUpdates).toEqual([
      { where: { id: "inv-1" }, data: { amountPaid: 200, balance: 300, status: "partially_paid" } },
    ]);
    // inv-2 untouched.
    expect(txBundle.invoiceUpdates.find((u) => u.where.id === "inv-2")).toBeUndefined();
  });

  it("leaves an overpayment surplus unallocated but still issues one receipt", async () => {
    const txBundle = makeTx([{ id: "inv-1", totalAmount: 100, amountPaid: 0, balance: 100, status: "unpaid" }], 6);
    const { service } = buildService(txBundle, null);

    await service.allocateAndReceipt(txBundle.tx as never, makePayment({ amount: 250 }));

    expect(txBundle.allocations).toEqual([expect.objectContaining({ invoiceId: "inv-1", amountAllocated: 100 })]);
    expect(txBundle.receipts).toHaveLength(1);
    const year = new Date().getUTCFullYear();
    expect(txBundle.receipts[0]).toMatchObject({ paymentId: "pay-1", receiptNumber: `RCT-${year}-00007` });
  });
});

describe("PaymentsProcessingService — webhook idempotency", () => {
  it("charge.success for an already-success payment is a no-op (no transaction, no notification)", async () => {
    const txBundle = makeTx([]);
    const settled = makePayment({ status: "success" });
    const { service, prisma, notifications } = buildService(txBundle, settled);

    await service.handleWebhookEvent("charge.success", { reference: "ref-abc", id: 42 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.notifyPaymentReceived).not.toHaveBeenCalled();
  });

  it("charge.success for a pending payment marks it success, allocates, and notifies once", async () => {
    const txBundle = makeTx([]);
    const pending = makePayment({ status: "pending" });
    const { service, prisma, notifications } = buildService(txBundle, pending);

    await service.handleWebhookEvent("charge.success", { reference: "ref-abc", id: 42 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const updateArgs = txBundle.tx.payment.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "pay-1" });
    expect(updateArgs.data).toMatchObject({ status: "success", providerTransactionId: "42" });
    expect(txBundle.tx.receipt.create).toHaveBeenCalledTimes(1);
    expect(notifications.notifyPaymentReceived).toHaveBeenCalledTimes(1);
  });

  it("ignores webhook events whose reference matches no known payment", async () => {
    const txBundle = makeTx([]);
    const { service, prisma } = buildService(txBundle, null);

    await expect(service.handleWebhookEvent("charge.success", { reference: "ref-unknown" })).resolves.toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("charge.failed on an already-resolved payment is a no-op", async () => {
    const txBundle = makeTx([]);
    const settled = makePayment({ status: "success" });
    const { service, prisma } = buildService(txBundle, settled);

    await service.handleWebhookEvent("charge.failed", { reference: "ref-abc" });

    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("charge.failed on a pending payment marks it failed", async () => {
    const txBundle = makeTx([]);
    const pending = makePayment({ status: "pending" });
    const { service, prisma } = buildService(txBundle, pending);

    await service.handleWebhookEvent("charge.failed", { reference: "ref-abc" });

    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "pay-1" }, data: { status: "failed" } });
  });
});

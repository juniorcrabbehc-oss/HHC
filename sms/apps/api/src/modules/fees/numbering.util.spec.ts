import { Prisma } from "@prisma/client";
import { formatInvoiceNumber, formatReceiptNumber, withNumberRetry } from "./numbering.util";

function p2002(target: string[] | string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target },
  });
}

describe("withNumberRetry", () => {
  it("bumps the sequence and retries on a matching P2002 collision", async () => {
    const attemptFn = jest
      .fn<Promise<string>, [number]>()
      .mockRejectedValueOnce(p2002(["schoolId", "invoiceNumber"]))
      .mockRejectedValueOnce(p2002(["schoolId", "invoiceNumber"]))
      .mockResolvedValueOnce("created");

    const { result, sequence } = await withNumberRetry(attemptFn, 5, "invoiceNumber");

    expect(result).toBe("created");
    expect(sequence).toBe(7);
    expect(attemptFn).toHaveBeenCalledTimes(3);
    expect(attemptFn).toHaveBeenNthCalledWith(1, 5);
    expect(attemptFn).toHaveBeenNthCalledWith(2, 6);
    expect(attemptFn).toHaveBeenNthCalledWith(3, 7);
  });

  it("rethrows a P2002 whose target does not match the hint (no retry)", async () => {
    const error = p2002(["schoolId", "learnerId", "termId"]);
    const attemptFn = jest.fn<Promise<string>, [number]>().mockRejectedValue(error);

    await expect(withNumberRetry(attemptFn, 1, "invoiceNumber")).rejects.toBe(error);
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-P2002 errors immediately", async () => {
    const boom = new Error("connection reset");
    const attemptFn = jest.fn<Promise<string>, [number]>().mockRejectedValue(boom);

    await expect(withNumberRetry(attemptFn, 1, "invoiceNumber")).rejects.toBe(boom);
    expect(attemptFn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts, surfacing the last collision error", async () => {
    const attemptFn = jest.fn<Promise<string>, [number]>().mockImplementation(() => Promise.reject(p2002("receiptNumber")));

    await expect(withNumberRetry(attemptFn, 1, "receiptNumber", 3)).rejects.toMatchObject({ code: "P2002" });
    expect(attemptFn).toHaveBeenCalledTimes(3);
  });
});

describe("document number formatting", () => {
  it("zero-pads invoice numbers to five digits", () => {
    expect(formatInvoiceNumber(2026, 42)).toBe("INV-2026-00042");
    expect(formatInvoiceNumber(2026, 100000)).toBe("INV-2026-100000");
  });

  it("zero-pads receipt numbers to five digits", () => {
    expect(formatReceiptNumber(2026, 7)).toBe("RCT-2026-00007");
  });
});

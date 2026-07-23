"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createCashPayment,
  getCurrentUser,
  getFeatures,
  getInvoice,
  getPaymentStatus,
  getReceipt,
  initiateMomoPayment,
} from "../../lib/api-client";
import type { InvoiceDto, PaymentDto, ReceiptDto } from "../../lib/api-client";
import type { MomoProvider } from "@sms/shared-types";

const MOMO_PROVIDERS: MomoProvider[] = ["mtn", "vodafone", "airteltigo"];
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // ~3 minutes of pending before we stop auto-polling.

function formatAmount(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
}

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

/** Presentational: maps an invoice status to its semantic pill class. */
function invoiceStatusPill(status: InvoiceDto["status"]): string {
  switch (status) {
    case "paid":
      return "pill pill-success";
    case "partially_paid":
      return "pill pill-warning";
    case "unpaid":
    case "overdue":
      return "pill pill-danger";
    default:
      return "pill";
  }
}

/** Presentational: maps a payment status to its semantic pill class. */
function paymentStatusPill(status: PaymentDto["status"]): string {
  switch (status) {
    case "success":
      return "pill pill-success";
    case "pending":
      return "pill pill-warning";
    case "failed":
      return "pill pill-danger";
    default:
      return "pill";
  }
}

/**
 * `PaymentDto.receiptId` (added alongside this component) closes the
 * "receipt by payment" gap — once a payment succeeds, its receipt is
 * fetched by id and shown here instead of just the raw payment fields.
 */
function ReceiptPanel({ receiptId }: { receiptId: string }) {
  const [receipt, setReceipt] = useState<ReceiptDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReceipt(receiptId)
      .then((r) => {
        if (!cancelled) setReceipt(r);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [receiptId]);

  if (!receipt) return null;

  return (
    <p role="status" className="alert alert-success">
      Receipt {receipt.receiptNumber} issued {formatDateTime(receipt.issuedAt)}.
    </p>
  );
}

/**
 * Shared invoice detail view, reachable by both bursar/admin (via
 * /bursar/invoices) and parent/learner (via /parent/invoices) roles — same
 * "one detail route, role-gated actions inside" shape as ReportCardView.
 * The API itself gates read access (404s if the invoice isn't visible to
 * the caller — see `InvoicesService.findById`), so this component only
 * needs to decide which *actions* to show, not whether to render at all.
 */
export function InvoiceDetail({ id }: { id: string }) {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const roles = currentUser?.roles ?? [];
  const isStaff = roles.includes("admin") || roles.includes("bursar");
  const isPayer = roles.includes("parent") || roles.includes("learner");

  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cashAmount, setCashAmount] = useState<string>("");
  const [cashMethod, setCashMethod] = useState<"cash" | "bank_transfer">("cash");
  const [cashReference, setCashReference] = useState<string>("");
  const [isRecordingCash, setIsRecordingCash] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);
  const [lastCashPayment, setLastCashPayment] = useState<PaymentDto | null>(null);

  const [phone, setPhone] = useState<string>("");
  const [provider, setProvider] = useState<MomoProvider>("mtn");
  const [momoAmount, setMomoAmount] = useState<string>("");
  const [isInitiating, setIsInitiating] = useState(false);
  const [momoError, setMomoError] = useState<string | null>(null);
  const [activePayment, setActivePayment] = useState<PaymentDto | null>(null);

  // MoMo is hidden until the API reports a payment provider is configured
  // (GET /config/features). Defaults false so the form never flashes in.
  const [momoEnabled, setMomoEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getFeatures().then((features) => {
      if (!cancelled) setMomoEnabled(features.momoEnabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadInvoice = useCallback(async () => {
    setError(null);
    try {
      const fetched = await getInvoice(id);
      setInvoice(fetched);
      setCashAmount((current) => current || String(fetched.balance));
      setMomoAmount((current) => current || String(fetched.balance));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load invoice.");
    }
  }, [id]);

  useEffect(() => {
    setIsLoading(true);
    void loadInvoice().finally(() => setIsLoading(false));
  }, [loadInvoice]);

  // Poll payment status while a MoMo payment is pending. Keyed on
  // id/status (not the whole object) so it doesn't tear down and rebuild
  // the interval on every successful poll tick — only when the payment
  // identity or its resolved status actually changes.
  useEffect(() => {
    if (!activePayment || activePayment.status !== "pending") return;
    const startedAt = Date.now();
    let cancelled = false;

    const interval = setInterval(() => {
      void (async () => {
        try {
          const updated = await getPaymentStatus(activePayment.id);
          if (cancelled) return;
          setActivePayment(updated);
          if (updated.status === "success") {
            await loadInvoice();
          }
          if (updated.status !== "pending" || Date.now() - startedAt > POLL_TIMEOUT_MS) {
            clearInterval(interval);
          }
        } catch {
          // Transient network hiccup — the next tick retries.
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePayment?.id, activePayment?.status, loadInvoice]);

  async function handleRecordCashPayment() {
    if (!invoice) return;
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setCashError("Enter a valid amount greater than zero.");
      return;
    }

    setIsRecordingCash(true);
    setCashError(null);
    try {
      const payment = await createCashPayment({
        invoiceId: invoice.id,
        amount,
        method: cashMethod,
        reference: cashReference || undefined,
      });
      setLastCashPayment(payment);
      setCashReference("");
      await loadInvoice();
    } catch (err) {
      setCashError(err instanceof ApiError ? err.message : "Failed to record payment.");
    } finally {
      setIsRecordingCash(false);
    }
  }

  async function handleInitiateMomo() {
    if (!invoice) return;
    const amount = Number(momoAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMomoError("Enter a valid amount greater than zero.");
      return;
    }
    if (!phone.trim()) {
      setMomoError("Enter the mobile money phone number.");
      return;
    }

    setIsInitiating(true);
    setMomoError(null);
    try {
      const response = await initiateMomoPayment({
        invoiceId: invoice.id,
        amount,
        phone: phone.trim(),
        provider,
      });
      setActivePayment(response.payment);
    } catch (err) {
      setMomoError(err instanceof ApiError ? err.message : "Failed to initiate mobile money payment.");
    } finally {
      setIsInitiating(false);
    }
  }

  if (isLoading) return <p className="loading">Loading invoice...</p>;
  if (error) return <p role="alert" className="alert alert-error">{error}</p>;
  if (!invoice) return <p className="muted">Invoice not found.</p>;

  const isPayable = (invoice.status === "unpaid" || invoice.status === "partially_paid") && invoice.balance > 0;

  return (
    <div>
      <h2>Invoice {invoice.invoiceNumber}</h2>
      <p className="meta-line">
        Learner: {invoice.learner ? `${invoice.learner.lastName}, ${invoice.learner.firstName}` : invoice.learnerId}
      </p>
      <p className="meta-line">
        Issue date: {new Date(invoice.issueDate).toLocaleDateString()} — Due date:{" "}
        {new Date(invoice.dueDate).toLocaleDateString()}
      </p>
      <p className="meta-line">
        <strong>Status:</strong> <span className={invoiceStatusPill(invoice.status)}>{invoice.status}</span>
      </p>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">Total</span>
          <span className="stat-value">{formatAmount(invoice.totalAmount)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Paid</span>
          <span className="stat-value">{formatAmount(invoice.amountPaid)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Balance</span>
          <span className="stat-value">{formatAmount(invoice.balance)}</span>
        </div>
      </div>

      <h3>Line items</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lineItems ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td className="num">{formatAmount(item.amount)}</td>
              </tr>
            ))}
            {(invoice.lineItems ?? []).length === 0 && (
              <tr>
                <td colSpan={2} className="muted">No line items on this invoice.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>Payment history</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.payments ?? []).map((payment) => (
              <tr key={payment.id}>
                <td className="nowrap">{formatDateTime(payment.paidAt)}</td>
                <td className="num">{formatAmount(payment.amount)}</td>
                <td>{payment.method === "momo" ? `momo (${payment.momoProvider ?? "—"})` : payment.method}</td>
                <td>
                  <span className={paymentStatusPill(payment.status)}>{payment.status}</span>
                </td>
                <td>{payment.providerReference ?? payment.providerTransactionId ?? "—"}</td>
              </tr>
            ))}
            {(invoice.payments ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="muted">No payments recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isStaff && (
        <fieldset className="form">
          <legend>Record cash / bank transfer payment</legend>

          <div className="field">
            <label htmlFor="cash-amount">Amount</label>
            <input
              id="cash-amount"
              type="number"
              min={0.01}
              step="0.01"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="cash-method">Method</label>
            <select id="cash-method" value={cashMethod} onChange={(e) => setCashMethod(e.target.value as "cash" | "bank_transfer")}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="cash-reference">Reference (optional)</label>
            <input id="cash-reference" type="text" value={cashReference} onChange={(e) => setCashReference(e.target.value)} />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleRecordCashPayment()}
            disabled={isRecordingCash || invoice.balance <= 0}
          >
            {isRecordingCash ? "Recording..." : "Record payment"}
          </button>

          {invoice.balance <= 0 && <p className="muted" style={{ marginTop: 12 }}>This invoice is fully paid.</p>}
          {cashError && <p role="alert" className="alert alert-error" style={{ marginTop: 12 }}>{cashError}</p>}

          {lastCashPayment && lastCashPayment.status === "success" && (
            <>
              <p role="status" className="alert alert-success" style={{ marginTop: 12 }}>
                Payment recorded: {formatAmount(lastCashPayment.amount)} via {lastCashPayment.method} on{" "}
                {formatDateTime(lastCashPayment.paidAt)}
                {lastCashPayment.providerReference ? ` (ref: ${lastCashPayment.providerReference})` : ""}.
              </p>
              {lastCashPayment.receiptId && <ReceiptPanel receiptId={lastCashPayment.receiptId} />}
            </>
          )}
        </fieldset>
      )}

      {isPayer && isPayable && !momoEnabled && (
        <p className="alert alert-warning">
          Online Mobile Money payment is coming soon. For now, please pay at the school office — your
          receipt will appear here once recorded.
        </p>
      )}

      {isPayer && isPayable && momoEnabled && (
        <fieldset className="form">
          <legend>Pay with Mobile Money</legend>

          <div className="field">
            <label htmlFor="momo-phone">Phone number</label>
            <input id="momo-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0244000000" />
          </div>

          <div className="field">
            <label htmlFor="momo-provider">Provider</label>
            <select id="momo-provider" value={provider} onChange={(e) => setProvider(e.target.value as MomoProvider)}>
              {MOMO_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p === "mtn" ? "MTN" : p === "vodafone" ? "Vodafone" : "AirtelTigo"}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="momo-amount">Amount</label>
            <input
              id="momo-amount"
              type="number"
              min={0.01}
              step="0.01"
              max={invoice.balance}
              value={momoAmount}
              onChange={(e) => setMomoAmount(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleInitiateMomo()}
            disabled={isInitiating || Boolean(activePayment && activePayment.status === "pending")}
          >
            {isInitiating ? "Initiating..." : "Pay now"}
          </button>

          {momoError && <p role="alert" className="alert alert-error" style={{ marginTop: 12 }}>{momoError}</p>}

          {activePayment && activePayment.status === "pending" && (
            <p role="status" className="alert alert-warning" style={{ marginTop: 12 }}>
              Payment pending — approve the prompt on your phone. Checking status every few seconds...
            </p>
          )}

          {activePayment && activePayment.status === "success" && (
            <div role="status" className="alert alert-success" style={{ marginTop: 12 }}>
              <p>Payment successful.</p>
              <p>
                Amount: {formatAmount(activePayment.amount)} — Provider: {activePayment.momoProvider ?? "—"} — Paid at:{" "}
                {formatDateTime(activePayment.paidAt)}
              </p>
              {activePayment.providerTransactionId && <p>Transaction ID: {activePayment.providerTransactionId}</p>}
              {activePayment.receiptId && <ReceiptPanel receiptId={activePayment.receiptId} />}
            </div>
          )}

          {activePayment && activePayment.status === "failed" && (
            <p role="alert" className="alert alert-error" style={{ marginTop: 12 }}>Payment failed. You can try again above.</p>
          )}
        </fieldset>
      )}
    </div>
  );
}

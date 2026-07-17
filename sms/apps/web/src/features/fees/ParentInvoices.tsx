"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, listInvoices } from "../../lib/api-client";
import type { InvoiceDto } from "../../lib/api-client";

function formatAmount(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
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

/**
 * Parent/learner view: lists invoices for the caller's linked learner(s).
 * `listInvoices()` is scoped server-side to the caller (see
 * `learnerScopeWhere` in `invoices.service.ts`) — no `learnerId` param
 * needed, unlike the bursar list which sees every learner in the school.
 */
export function ParentInvoices() {
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const fetched = await listInvoices();
        if (!cancelled) setInvoices(fetched);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load invoices.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) return <p className="loading">Loading invoices...</p>;
  if (error) return <p role="alert" className="alert alert-error">{error}</p>;

  return (
    <div>
      {invoices.length === 0 && <p className="muted">No invoices found for your linked learner(s) yet.</p>}

      {invoices.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Invoice #</th>
                <th>Due date</th>
                <th className="num">Total</th>
                <th className="num">Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.learner ? `${invoice.learner.lastName}, ${invoice.learner.firstName}` : invoice.learnerId}</td>
                  <td>{invoice.invoiceNumber}</td>
                  <td className="nowrap">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                  <td className="num">{formatAmount(invoice.totalAmount)}</td>
                  <td className="num">{formatAmount(invoice.balance)}</td>
                  <td>
                    <span className={invoiceStatusPill(invoice.status)}>{invoice.status}</span>
                  </td>
                  <td>
                    <Link href={`/invoices/${invoice.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

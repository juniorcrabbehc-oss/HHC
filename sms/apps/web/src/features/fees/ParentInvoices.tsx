"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, listInvoices } from "../../lib/api-client";
import type { InvoiceDto } from "../../lib/api-client";

function formatAmount(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
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

  if (isLoading) return <p>Loading invoices...</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <div>
      {invoices.length === 0 && <p>No invoices found for your linked learner(s) yet.</p>}

      {invoices.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Learner</th>
              <th>Invoice #</th>
              <th>Due date</th>
              <th>Total</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.learner ? `${invoice.learner.lastName}, ${invoice.learner.firstName}` : invoice.learnerId}</td>
                <td>{invoice.invoiceNumber}</td>
                <td>{new Date(invoice.dueDate).toLocaleDateString()}</td>
                <td>{formatAmount(invoice.totalAmount)}</td>
                <td>{formatAmount(invoice.balance)}</td>
                <td>{invoice.status}</td>
                <td>
                  <Link href={`/invoices/${invoice.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

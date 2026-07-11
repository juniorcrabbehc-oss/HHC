"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  generateInvoices,
  getClasses,
  getLevels,
  getTerms,
  listInvoices,
} from "../../lib/api-client";
import type { ClassDto, GenerateInvoicesResultDto, InvoiceDto, LevelDto, TermDto } from "../../lib/api-client";
import type { InvoiceStatus } from "@sms/shared-types";

const INVOICE_STATUSES: InvoiceStatus[] = ["unpaid", "partially_paid", "paid", "overdue"];

function formatAmount(amount: number): string {
  return `GHS ${amount.toFixed(2)}`;
}

/**
 * Bursar/admin flow: generate invoices for a term (optionally scoped to a
 * class or level), then review the resulting list with a status filter.
 * Mirrors ReportCardAdmin's "pick term -> generate -> review list" shape.
 */
export function BursarInvoices() {
  const [classes, setClasses] = useState<ClassDto[]>([]);
  const [levels, setLevels] = useState<LevelDto[]>([]);
  const [terms, setTerms] = useState<TermDto[]>([]);

  const [termId, setTermId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [levelId, setLevelId] = useState<string>("");

  const [listTermId, setListTermId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");

  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [generateResult, setGenerateResult] = useState<GenerateInvoicesResultDto | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClasses()
      .then(setClasses)
      .catch(() => {
        // Nothing cached yet on first load.
      });
    getLevels()
      .then(setLevels)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (classes.length === 0) return;
    const academicYearId = classes[0].academicYearId;

    getTerms(academicYearId)
      .then((fetchedTerms) => {
        setTerms(fetchedTerms);
        const current = fetchedTerms.find((term) => term.isCurrent) ?? fetchedTerms[0];
        if (current) setTermId((existing) => existing || current.id);
      })
      .catch(() => {});
  }, [classes]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    listInvoices({
      termId: listTermId || undefined,
      status: statusFilter || undefined,
    })
      .then(setInvoices)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load invoices.");
      })
      .finally(() => setIsLoading(false));
  }, [listTermId, statusFilter]);

  async function refreshList() {
    try {
      const fetched = await listInvoices({
        termId: listTermId || undefined,
        status: statusFilter || undefined,
      });
      setInvoices(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load invoices.");
    }
  }

  async function handleGenerate() {
    if (!termId) return;
    setIsGenerating(true);
    setError(null);
    setGenerateResult(null);
    try {
      const result = await generateInvoices({
        termId,
        classId: classId || undefined,
        levelId: levelId || undefined,
      });
      setGenerateResult(result);
      await refreshList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate invoices.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <fieldset>
        <legend>Generate invoices</legend>

        <label htmlFor="generate-term-select">Term</label>
        <select id="generate-term-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
          {terms.length === 0 && <option value="">No terms available</option>}
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>

        <label htmlFor="generate-class-select">Class (optional)</label>
        <select id="generate-class-select" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>

        <label htmlFor="generate-level-select">Level (optional)</label>
        <select id="generate-level-select" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          <option value="">All levels</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name}
            </option>
          ))}
        </select>

        <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating || !termId}>
          {isGenerating ? "Generating..." : "Generate invoices"}
        </button>
      </fieldset>

      {generateResult && (
        <p role="status">
          Created {generateResult.created.length} invoice{generateResult.created.length === 1 ? "" : "s"}
          {generateResult.skipped.length > 0 ? `, skipped ${generateResult.skipped.length}` : ""}.
          {generateResult.skipped.length > 0 && (
            <ul>
              {generateResult.skipped.map((skip) => (
                <li key={skip.learnerId}>
                  Learner {skip.learnerId}: {skip.reason}
                </li>
              ))}
            </ul>
          )}
        </p>
      )}

      {error && <p role="alert">{error}</p>}

      <div>
        <label htmlFor="filter-term-select">Filter by term</label>
        <select id="filter-term-select" value={listTermId} onChange={(e) => setListTermId(e.target.value)}>
          <option value="">All terms</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>

        <label htmlFor="filter-status-select">Filter by status</label>
        <select
          id="filter-status-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "")}
        >
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Loading invoices...</p>}

      {!isLoading && invoices.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Learner</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.invoiceNumber}</td>
                <td>{invoice.learner ? `${invoice.learner.lastName}, ${invoice.learner.firstName}` : invoice.learnerId}</td>
                <td>{formatAmount(invoice.totalAmount)}</td>
                <td>{formatAmount(invoice.amountPaid)}</td>
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

      {!isLoading && invoices.length === 0 && !error && <p>No invoices found for the current filters.</p>}
    </div>
  );
}

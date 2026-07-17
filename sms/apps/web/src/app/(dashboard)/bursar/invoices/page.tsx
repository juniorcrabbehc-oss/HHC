"use client";

import { BursarInvoices } from "../../../../features/fees/BursarInvoices";

export default function BursarInvoicesPage() {
  return (
    <main className="page">
      <h1 className="page-title">Invoices</h1>
      <BursarInvoices />
    </main>
  );
}

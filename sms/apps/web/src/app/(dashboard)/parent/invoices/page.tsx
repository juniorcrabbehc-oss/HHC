"use client";

import { ParentInvoices } from "../../../../features/fees/ParentInvoices";

export default function ParentInvoicesPage() {
  return (
    <main className="page">
      <h1 className="page-title">Invoices</h1>
      <ParentInvoices />
    </main>
  );
}

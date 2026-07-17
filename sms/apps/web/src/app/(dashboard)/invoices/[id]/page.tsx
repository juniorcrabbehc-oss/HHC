"use client";

import { useParams } from "next/navigation";
import { InvoiceDetail } from "../../../../features/fees/InvoiceDetail";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <main className="page">
      <h1 className="page-title">Invoice</h1>
      {id ? <InvoiceDetail id={id} /> : <p role="alert" className="alert alert-error">Missing invoice id.</p>}
    </main>
  );
}

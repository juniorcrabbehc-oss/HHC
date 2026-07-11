"use client";

import { useParams } from "next/navigation";
import { InvoiceDetail } from "../../../../features/fees/InvoiceDetail";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <main>
      <h1>Invoice</h1>
      {id ? <InvoiceDetail id={id} /> : <p role="alert">Missing invoice id.</p>}
    </main>
  );
}

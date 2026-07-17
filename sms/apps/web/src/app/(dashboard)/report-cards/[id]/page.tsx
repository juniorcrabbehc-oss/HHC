"use client";

import { useParams } from "next/navigation";
import { ReportCardView } from "../../../../features/academics/ReportCardView";

export default function ReportCardDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <main className="page">
      <h1 className="page-title">Report Card</h1>
      {id ? <ReportCardView id={id} /> : <p role="alert" className="alert alert-error">Missing report card id.</p>}
    </main>
  );
}

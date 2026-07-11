"use client";

import { useParams } from "next/navigation";
import { ReportCardView } from "../../../../features/academics/ReportCardView";

export default function ReportCardDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <main>
      <h1>Report Card</h1>
      {id ? <ReportCardView id={id} /> : <p role="alert">Missing report card id.</p>}
    </main>
  );
}

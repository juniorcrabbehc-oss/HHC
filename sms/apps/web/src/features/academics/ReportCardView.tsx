"use client";

import { useEffect, useState } from "react";
import { ApiError, getReportCard } from "../../lib/api-client";
import type { ReportCardDto } from "../../lib/api-client";

/**
 * Full report card detail: per-subject CA/exam/total breakdown plus the
 * overall average/grade/position. This is the eventual parent-facing view
 * (staff can reach it now via the admin review list); no PDF export yet —
 * see Phase 3 report for why (no file storage configured).
 */
export function ReportCardView({ id }: { id: string }) {
  const [reportCard, setReportCard] = useState<ReportCardDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const fetched = await getReportCard(id);
        if (!cancelled) setReportCard(fetched);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load report card.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (isLoading) return <p>Loading report card...</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!reportCard) return <p>Report card not found.</p>;

  return (
    <div>
      <h2>
        {reportCard.learner ? `${reportCard.learner.lastName}, ${reportCard.learner.firstName}` : reportCard.learnerId}
      </h2>
      <p>
        Class: {reportCard.class?.name ?? reportCard.classId} — Term: {reportCard.term?.name ?? reportCard.termId}
      </p>
      <p>Status: {reportCard.status}</p>

      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>CA</th>
            <th>Exam</th>
            <th>Total</th>
            <th>Grade</th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>
          {(reportCard.items ?? []).map((item) => (
            <tr key={item.id}>
              <td>{item.subject?.name ?? item.subjectId}</td>
              <td>{item.caTotal}</td>
              <td>{item.examTotal}</td>
              <td>{item.totalScore}</td>
              <td>{item.grade}</td>
              <td>{item.remark ?? "—"}</td>
            </tr>
          ))}
          {(reportCard.items ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>No subject scores recorded for this term.</td>
            </tr>
          )}
        </tbody>
      </table>

      <p>
        <strong>Overall average:</strong> {reportCard.overallAverage ?? "—"} &nbsp;
        <strong>Overall grade:</strong> {reportCard.overallGrade ?? "—"} &nbsp;
        <strong>Position in class:</strong> {reportCard.positionInClass ?? "—"}
      </p>

      {reportCard.teacherRemark && (
        <p>
          <strong>Teacher's remark:</strong> {reportCard.teacherRemark}
        </p>
      )}
      {reportCard.headRemark && (
        <p>
          <strong>Head's remark:</strong> {reportCard.headRemark}
        </p>
      )}
      {reportCard.conductRemark && (
        <p>
          <strong>Conduct:</strong> {reportCard.conductRemark}
        </p>
      )}
    </div>
  );
}

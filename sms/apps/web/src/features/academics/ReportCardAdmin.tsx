"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, generateReportCards, getClasses, getTerms, listReportCards, publishReportCard } from "../../lib/api-client";
import type { ClassDto, ReportCardDto, TermDto } from "../../lib/api-client";

/**
 * Admin/teacher review flow: pick a class + term, generate draft report
 * cards for every actively-enrolled learner, review the computed
 * average/grade/position, then publish individually or in bulk. Publishing
 * is what makes a report card visible to parents/learners (see
 * ReportCardsService.findById's explicit status check).
 */
export function ReportCardAdmin() {
  const [classes, setClasses] = useState<ClassDto[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [terms, setTerms] = useState<TermDto[]>([]);
  const [termId, setTermId] = useState<string>("");
  const [reportCards, setReportCards] = useState<ReportCardDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getClasses()
      .then((fetched) => {
        setClasses(fetched);
        if (fetched.length > 0) {
          setSelectedClassId((current) => current || fetched[0].id);
        }
      })
      .catch(() => {
        // Nothing cached for classes list yet on first offline load.
      });
  }, []);

  useEffect(() => {
    const selectedClass = classes.find((cls) => cls.id === selectedClassId);
    if (!selectedClass) return;

    getTerms(selectedClass.academicYearId)
      .then((fetchedTerms) => {
        setTerms(fetchedTerms);
        const current = fetchedTerms.find((term) => term.isCurrent) ?? fetchedTerms[0];
        if (current) setTermId((existing) => existing || current.id);
      })
      .catch(() => {});
  }, [classes, selectedClassId]);

  const loadReportCards = useCallback(async () => {
    if (!selectedClassId || !termId) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await listReportCards(selectedClassId, termId);
      setReportCards(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load report cards.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedClassId, termId]);

  useEffect(() => {
    void loadReportCards();
  }, [loadReportCards]);

  async function handleGenerate() {
    if (!selectedClassId || !termId) return;
    setIsGenerating(true);
    setError(null);
    try {
      const generated = await generateReportCards(selectedClassId, termId);
      setReportCards(generated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate report cards.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handlePublish(id: string) {
    setPublishingId(id);
    setError(null);
    try {
      const updated = await publishReportCard(id);
      setReportCards((prev) => prev.map((rc) => (rc.id === id ? updated : rc)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish report card.");
    } finally {
      setPublishingId(null);
    }
  }

  async function handlePublishAll() {
    const drafts = reportCards.filter((rc) => rc.status === "draft");
    for (const rc of drafts) {
      // Sequential: each publish is an audited write; no need to
      // parallelize a handful of admin clicks-worth of report cards.
      // eslint-disable-next-line no-await-in-loop
      await handlePublish(rc.id);
    }
  }

  const hasDrafts = reportCards.some((rc) => rc.status === "draft");

  return (
    <div>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="class-select">Class</label>
          <select id="class-select" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
            {classes.length === 0 && <option value="">No classes available</option>}
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="term-select">Term</label>
          <select id="term-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
            {terms.length === 0 && <option value="">No terms available</option>}
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleGenerate()}
          disabled={isGenerating || !selectedClassId || !termId}
        >
          {isGenerating ? "Generating..." : "Generate report cards"}
        </button>

        <button type="button" className="btn" onClick={() => void handlePublishAll()} disabled={!hasDrafts}>
          Publish all drafts
        </button>
      </div>

      {error && <p role="alert" className="alert alert-error">{error}</p>}
      {isLoading && <p className="loading">Loading report cards...</p>}

      {!isLoading && reportCards.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Position</th>
                <th>Learner</th>
                <th className="num">Average</th>
                <th>Grade</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reportCards.map((rc) => (
                <tr key={rc.id}>
                  <td className="num">{rc.positionInClass ?? "—"}</td>
                  <td>{rc.learner ? `${rc.learner.lastName}, ${rc.learner.firstName}` : rc.learnerId}</td>
                  <td className="num">{rc.overallAverage ?? "—"}</td>
                  <td>{rc.overallGrade ?? "—"}</td>
                  <td>
                    <span className={`pill ${rc.status === "published" ? "pill-success" : "pill-warning"}`}>
                      {rc.status}
                    </span>
                  </td>
                  <td className="nowrap">
                    <Link href={`/report-cards/${rc.id}`}>View</Link>{" "}
                    {rc.status === "draft" && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void handlePublish(rc.id)}
                        disabled={publishingId === rc.id}
                      >
                        {publishingId === rc.id ? "Publishing..." : "Publish"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && reportCards.length === 0 && !error && <p className="muted">No report cards generated yet for this class/term.</p>}
    </div>
  );
}

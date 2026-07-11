"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, listLearners } from "../../../../lib/api-client";
import type { LearnerSummary } from "../../../../lib/api-client";

export default function LearnersListPage() {
  const [learners, setLearners] = useState<LearnerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listLearners({ pageSize: 50 });
        if (!cancelled) {
          setLearners(result.items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load learners.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Learners</h1>
      <p>
        <Link href="/front-office/learners/new">Register a new learner</Link>
      </p>

      {isLoading && <p>Loading learners...</p>}
      {error && <p role="alert">{error}</p>}

      {!isLoading && !error && (
        <table>
          <thead>
            <tr>
              <th>Admission #</th>
              <th>Name</th>
              <th>Class</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((learner) => {
              const currentClass = learner.classEnrollments?.[0]?.class;
              return (
                <tr key={learner.id}>
                  <td>{learner.admissionNumber}</td>
                  <td>
                    {learner.lastName}, {learner.firstName}
                    {learner.otherNames ? ` ${learner.otherNames}` : ""}
                  </td>
                  <td>{currentClass?.name ?? "—"}</td>
                  <td>{learner.status}</td>
                </tr>
              );
            })}
            {learners.length === 0 && (
              <tr>
                <td colSpan={4}>No learners found.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCaScoreRoster,
  getClasses,
  getClassSubjects,
  getCurrentUser,
  getTerms,
} from "../../lib/api-client";
import type { CaScoreDto, ClassDto, ClassSubjectDto, ScoreRosterRow } from "../../lib/api-client";
import { caScoreRosterCacheKey, getCache, putCache } from "../../lib/offline/cache";
import { enqueueCaScoreMark, getPendingForClassSubjectTerm } from "../../lib/offline/outbox";
import type { OutboxItem } from "../../lib/offline/dexie";
import { syncNow } from "../../lib/offline/sync-engine";
import { useSyncStatus } from "../../lib/offline/use-sync-status";

interface PendingScoreEntry {
  scoreObtained: number;
  clientUuid: string;
}

/**
 * Teacher CA score entry: pick a class -> the subject you teach in it ->
 * the term, configure the assessment being scored (name, max, weight),
 * then key in each learner's score. Offline-tolerant with the same
 * queued/pending UX as AttendanceRegister — enqueueCaScoreMark writes to
 * the Dexie outbox immediately (pure IndexedDB, no network), and syncNow()
 * best-effort flushes it.
 */
export function CaScoreEntry() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const { pendingCount, isSyncing } = useSyncStatus();

  const [classes, setClasses] = useState<ClassDto[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const [classSubjects, setClassSubjects] = useState<ClassSubjectDto[]>([]);
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState<string>("");

  const [termId, setTermId] = useState<string>("");

  const [assessmentType, setAssessmentType] = useState<string>("Class Test 1");
  const [maxScore, setMaxScore] = useState<number>(20);
  const [weightPct, setWeightPct] = useState<number>(10);

  const [rows, setRows] = useState<ScoreRosterRow<CaScoreDto>[]>([]);
  const [pendingMap, setPendingMap] = useState<Record<string, PendingScoreEntry>>({});
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load every class this staff member can see (admins see all; teachers
  // are further filtered below to the class-subjects they're assigned to).
  useEffect(() => {
    if (!currentUser) return;
    getClasses()
      .then((fetched) => {
        setClasses(fetched);
        if (fetched.length > 0) {
          setSelectedClassId((current) => current || fetched[0].id);
        }
      })
      .catch(() => {
        // Offline on first load with nothing cached — nothing to do here.
      });
  }, [currentUser]);

  // Load the subjects taught in the selected class, restricted to "mine"
  // for teachers (admins can pick any).
  useEffect(() => {
    if (!currentUser || !selectedClassId) return;
    const isAdmin = currentUser.roles.includes("admin");

    getClassSubjects(selectedClassId)
      .then((fetched) => {
        const mine = isAdmin ? fetched : fetched.filter((cs) => cs.teacherId === currentUser.id);
        setClassSubjects(mine);
        setSelectedClassSubjectId((current) => (mine.some((cs) => cs.id === current) ? current : mine[0]?.id ?? ""));
      })
      .catch(() => {
        // Offline — leave whatever was previously selected.
      });
  }, [currentUser, selectedClassId]);

  // Resolve the current term for the selected class's academic year.
  useEffect(() => {
    const selectedClass = classes.find((cls) => cls.id === selectedClassId);
    if (!selectedClass) return;

    getTerms(selectedClass.academicYearId)
      .then((terms) => {
        const current = terms.find((term) => term.isCurrent) ?? terms[0];
        if (current) setTermId(current.id);
      })
      .catch(() => {
        // Offline — termId stays whatever it was.
      });
  }, [classes, selectedClassId]);

  const refreshPending = useCallback(async () => {
    if (!selectedClassSubjectId || !termId) return;
    try {
      const items: OutboxItem[] = await getPendingForClassSubjectTerm(selectedClassSubjectId, termId);
      const map: Record<string, PendingScoreEntry> = {};
      for (const item of items) {
        const payload = item.payload as { learnerId: string; assessmentType: string; scoreObtained: number };
        if (payload.assessmentType !== assessmentType) continue;
        map[payload.learnerId] = { scoreObtained: payload.scoreObtained, clientUuid: item.clientUuid };
      }
      setPendingMap(map);
    } catch {
      // IndexedDB not ready — ignore, next effect run will retry.
    }
  }, [selectedClassSubjectId, termId, assessmentType]);

  const loadRoster = useCallback(async () => {
    if (!selectedClassSubjectId || !termId) return;
    setIsLoading(true);
    setError(null);

    const cacheKey = caScoreRosterCacheKey(selectedClassSubjectId, termId);

    try {
      const fetched = await getCaScoreRoster(selectedClassSubjectId, termId);
      setRows(fetched);
      setIsOffline(false);
      await putCache(cacheKey, fetched);
    } catch {
      try {
        const cached = await getCache<ScoreRosterRow<CaScoreDto>[]>(cacheKey);
        if (cached) {
          setRows(cached);
          setIsOffline(true);
        } else {
          setRows([]);
          setError("No cached roster available offline for this class/subject/term yet — connect once to cache it.");
        }
      } catch {
        setError("Unable to load the roster (offline, and the local cache isn't ready).");
      }
    } finally {
      setIsLoading(false);
    }

    await refreshPending();
  }, [selectedClassSubjectId, termId, refreshPending]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    const interval = setInterval(() => void refreshPending(), 3000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  async function handleScoreChange(learnerId: string, value: string) {
    if (!selectedClassSubjectId || !termId) return;
    const scoreObtained = Number(value);
    if (Number.isNaN(scoreObtained)) return;

    const clientUuid = await enqueueCaScoreMark({
      learnerId,
      classSubjectId: selectedClassSubjectId,
      termId,
      assessmentType,
      maxScore,
      scoreObtained,
      weightPct,
    });

    setPendingMap((prev) => ({ ...prev, [learnerId]: { scoreObtained, clientUuid } }));

    void syncNow().then(() => refreshPending());
  }

  const selectedClassSubject = classSubjects.find((cs) => cs.id === selectedClassSubjectId);

  function existingScoreFor(row: ScoreRosterRow<CaScoreDto>): CaScoreDto | undefined {
    return row.scores.find((s) => s.assessmentType === assessmentType);
  }

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
          <label htmlFor="subject-select">Subject</label>
          <select id="subject-select" value={selectedClassSubjectId} onChange={(e) => setSelectedClassSubjectId(e.target.value)}>
            {classSubjects.length === 0 && <option value="">No subjects assigned to you in this class</option>}
            {classSubjects.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.subject?.name ?? cs.subjectId}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void syncNow().then(() => refreshPending())}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing..." : `Sync now${pendingCount > 0 ? ` (${pendingCount} pending)` : ""}`}
        </button>
      </div>

      <fieldset>
        <legend>Assessment</legend>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="assessment-type">Name</label>
            <input
              id="assessment-type"
              type="text"
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="max-score">Max score</label>
            <input
              id="max-score"
              type="number"
              min={1}
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
            />
          </div>

          <div className="field">
            <label htmlFor="weight-pct">Weight % (of this subject's CA pool)</label>
            <input
              id="weight-pct"
              type="number"
              min={0}
              max={100}
              value={weightPct}
              onChange={(e) => setWeightPct(Number(e.target.value))}
            />
          </div>
        </div>
      </fieldset>

      {isOffline && (
        <p role="status" className="alert alert-info">
          Offline — showing the last cached roster for this class/subject/term.
        </p>
      )}
      {pendingCount > 0 && (
        <p role="status" className="alert alert-warning">
          {pendingCount} score entr{pendingCount === 1 ? "y" : "ies"} queued, waiting to sync.
        </p>
      )}
      {isLoading && <p className="loading">Loading roster...</p>}
      {error && <p role="alert" className="alert alert-error">{error}</p>}
      {!selectedClassSubject && classSubjects.length > 0 && <p className="muted">Select a subject to enter scores.</p>}
      {!termId && selectedClassSubjectId && <p className="loading">Resolving the current term for this class...</p>}

      {!isLoading && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Admission #</th>
                <th>Name</th>
                <th>{assessmentType || "Score"} (/{maxScore})</th>
                <th>Queued</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pending = pendingMap[row.learnerId];
                const existing = existingScoreFor(row);
                const value = pending?.scoreObtained ?? existing?.scoreObtained ?? "";
                const isQueued = Boolean(pending);
                return (
                  <tr key={row.learnerId}>
                    <td>{row.admissionNumber}</td>
                    <td className="nowrap">
                      {row.lastName}, {row.firstName}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={maxScore}
                        value={value}
                        disabled={!termId}
                        style={{ width: 96 }}
                        onChange={(e) => void handleScoreChange(row.learnerId, e.target.value)}
                      />
                    </td>
                    <td>{isQueued ? <span className="pill pill-warning">queued</span> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && rows.length === 0 && !error && <p className="muted">No learners actively enrolled in this class.</p>}
    </div>
  );
}

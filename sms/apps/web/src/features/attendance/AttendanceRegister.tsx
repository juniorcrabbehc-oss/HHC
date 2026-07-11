"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttendanceStatus } from "@sms/shared-types";
import {
  getAttendanceRegister,
  getClasses,
  getCurrentUser,
  getTerms,
} from "../../lib/api-client";
import type { AttendanceRegisterRow, ClassDto } from "../../lib/api-client";
import { getCache, putCache, registerCacheKey } from "../../lib/offline/cache";
import { enqueueAttendanceMark, getPendingForClassDate } from "../../lib/offline/outbox";
import type { OutboxItem } from "../../lib/offline/dexie";
import { syncNow } from "../../lib/offline/sync-engine";
import { useSyncStatus } from "../../lib/offline/use-sync-status";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface PendingMarkEntry {
  status: AttendanceStatus;
  clientUuid: string;
}

export function AttendanceRegister() {
  const currentUser = useMemo(() => getCurrentUser(), []);
  const { pendingCount, isSyncing } = useSyncStatus();

  const [classes, setClasses] = useState<ClassDto[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [termId, setTermId] = useState<string>("");
  const [date, setDate] = useState<string>(todayDateString());

  const [rows, setRows] = useState<AttendanceRegisterRow[]>([]);
  const [pendingMap, setPendingMap] = useState<Record<string, PendingMarkEntry>>({});
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the classes this teacher owns (or all classes, for an admin
  // previewing the page) and pick a default.
  useEffect(() => {
    if (!currentUser) return;
    const isAdmin = currentUser.roles.includes("admin");

    getClasses(isAdmin ? {} : { classTeacherId: currentUser.id })
      .then((fetchedClasses) => {
        setClasses(fetchedClasses);
        if (fetchedClasses.length > 0) {
          setSelectedClassId((current) => current || fetchedClasses[0].id);
        }
      })
      .catch(() => {
        // Offline on first load with nothing cached yet — nothing we can
        // do here without a cached class list; the roster load below will
        // still fall back to Dexie if a classId was previously selected.
      });
  }, [currentUser]);

  // Resolve the current term for the selected class's academic year, so
  // marks can be tagged with a real termId.
  useEffect(() => {
    const selectedClass = classes.find((cls) => cls.id === selectedClassId);
    if (!selectedClass) return;

    getTerms(selectedClass.academicYearId)
      .then((terms) => {
        const current = terms.find((term) => term.isCurrent) ?? terms[0];
        if (current) setTermId(current.id);
      })
      .catch(() => {
        // Offline — termId stays whatever it was; marking will simply be
        // blocked until it's resolved (see the disabled state below).
      });
  }, [classes, selectedClassId]);

  const refreshPending = useCallback(async () => {
    if (!selectedClassId || !date) return;
    try {
      const items: OutboxItem[] = await getPendingForClassDate(selectedClassId, date);
      const map: Record<string, PendingMarkEntry> = {};
      for (const item of items) {
        const payload = item.payload as { learnerId: string; status: AttendanceStatus };
        map[payload.learnerId] = { status: payload.status, clientUuid: item.clientUuid };
      }
      setPendingMap(map);
    } catch {
      // IndexedDB not ready — ignore, next effect run will retry.
    }
  }, [selectedClassId, date]);

  const loadRoster = useCallback(async () => {
    if (!selectedClassId || !date) return;
    setIsLoading(true);
    setError(null);

    const cacheKey = registerCacheKey(selectedClassId, date);

    try {
      const fetched = await getAttendanceRegister(selectedClassId, date);
      setRows(fetched);
      setIsOffline(false);
      await putCache(cacheKey, fetched);
    } catch {
      try {
        const cached = await getCache<AttendanceRegisterRow[]>(cacheKey);
        if (cached) {
          setRows(cached);
          setIsOffline(true);
        } else {
          setRows([]);
          setError("No cached roster available offline for this class and date yet — connect once to cache it.");
        }
      } catch {
        setError("Unable to load the roster (offline, and the local cache isn't ready).");
      }
    } finally {
      setIsLoading(false);
    }

    await refreshPending();
  }, [selectedClassId, date, refreshPending]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  // Keep the "queued" badges in sync with what's actually still in the
  // outbox (an item disappears once it's synced).
  useEffect(() => {
    const interval = setInterval(() => void refreshPending(), 3000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  async function handleMark(learnerId: string, status: AttendanceStatus) {
    if (!selectedClassId || !termId) return;

    // Optimistic: write to the outbox and update local UI state immediately.
    // This must never touch the network — enqueueAttendanceMark is pure
    // IndexedDB, so this works fully offline.
    const clientUuid = await enqueueAttendanceMark({
      classId: selectedClassId,
      learnerId,
      termId,
      date,
      status,
      source: "web",
    });

    setPendingMap((prev) => ({ ...prev, [learnerId]: { status, clientUuid } }));

    // Best-effort immediate sync attempt; if offline this is a no-op inside
    // syncNow() and the mark stays queued until the next trigger.
    void syncNow().then(() => refreshPending());
  }

  const selectedClass = classes.find((cls) => cls.id === selectedClassId);

  return (
    <div>
      <div>
        <label htmlFor="class-select">Class</label>
        <select id="class-select" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
          {classes.length === 0 && <option value="">No classes assigned</option>}
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>

        <label htmlFor="date-select">Date</label>
        <input id="date-select" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <button type="button" onClick={() => void syncNow().then(() => refreshPending())} disabled={isSyncing}>
          {isSyncing ? "Syncing..." : `Sync now${pendingCount > 0 ? ` (${pendingCount} pending)` : ""}`}
        </button>
      </div>

      {isOffline && <p role="status">Offline — showing the last cached roster for this class/date.</p>}
      {pendingCount > 0 && <p role="status">{pendingCount} attendance mark(s) queued, waiting to sync.</p>}
      {isLoading && <p>Loading roster...</p>}
      {error && <p role="alert">{error}</p>}
      {!selectedClass && classes.length > 0 && <p>Select a class to take attendance.</p>}
      {!termId && selectedClassId && <p>Resolving the current term for this class...</p>}

      {!isLoading && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Admission #</th>
              <th>Name</th>
              {STATUS_OPTIONS.map((option) => (
                <th key={option.value}>{option.label}</th>
              ))}
              <th>Queued</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const currentStatus = pendingMap[row.learnerId]?.status ?? row.record?.status ?? null;
              const isQueued = Boolean(pendingMap[row.learnerId]);
              return (
                <tr key={row.learnerId}>
                  <td>{row.admissionNumber}</td>
                  <td>
                    {row.lastName}, {row.firstName}
                  </td>
                  {STATUS_OPTIONS.map((option) => (
                    <td key={option.value}>
                      <button
                        type="button"
                        aria-pressed={currentStatus === option.value}
                        disabled={!termId}
                        onClick={() => void handleMark(row.learnerId, option.value)}
                      >
                        {currentStatus === option.value ? `● ${option.label}` : option.label}
                      </button>
                    </td>
                  ))}
                  <td>{isQueued ? "queued" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!isLoading && rows.length === 0 && !error && <p>No learners actively enrolled in this class.</p>}
    </div>
  );
}

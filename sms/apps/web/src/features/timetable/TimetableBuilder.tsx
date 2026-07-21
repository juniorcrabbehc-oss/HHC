"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createPeriod,
  createRoom,
  createTimetableSlot,
  deletePeriod,
  deleteRoom,
  deleteTimetableSlot,
  getClasses,
  getClassSubjects,
  getClassTimetable,
  getPeriods,
  getRooms,
} from "../../lib/api-client";
import type {
  ClassDto,
  ClassSubjectDto,
  PeriodDto,
  RoomDto,
  TimetableSlotDto,
} from "../../lib/api-client";
import { SCHOOL_DAYS, TimetableGrid, teacherHandle } from "./TimetableGrid";

interface EditingCell {
  dayOfWeek: number;
  period: PeriodDto;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Admin timetable builder: pick a class, click an empty cell to place a
 * lesson (subject from the class's subject list; teacher defaults to the
 * subject teacher server-side). Conflicts come back as 409s with the
 * clashing lesson named — surfaced verbatim in the alert.
 */
export function TimetableBuilder() {
  const [classes, setClasses] = useState<ClassDto[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [periods, setPeriods] = useState<PeriodDto[]>([]);
  const [rooms, setRooms] = useState<RoomDto[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectDto[]>([]);
  const [slots, setSlots] = useState<TimetableSlotDto[]>([]);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formRoomId, setFormRoomId] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newPeriod, setNewPeriod] = useState({ name: "", startTime: "", endTime: "", isBreak: false });
  const [newRoom, setNewRoom] = useState({ name: "", capacity: "" });

  useEffect(() => {
    getClasses()
      .then((fetched) => {
        setClasses(fetched);
        if (fetched.length > 0) setSelectedClassId((current) => current || fetched[0].id);
      })
      .catch((err) => setError(errorMessage(err, "Failed to load classes.")));
    getRooms()
      .then(setRooms)
      .catch(() => setRooms([]));
  }, []);

  const loadPeriods = useCallback(() => {
    return getPeriods()
      .then(setPeriods)
      .catch((err) => setError(errorMessage(err, "Failed to load periods.")));
  }, []);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  const loadTimetable = useCallback(async () => {
    if (!selectedClassId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [timetable, subjects] = await Promise.all([
        getClassTimetable(selectedClassId),
        getClassSubjects(selectedClassId),
      ]);
      setSlots(timetable.slots);
      setClassSubjects(subjects);
    } catch (err) {
      setError(errorMessage(err, "Failed to load the timetable."));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    setEditingCell(null);
    void loadTimetable();
  }, [loadTimetable]);

  function openCell(dayOfWeek: number, period: PeriodDto) {
    setEditingCell({ dayOfWeek, period });
    setFormSubjectId(classSubjects[0]?.subjectId ?? "");
    setFormRoomId("");
    setError(null);
  }

  async function handlePlaceLesson() {
    if (!editingCell || !formSubjectId || !selectedClassId) return;
    setIsSaving(true);
    setError(null);
    try {
      await createTimetableSlot({
        classId: selectedClassId,
        subjectId: formSubjectId,
        periodId: editingCell.period.id,
        dayOfWeek: editingCell.dayOfWeek,
        roomId: formRoomId || null,
      });
      setEditingCell(null);
      await loadTimetable();
    } catch (err) {
      setError(errorMessage(err, "Failed to place the lesson."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteSlot(slot: TimetableSlotDto) {
    setError(null);
    try {
      await deleteTimetableSlot(slot.id);
      await loadTimetable();
    } catch (err) {
      setError(errorMessage(err, "Failed to remove the lesson."));
    }
  }

  async function handleAddPeriod() {
    if (!newPeriod.name || !newPeriod.startTime || !newPeriod.endTime) return;
    setError(null);
    try {
      await createPeriod({
        name: newPeriod.name,
        startTime: newPeriod.startTime,
        endTime: newPeriod.endTime,
        sortOrder: Math.max(0, ...periods.map((p) => p.sortOrder)) + 1,
        isBreak: newPeriod.isBreak,
      });
      setNewPeriod({ name: "", startTime: "", endTime: "", isBreak: false });
      await loadPeriods();
    } catch (err) {
      setError(errorMessage(err, "Failed to add the period."));
    }
  }

  async function handleDeletePeriod(id: string) {
    setError(null);
    try {
      await deletePeriod(id);
      await loadPeriods();
    } catch (err) {
      setError(errorMessage(err, "Failed to delete the period."));
    }
  }

  async function handleAddRoom() {
    if (!newRoom.name) return;
    setError(null);
    try {
      const capacity = newRoom.capacity ? Number(newRoom.capacity) : undefined;
      await createRoom({ name: newRoom.name, ...(capacity ? { capacity } : {}) });
      setNewRoom({ name: "", capacity: "" });
      setRooms(await getRooms());
    } catch (err) {
      setError(errorMessage(err, "Failed to add the room."));
    }
  }

  async function handleDeleteRoom(id: string) {
    setError(null);
    try {
      await deleteRoom(id);
      setRooms(await getRooms());
    } catch (err) {
      setError(errorMessage(err, "Failed to delete the room."));
    }
  }

  const dayLabel = (value: number) => SCHOOL_DAYS.find((d) => d.value === value)?.label ?? String(value);

  return (
    <div>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="builder-class">Class</label>
          <select id="builder-class" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
            {classes.length === 0 && <option value="">No classes</option>}
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      {isLoading && <p className="loading">Loading timetable...</p>}

      {periods.length === 0 && !isLoading ? (
        <p className="muted">No periods defined yet — add the school&apos;s periods below to start building.</p>
      ) : (
        <TimetableGrid
          periods={periods}
          slots={slots}
          renderSlot={(slot) => (
            <div>
              <strong>{slot.subject?.name ?? "Lesson"}</strong>
              {slot.room ? <div className="muted">{slot.room.name}</div> : null}
              {teacherHandle(slot.teacher) ? <div className="muted">{teacherHandle(slot.teacher)}</div> : null}
              <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleDeleteSlot(slot)}>
                Remove
              </button>
            </div>
          )}
          renderEmptyCell={(dayOfWeek, period) => (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => openCell(dayOfWeek, period)}
              disabled={classSubjects.length === 0}
            >
              + Add
            </button>
          )}
        />
      )}

      {selectedClassId && classSubjects.length === 0 && !isLoading && (
        <p className="muted">This class has no subjects assigned yet — assign subjects before building its timetable.</p>
      )}

      {editingCell && (
        <div className="card">
          <h2>
            Place a lesson — {dayLabel(editingCell.dayOfWeek)}, {editingCell.period.name} (
            {editingCell.period.startTime}–{editingCell.period.endTime})
          </h2>
          <div className="toolbar">
            <div className="field">
              <label htmlFor="slot-subject">Subject</label>
              <select id="slot-subject" value={formSubjectId} onChange={(e) => setFormSubjectId(e.target.value)}>
                {classSubjects.map((cs) => (
                  <option key={cs.subjectId} value={cs.subjectId}>
                    {cs.subject?.name ?? cs.subjectId}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="slot-room">Room (optional)</label>
              <select id="slot-room" value={formRoomId} onChange={(e) => setFormRoomId(e.target.value)}>
                <option value="">No room</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handlePlaceLesson()}
              disabled={isSaving || !formSubjectId}
            >
              {isSaving ? "Placing..." : "Place lesson"}
            </button>
            <button type="button" className="btn" onClick={() => setEditingCell(null)}>
              Cancel
            </button>
          </div>
          <p className="muted">
            The subject teacher is assigned automatically; double-bookings of the class, teacher, or room are
            rejected.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Periods</h2>
        {periods.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Time</th>
                  <th>Break?</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.id}>
                    <td>{period.name}</td>
                    <td className="nowrap">
                      {period.startTime}–{period.endTime}
                    </td>
                    <td>{period.isBreak ? "Yes" : "No"}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleDeletePeriod(period.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="toolbar">
          <div className="field">
            <label htmlFor="period-name">Name</label>
            <input
              id="period-name"
              value={newPeriod.name}
              placeholder="Period 1"
              onChange={(e) => setNewPeriod({ ...newPeriod, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="period-start">Starts</label>
            <input
              id="period-start"
              type="time"
              value={newPeriod.startTime}
              onChange={(e) => setNewPeriod({ ...newPeriod, startTime: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="period-end">Ends</label>
            <input
              id="period-end"
              type="time"
              value={newPeriod.endTime}
              onChange={(e) => setNewPeriod({ ...newPeriod, endTime: e.target.value })}
            />
          </div>
          <div className="field field-checkbox">
            <label>
              <input
                type="checkbox"
                checked={newPeriod.isBreak}
                onChange={(e) => setNewPeriod({ ...newPeriod, isBreak: e.target.checked })}
              />{" "}
              Break
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleAddPeriod()}
            disabled={!newPeriod.name || !newPeriod.startTime || !newPeriod.endTime}
          >
            Add period
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Rooms</h2>
        {rooms.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Capacity</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td>{room.name}</td>
                    <td className="num">{room.capacity ?? "—"}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleDeleteRoom(room.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="toolbar">
          <div className="field">
            <label htmlFor="room-name">Name</label>
            <input
              id="room-name"
              value={newRoom.name}
              placeholder="Room 4"
              onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="room-capacity">Capacity (optional)</label>
            <input
              id="room-capacity"
              type="number"
              min={1}
              value={newRoom.capacity}
              onChange={(e) => setNewRoom({ ...newRoom, capacity: e.target.value })}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void handleAddRoom()} disabled={!newRoom.name}>
            Add room
          </button>
        </div>
      </div>
    </div>
  );
}

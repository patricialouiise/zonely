import { useState } from "react";
import { DateTime } from "luxon";
import type { CalEvent, EventDraft, Recurrence, Zone } from "../types";
import { instantFrom } from "../lib/time";
import {
  EVENT_COLORS,
  DEFAULT_EVENT_COLOR,
  DEFAULT_OPACITY,
  OPACITY_PRESETS,
  eventFill,
} from "../lib/colors";

interface Props {
  zones: Zone[];
  defaultDate: string;
  defaultZoneId: string;
  defaultTime?: string;
  defaultDuration?: number;
  /** the event being edited (may carry a recurrence to prefill); null = new */
  editing?: CalEvent | null;
  /** true when editing an occurrence that belongs to a series */
  editingRecurring?: boolean;
  onSave: (draft: EventDraft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(mins: number): string {
  const t = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
/** Minutes from start to end; if end is at/before start it's the next day. */
function durationBetween(start: string, end: string): number {
  const d = toMin(end) - toMin(start);
  return d > 0 ? d : d + 1440;
}
function durLabel(d: number): string {
  const h = Math.floor(d / 60);
  const m = d % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
const WEEKDAYS: { wd: number; label: string }[] = [
  { wd: 7, label: "S" },
  { wd: 1, label: "M" },
  { wd: 2, label: "T" },
  { wd: 3, label: "W" },
  { wd: 4, label: "T" },
  { wd: 5, label: "F" },
  { wd: 6, label: "S" },
];

type RepeatMode = "none" | "daily" | "weekdays" | "weekly";

function initialMode(rec?: Recurrence): RepeatMode {
  if (!rec) return "none";
  if (rec.freq === "daily") return "daily";
  const days = (rec.byWeekday ?? []).slice().sort((a, b) => a - b);
  if (days.length === 5 && days.every((d, i) => d === i + 1)) return "weekdays";
  return "weekly";
}

export default function EventForm({
  zones,
  defaultDate,
  defaultZoneId,
  defaultTime,
  defaultDuration,
  editing,
  editingRecurring,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const initialStart = editing?.time ?? defaultTime ?? "13:00";
  const initialDuration = editing?.durationMin ?? defaultDuration ?? 60;
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(toHHMM(toMin(initialStart) + initialDuration));
  const durationMin = durationBetween(start, end);
  const [zoneId, setZoneId] = useState(editing?.zoneId ?? defaultZoneId);
  const [note, setNote] = useState(editing?.note ?? "");
  const [color, setColor] = useState(editing?.color ?? DEFAULT_EVENT_COLOR);
  const [opacity, setOpacity] = useState(editing?.opacity ?? DEFAULT_OPACITY);
  const [repeat, setRepeat] = useState<RepeatMode>(initialMode(editing?.recurrence));
  const [weeklyDays, setWeeklyDays] = useState<number[]>(
    editing?.recurrence?.byWeekday && initialMode(editing?.recurrence) === "weekly"
      ? editing.recurrence.byWeekday
      : [DateTime.fromISO(editing?.date ?? defaultDate).weekday]
  );
  const [endsOn, setEndsOn] = useState(editing?.recurrence?.until ?? "");

  function toggleWeekday(wd: number) {
    setWeeklyDays((days) =>
      days.includes(wd) ? days.filter((d) => d !== wd) : [...days, wd].sort((a, b) => a - b)
    );
  }

  function buildRecurrence(): Recurrence | undefined {
    const until = endsOn || undefined;
    if (repeat === "none") return undefined;
    if (repeat === "daily") return { freq: "daily", interval: 1, until };
    if (repeat === "weekdays")
      return { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5], until };
    const days = weeklyDays.length ? weeklyDays : [DateTime.fromISO(date).weekday];
    return { freq: "weekly", interval: 1, byWeekday: days.slice().sort((a, b) => a - b), until };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date || !start || !end) return;
    onSave({
      title: title.trim(),
      date,
      time: start,
      durationMin,
      zoneId,
      note: note.trim() || undefined,
      color,
      opacity,
      recurrence: buildRecurrence(),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{editing ? "Edit event" : "Add event"}</h2>

        <label>
          <span>Title</span>
          <input
            autoFocus
            value={title}
            placeholder="e.g. Flight to Toronto"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label>
          <span>Entered in zone</span>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.flag} {z.label}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>Start</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <span>End · {durLabel(durationMin)}</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {toMin(end) <= toMin(start) && (
          <p className="muted small">Ends next day (crosses midnight).</p>
        )}

        {(() => {
          const s0 = instantFrom(date, start, zoneId);
          if (!s0.isValid) return null;
          return (
            <div className="event-times">
              <div className="event-times__head">
                Duration <b>{durLabel(durationMin)}</b> · shown in each zone:
              </div>
              {zones.map((z) => {
                const s = s0.setZone(z.id);
                const e = s.plus({ minutes: durationMin });
                const sameDay = s.hasSame(e, "day");
                return (
                  <div
                    key={z.id}
                    className={"event-times__row" + (z.id === zoneId ? " is-entered" : "")}
                  >
                    <span className="event-times__zone">
                      {z.flag} {z.label}
                    </span>
                    <span className="event-times__span">
                      {s.toFormat("ccc h:mm a")} <span className="arrow">→</span>{" "}
                      {e.toFormat(sameDay ? "h:mm a" : "ccc h:mm a")}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        <label>
          <span>Repeat</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatMode)}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Every weekday (Mon–Fri)</option>
            <option value="weekly">Weekly on…</option>
          </select>
        </label>

        {repeat === "weekly" && (
          <div className="weekday-pick">
            {WEEKDAYS.map((d) => (
              <button
                type="button"
                key={d.wd}
                className={"wd" + (weeklyDays.includes(d.wd) ? " wd--on" : "")}
                onClick={() => toggleWeekday(d.wd)}
                title={"Toggle " + d.label}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        {repeat !== "none" && (
          <label>
            <span>Ends on (optional)</span>
            <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
        )}

        <label>
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <label>
          <span>Color</span>
          <div className="color-pick">
            {EVENT_COLORS.map((c) => (
              <button
                type="button"
                key={c.key}
                className={"swatch" + (color === c.hex ? " selected" : "")}
                style={{ background: c.hex }}
                onClick={() => setColor(c.hex)}
                title={c.name}
                aria-label={c.name}
              />
            ))}
          </div>
        </label>

        <label>
          <span>Opacity</span>
          <div className="opacity-pick">
            {OPACITY_PRESETS.map((p) => (
              <button
                type="button"
                key={p}
                className={"opacity-btn" + (Math.abs(opacity - p) < 0.03 ? " selected" : "")}
                style={{ background: eventFill(color, p) }}
                onClick={() => setOpacity(p)}
              >
                {Math.round(p * 100)}%
              </button>
            ))}
          </div>
        </label>

        {editingRecurring && (
          <p className="muted small">
            This is a repeating event — you'll choose which occurrences to change when you save or delete.
          </p>
        )}

        <div className="modal__actions">
          {editing && onDelete && (
            <button type="button" className="btn danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {editing ? "Save changes" : "Add event"}
          </button>
        </div>
      </form>
    </div>
  );
}

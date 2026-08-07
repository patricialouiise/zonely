import { useState } from "react";
import { DateTime } from "luxon";
import type { Zone } from "../types";
import { commonWindows } from "../lib/meeting";
import { durationLabel } from "../lib/time";
import type { CreateAt } from "./DayView";

interface Props {
  zones: Zone[];
  baseZoneId: string;
  date: string;
  onCreateAt: (at: CreateAt) => void;
}

const DURATIONS = [30, 60, 90, 120];

/** Finds slots that fall within [start,end] local time in every active zone. */
export default function MeetingFinder({ zones, baseZoneId, date, onCreateAt }: Props) {
  const [winStart, setWinStart] = useState("09:00");
  const [winEnd, setWinEnd] = useState("18:00");
  const [duration, setDuration] = useState(60);

  const baseZone = zones.find((z) => z.id === baseZoneId);
  const others = zones.filter((z) => z.id !== baseZoneId);
  const windows = commonWindows(zones, date, baseZoneId, winStart, winEnd, duration);
  const dayLabel = DateTime.fromISO(date).toFormat("ccc, LLL d");

  return (
    <>
      <p className="muted small">
        Times that land within these hours in every zone on <b>{dayLabel}</b>.
      </p>

      <div className="workband-controls">
        <label>
          <span>Local hours from</span>
          <input type="time" value={winStart} onChange={(e) => setWinStart(e.target.value)} />
        </label>
        <label>
          <span>to</span>
          <input type="time" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} />
        </label>
        <label>
          <span>Min length</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {durationLabel(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {windows.length === 0 ? (
        <p className="muted small">
          No common time on {dayLabel} within those hours — try a wider range or fewer zones.
        </p>
      ) : (
        <div className="finder-results">
          {windows.map((w, i) => {
            const s = DateTime.fromMillis(w.s).setZone(baseZoneId);
            const e = DateTime.fromMillis(w.e).setZone(baseZoneId);
            const len = Math.round((w.e - w.s) / 60000);
            return (
              <div key={i} className="finder-window">
                <div className="finder-window__head">
                  <span className="finder-window__base">
                    {baseZone?.flag} {s.toFormat("h:mm a")} <span className="arrow">→</span>{" "}
                    {e.toFormat("h:mm a")}
                  </span>
                  <span className="daydiff up">{durationLabel(len)}</span>
                  <button
                    className="btn tiny primary"
                    onClick={() =>
                      onCreateAt({
                        date: s.toFormat("yyyy-LL-dd"),
                        time: s.toFormat("HH:mm"),
                        durationMin: Math.min(duration, len),
                        zoneId: baseZoneId,
                      })
                    }
                  >
                    + Add
                  </button>
                </div>
                {others.length > 0 && (
                  <div className="finder-window__zones">
                    {others.map((z) => (
                      <span key={z.id} className="muted small">
                        {z.flag} {DateTime.fromMillis(w.s).setZone(z.id).toFormat("h:mm a")}–
                        {DateTime.fromMillis(w.e).setZone(z.id).toFormat("h:mm a")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

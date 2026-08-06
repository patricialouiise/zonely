import type { Zone } from "../types";
import { instantFrom, viewInZone, dayDiffLabel } from "../lib/time";

interface Props {
  zones: Zone[];
  baseZoneId: string;
  date: string;
  time: string;
  onBaseZoneChange: (id: string) => void;
  onDateChange: (d: string) => void;
  onTimeChange: (t: string) => void;
}

/** "What time is it there?" — enter a moment in the base zone, see all zones. */
export default function Converter({
  zones,
  baseZoneId,
  date,
  time,
  onBaseZoneChange,
  onDateChange,
  onTimeChange,
}: Props) {
  const instant = instantFrom(date, time, baseZoneId);
  const valid = instant.isValid;

  return (
    <>
      <p className="muted">
        Pick a date &amp; time in one place, see it everywhere. Great for flights and meetings.
      </p>

      <div className="converter-controls">
        <label>
          <span>In this zone</span>
          <select value={baseZoneId} onChange={(e) => onBaseZoneChange(e.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.flag} {z.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
        </label>
        <label>
          <span>Time</span>
          <input type="time" value={time} onChange={(e) => onTimeChange(e.target.value)} />
        </label>
      </div>

      {!valid ? (
        <p className="error">Enter a valid date and time.</p>
      ) : (
        <div className="results">
          {zones.map((z) => {
            const v = viewInZone(instant, z.id, baseZoneId);
            const diff = dayDiffLabel(v.dayDiff);
            const isBase = z.id === baseZoneId;
            return (
              <div key={z.id} className={"result" + (isBase ? " result--base" : "")}>
                <div className="result__zone">
                  <span className="flag">{z.flag}</span> {z.label}
                </div>
                <div className="result__time">{v.time}</div>
                <div className="result__date">
                  {v.weekday}, {v.dateShort}
                  {diff && <span className={"daydiff " + (v.dayDiff > 0 ? "up" : "down")}>{diff}</span>}
                </div>
                <div className="result__offset">{v.offset}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

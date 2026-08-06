import type { WorkBand as WorkBandType, Zone } from "../types";
import { bandInZone, dayDiffLabel } from "../lib/time";

interface Props {
  zones: Zone[];
  band: WorkBandType;
  /** date to anchor the band on (from the day picker) */
  date: string;
  onChange: (band: WorkBandType) => void;
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

/** Shows where your working block lands in every zone, incl. day rollover. */
export default function WorkBand({ zones, band, date, onChange }: Props) {
  const bandZone = zones.find((z) => z.id === band.zoneId) ?? zones[0];

  function toggleDay(wd: number) {
    const days = band.days.includes(wd)
      ? band.days.filter((d) => d !== wd)
      : [...band.days, wd].sort((a, b) => a - b);
    onChange({ ...band, days });
  }

  return (
    <>
      <label className="switch switch--block">
        <input
          type="checkbox"
          checked={band.enabled}
          onChange={(e) => onChange({ ...band, enabled: e.target.checked })}
        />
        <span>Show work-hours band on the schedule</span>
      </label>

      <div className="workband-controls">
        <label>
          <span>Defined in</span>
          <select
            value={band.zoneId}
            onChange={(e) => onChange({ ...band, zoneId: e.target.value })}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.flag} {z.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Start</span>
          <input
            type="time"
            value={band.start}
            onChange={(e) => onChange({ ...band, start: e.target.value })}
          />
        </label>
        <label>
          <span>End</span>
          <input
            type="time"
            value={band.end}
            onChange={(e) => onChange({ ...band, end: e.target.value })}
          />
        </label>
      </div>

      <label className="workband-days">
        <span>Days</span>
        <div className="weekday-pick">
          {WEEKDAYS.map((d) => (
            <button
              type="button"
              key={d.wd}
              className={"wd" + (band.days.includes(d.wd) ? " wd--on" : "")}
              onClick={() => toggleDay(d.wd)}
              title={"Toggle " + d.label}
            >
              {d.label}
            </button>
          ))}
        </div>
      </label>

      {band.enabled && (
        <div className="results">
          {zones.map((z) => {
            const { start, end } = bandInZone(date, band.start, band.end, band.zoneId, z.id);
            const sDiff = dayDiffLabel(start.dayDiff);
            const eDiff = dayDiffLabel(end.dayDiff);
            const isBandZone = z.id === band.zoneId;
            return (
              <div key={z.id} className={"result" + (isBandZone ? " result--base" : "")}>
                <div className="result__zone">
                  <span className="flag">{z.flag}</span> {z.label}
                </div>
                <div className="result__time">
                  {start.time} <span className="arrow">→</span> {end.time}
                </div>
                <div className="result__date">
                  {sDiff && <span className="daydiff down">starts {sDiff}</span>}
                  {eDiff && <span className="daydiff up">ends {eDiff}</span>}
                  {!sDiff && !eDiff && <span className="muted">same day</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">
        Anchored to {bandZone.label} on the date selected in the day view.
      </p>
    </>
  );
}

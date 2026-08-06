import { useMemo } from "react";
import { DateTime } from "luxon";
import type { TripLeg } from "../types";
import { uid } from "../lib/time";
import { ZONE_OPTIONS, getAllZones } from "../lib/zones";

interface Props {
  trip: TripLeg[];
  defaultDate: string;
  defaultZoneId: string;
  onChange: (trip: TripLeg[]) => void;
}

/** Add/edit/remove trip legs (location + zone + date range). */
export default function TripEditor({ trip, defaultDate, defaultZoneId, onChange }: Props) {
  const others = useMemo(() => getAllZones(), []);

  function update(id: string, patch: Partial<TripLeg>) {
    onChange(trip.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }
  function remove(id: string) {
    onChange(trip.filter((l) => l.id !== id));
  }
  function add() {
    // Continue after the last leg so the new one appends sensibly at the bottom.
    const last = trip[trip.length - 1];
    let from = defaultDate;
    let to = defaultDate;
    if (last) {
      const end = DateTime.fromISO(last.to);
      from = end.plus({ days: 1 }).toFormat("yyyy-LL-dd");
      to = end.plus({ days: 7 }).toFormat("yyyy-LL-dd");
    }
    onChange([...trip, { id: uid(), from, to, location: "", zoneId: defaultZoneId }]);
  }

  return (
    <div className="trip-editor">
      <p className="muted small">
        Drives the “You're in …” label. Set where you are on each date range.
      </p>
      {trip.map((leg) => (
        <div key={leg.id} className="trip-leg">
          <div className="trip-leg__row">
            <input
              className="trip-leg__loc"
              value={leg.location}
              placeholder="Location name"
              onChange={(e) => update(leg.id, { location: e.target.value })}
            />
            <button
              className="chip__x"
              onClick={() => remove(leg.id)}
              title="Remove leg"
              aria-label="Remove leg"
            >
              ×
            </button>
          </div>
          <select value={leg.zoneId} onChange={(e) => update(leg.id, { zoneId: e.target.value })}>
            <optgroup label="Common">
              {ZONE_OPTIONS.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.flag} {z.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="All timezones">
              {others.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </optgroup>
          </select>
          <div className="trip-leg__dates">
            <input
              type="date"
              value={leg.from}
              onChange={(e) => update(leg.id, { from: e.target.value })}
            />
            <span className="arrow">→</span>
            <input
              type="date"
              value={leg.to}
              onChange={(e) => update(leg.id, { to: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button className="btn ghost" onClick={add}>
        + Add trip leg
      </button>
    </div>
  );
}

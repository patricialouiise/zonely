import { DateTime } from "luxon";
import type { Zone } from "../types";
import { offsetLabel } from "../lib/time";

interface Props {
  zones: Zone[];
  now: DateTime;
  baseZoneId: string;
  onSetBase: (id: string) => void;
}

/** Live current-time strip across all active zones. Click a card to set base. */
export default function ZoneBar({ zones, now, baseZoneId, onSetBase }: Props) {
  return (
    <div className="zonebar">
      {zones.map((z) => {
        const dt = now.setZone(z.id);
        const isBase = z.id === baseZoneId;
        return (
          <button
            key={z.id}
            type="button"
            className={"zonecard" + (isBase ? " zonecard--base" : "")}
            onClick={() => onSetBase(z.id)}
            aria-pressed={isBase}
            title={isBase ? "This is your base zone" : `Set ${z.label} as base zone`}
          >
            <div className="zonecard__label">
              <span className="flag">{z.flag}</span> {z.label}
              {isBase && <span className="pill">base</span>}
            </div>
            <div className="zonecard__time">
              {dt.toFormat("h:mm")}
              <span className="ampm">{dt.toFormat("a")}</span>
            </div>
            <div className="zonecard__date">{dt.toFormat("cccc, LLL d")}</div>
            <div className="zonecard__offset">{offsetLabel(z.id, now)}</div>
          </button>
        );
      })}
    </div>
  );
}

import { DateTime } from "luxon";
import type { CalEvent, Zone } from "../types";
import { eventStart, startOfWeekSun } from "../lib/time";
import { expandEvents, type Occurrence } from "../lib/recurrence";
import { eventFill } from "../lib/colors";

interface Props {
  zones: Zone[];
  baseZoneId: string;
  date: string;
  events: CalEvent[];
  now: DateTime;
  onEditEvent: (occ: Occurrence) => void;
  onOpenDay: (iso: string) => void;
  onDateChange: (iso: string) => void;
  onBaseZoneChange: (id: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

/** Month overview: colored event chips per day; click a day to open it. */
export default function MonthView({
  zones,
  baseZoneId,
  date,
  events,
  now,
  onEditEvent,
  onOpenDay,
  onDateChange,
  onBaseZoneChange,
}: Props) {
  const anchor = DateTime.fromISO(date, { zone: baseZoneId });
  const gridStart = startOfWeekSun(anchor.startOf("month")); // Sunday on/before the 1st
  const lastWeekStart = startOfWeekSun(anchor.endOf("month")); // Sunday of the last week
  const weeks = Math.round(lastWeekStart.diff(gridStart, "weeks").weeks) + 1;
  const totalDays = weeks * 7; // always whole weeks
  const days = Array.from({ length: totalDays }, (_, i) => gridStart.plus({ days: i }));
  const gridEndExclusive = gridStart.plus({ days: totalDays });
  const todayISO = now.setZone(baseZoneId).toFormat("yyyy-LL-dd");
  const baseZone = zones.find((z) => z.id === baseZoneId);

  // Expand occurrences across the whole visible grid, bucketed by base-zone day.
  const byDay = new Map<string, Occurrence[]>();
  for (const occ of expandEvents(events, gridStart.toMillis(), gridEndExclusive.toMillis())) {
    const iso = eventStart(occ.event).setZone(baseZoneId).toFormat("yyyy-LL-dd");
    let list = byDay.get(iso);
    if (!list) {
      list = [];
      byDay.set(iso, list);
    }
    list.push(occ);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => eventStart(a.event).toMillis() - eventStart(b.event).toMillis());
  }

  function shiftMonth(delta: number) {
    onDateChange(anchor.plus({ months: delta }).toFormat("yyyy-LL-dd"));
  }

  return (
    <div className="monthview">
      <div className="weekview__nav">
        <button className="btn tiny ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="weekview__range">{anchor.toFormat("LLLL yyyy")}</span>
        <button className="btn tiny ghost" onClick={() => shiftMonth(1)} aria-label="Next month">
          ›
        </button>
        <button className="btn tiny" onClick={() => onDateChange(todayISO)}>
          Today
        </button>
        <label className="weekview__zone">
          <span className="muted small">shown in</span>
          <select value={baseZoneId} onChange={(e) => onBaseZoneChange(e.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.flag} {z.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="monthgrid monthgrid--head">
        {WEEKDAYS.map((w) => (
          <div key={w} className="monthdow">
            {w}
          </div>
        ))}
      </div>

      <div className="monthgrid">
        {days.map((d) => {
          const iso = d.toFormat("yyyy-LL-dd");
          const inMonth = d.month === anchor.month;
          const isToday = iso === todayISO;
          const list = byDay.get(iso) ?? [];
          const shown = list.slice(0, MAX_CHIPS);
          const extra = list.length - shown.length;
          return (
            <div
              key={iso}
              className={"monthcell" + (inMonth ? "" : " monthcell--out")}
              onClick={() => onOpenDay(iso)}
              title={`Open ${d.toFormat("cccc, LLL d")}`}
            >
              <div className={"monthcell__num" + (isToday ? " today" : "")}>{d.day}</div>
              <div className="monthcell__events">
                {shown.map((occ) => {
                  const t = eventStart(occ.event).setZone(baseZoneId).toFormat("h:mm a");
                  return (
                    <button
                      key={occ.key}
                      className="monthchip"
                      style={{ background: eventFill(occ.event.color, occ.event.opacity) }}
                      title={`${t} — ${occ.event.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(occ);
                      }}
                    >
                      {occ.isRecurring && <span className="recur">↻</span>}
                      <span className="monthchip__title">{occ.event.title}</span>
                    </button>
                  );
                })}
                {extra > 0 && <div className="monthmore">+{extra} more</div>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small">Times bucketed by {baseZone?.label}. Click a day to open it.</p>
    </div>
  );
}

import { DateTime } from "luxon";
import type { CalEvent, WorkBand, Zone } from "../types";
import { eventStart, eventEnd, bandSegmentsInWindow, startOfWeekSun } from "../lib/time";
import { expandEvents, type Occurrence } from "../lib/recurrence";
import { useBlockDrag, type MoveDelta } from "../lib/useBlockDrag";
import { useCreateDrag } from "../lib/useCreateDrag";
import { packOverlaps, placementCss } from "../lib/overlap";
import EventBlock, { blockGeometry } from "./EventBlock";
import type { CreateAt } from "./DayView";

interface Props {
  zones: Zone[];
  baseZoneId: string;
  date: string;
  events: CalEvent[];
  now: DateTime;
  workBand: WorkBand;
  onEditEvent: (occ: Occurrence) => void;
  onMoveEvent: (occ: Occurrence, delta: MoveDelta) => void;
  onCreateAt: (at: CreateAt) => void;
  onDateChange: (iso: string) => void;
  onOpenDay: (iso: string) => void;
  onBaseZoneChange: (id: string) => void;
}

const HOUR_H = 44;
const TOTAL_H = HOUR_H * 24;

/** 7-day calendar grid, laid out in the base zone. Columns = days, rows = hours. */
export default function WeekView({
  zones,
  baseZoneId,
  date,
  events,
  now,
  workBand,
  onEditEvent,
  onMoveEvent,
  onCreateAt,
  onDateChange,
  onOpenDay,
  onBaseZoneChange,
}: Props) {
  const { drag, startDrag } = useBlockDrag(HOUR_H);
  const { sel, begin } = useCreateDrag(HOUR_H);
  const anchor = DateTime.fromISO(date, { zone: baseZoneId });
  const weekStart = startOfWeekSun(anchor); // Sunday
  const days = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  const todayISO = now.setZone(baseZoneId).toFormat("yyyy-LL-dd");
  const weekOccs = expandEvents(
    events,
    weekStart.toMillis(),
    weekStart.plus({ days: 7 }).toMillis()
  );

  function shiftWeek(deltaWeeks: number) {
    onDateChange(anchor.plus({ weeks: deltaWeeks }).toFormat("yyyy-LL-dd"));
  }

  const rangeLabel =
    weekStart.toFormat("LLL d") +
    " – " +
    weekStart.plus({ days: 6 }).toFormat(
      weekStart.month === weekStart.plus({ days: 6 }).month ? "d, yyyy" : "LLL d, yyyy"
    );

  return (
    <div className="weekview">
      <div className="weekview__nav">
        <button className="btn tiny ghost" onClick={() => shiftWeek(-1)} aria-label="Previous week">
          ‹
        </button>
        <span className="weekview__range">{rangeLabel}</span>
        <button className="btn tiny ghost" onClick={() => shiftWeek(1)} aria-label="Next week">
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

      <div className="weekview__scroll">
        <div className="weekview__inner">
          {/* Sticky day headers */}
          <div className="weekview__head">
            <div className="weekview__corner" />
            {days.map((d) => {
              const iso = d.toFormat("yyyy-LL-dd");
              const isToday = iso === todayISO;
              const isSelected = iso === date;
              return (
                <button
                  key={iso}
                  className={
                    "dayhead" + (isToday ? " dayhead--today" : "") + (isSelected ? " dayhead--sel" : "")
                  }
                  onClick={() => onOpenDay(iso)}
                  title="Open this day"
                >
                  <span className="dayhead__dow">{d.toFormat("ccc")}</span>
                  <span className="dayhead__num">{d.toFormat("d")}</span>
                </button>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="weekview__grid" style={{ height: TOTAL_H }}>
            <div className="weekview__gutter" style={{ height: TOTAL_H }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="hourline" style={{ top: h * HOUR_H }}>
                  <span className="hourlabel">
                    {weekStart.set({ hour: h }).toFormat("h a")}
                  </span>
                </div>
              ))}
            </div>

            {days.map((d) => {
              const dayStart = d.startOf("day");
              const dayEnd = dayStart.plus({ days: 1 });
              const dayStartMs = dayStart.toMillis();
              const bands = bandSegmentsInWindow(
                dayStart,
                dayEnd,
                workBand.zoneId,
                workBand.start,
                workBand.end,
                workBand.days
              );
              const dayOccs = weekOccs.filter((occ) => {
                const s = eventStart(occ.event).toMillis();
                const e = eventEnd(occ.event).toMillis();
                return e > dayStartMs && s < dayEnd.toMillis();
              });
              const dayStartMap = new Map(
                dayOccs.map((o) => [o.key, eventStart(o.event).toMillis()])
              );
              const dayEndMap = new Map(
                dayOccs.map((o) => [o.key, eventEnd(o.event).toMillis()])
              );
              const placements = packOverlaps(
                dayOccs,
                (o) => dayStartMap.get(o.key)!,
                (o) => dayEndMap.get(o.key)!
              );
              const showNow = now >= dayStart && now < dayEnd;
              const nowTop = showNow
                ? (now.diff(dayStart, "minutes").minutes / 60) * HOUR_H
                : 0;

              const dayISO = d.toFormat("yyyy-LL-dd");
              return (
                <div
                  key={d.toISO()}
                  className="weekview__day"
                  style={{ height: TOTAL_H }}
                  onPointerDown={(e) =>
                    begin(e, dayISO, (startMin, dur) => {
                      const local = dayStart.plus({ minutes: startMin });
                      onCreateAt({
                        date: dayISO,
                        time: local.toFormat("HH:mm"),
                        durationMin: dur,
                        zoneId: baseZoneId,
                      });
                    })
                  }
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="hourline" style={{ top: h * HOUR_H }} />
                  ))}

                  {workBand.enabled &&
                    bands.map((b, i) => (
                      <div
                        key={i}
                        className="bandshade"
                        style={{ top: (b.topMin / 60) * HOUR_H, height: (b.heightMin / 60) * HOUR_H }}
                        title="Work hours"
                      />
                    ))}

                  {dayOccs.map((occ) => {
                    const ev = occ.event;
                    const s = eventStart(ev).setZone(baseZoneId);
                    const eEnd = eventEnd(ev).setZone(baseZoneId);
                    const geo = blockGeometry(
                      eventStart(ev).toMillis(),
                      eventEnd(ev).toMillis(),
                      dayStart.toMillis(),
                      HOUR_H
                    );
                    const isDragging = drag?.id === ev.id;
                    const label = s.toFormat("h:mm a");
                    const place = placementCss(placements.get(occ)!);
                    return (
                      <EventBlock
                        key={occ.key}
                        occ={occ}
                        week
                        top={geo.top}
                        height={geo.height}
                        left={place.left}
                        width={place.width}
                        dragging={isDragging}
                        transform={
                          isDragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined
                        }
                        timeLabel={label}
                        endLabel={eEnd.toFormat("h:mm a")}
                        titleAttr={`${ev.title} · ${label} — drag to reschedule`}
                        onPointerDown={(e) => {
                          const col = (e.currentTarget as HTMLElement).closest(
                            ".weekview__day"
                          ) as HTMLElement | null;
                          const colWidth = col?.getBoundingClientRect().width ?? 0;
                          startDrag(e, ev, {
                            colWidth,
                            onClick: () => onEditEvent(occ),
                            onCommit: (delta) => onMoveEvent(occ, delta),
                          });
                        }}
                      />
                    );
                  })}

                  {showNow && <div className="nowline" style={{ top: nowTop }} />}

                  {sel?.colKey === dayISO && (
                    <div className="createsel" style={{ top: sel.top, height: sel.height }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

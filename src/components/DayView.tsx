import { DateTime } from "luxon";
import type { CalEvent, WorkBand, Zone } from "../types";
import { eventStart, eventEnd, bandSegmentsInWindow } from "../lib/time";
import { expandEvents, type Occurrence } from "../lib/recurrence";
import { useBlockDrag, type MoveDelta } from "../lib/useBlockDrag";
import { useCreateDrag } from "../lib/useCreateDrag";
import { packOverlaps, placementCss } from "../lib/overlap";
import EventBlock, { blockGeometry } from "./EventBlock";

export interface CreateAt {
  date: string;
  time: string;
  durationMin: number;
  zoneId: string;
}

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
}

const HOUR_H = 48; // px per hour
const TOTAL_H = HOUR_H * 24;

function minutesFromWindow(instant: DateTime, windowStart: DateTime): number {
  return instant.diff(windowStart, "minutes").minutes;
}

/** Calendar-style day grid: one column per zone, sharing one absolute timeline. */
export default function DayView({
  zones,
  baseZoneId,
  date,
  events,
  now,
  workBand,
  onEditEvent,
  onMoveEvent,
  onCreateAt,
}: Props) {
  const { drag, startDrag } = useBlockDrag(HOUR_H);
  const { sel, begin } = useCreateDrag(HOUR_H);
  const windowStart = DateTime.fromISO(date, { zone: baseZoneId }).startOf("day");
  const windowEnd = windowStart.plus({ days: 1 });

  const occs = expandEvents(events, windowStart.toMillis(), windowEnd.toMillis());
  // Overlap layout (absolute times → same across every zone column).
  const occStart = new Map(occs.map((o) => [o.key, eventStart(o.event).toMillis()]));
  const occEnd = new Map(occs.map((o) => [o.key, eventEnd(o.event).toMillis()]));
  const placements = packOverlaps(
    occs,
    (o) => occStart.get(o.key)!,
    (o) => occEnd.get(o.key)!
  );

  // Work-band segments overlapping this base-zone day (handles a band defined
  // in another zone that wraps across the day boundary → two pieces).
  const bandSegs = workBand.enabled
    ? bandSegmentsInWindow(
        windowStart,
        windowEnd,
        workBand.zoneId,
        workBand.start,
        workBand.end,
        workBand.days
      )
    : [];

  const showNow = now >= windowStart && now < windowEnd;
  const nowTop = showNow ? (minutesFromWindow(now, windowStart) / 60) * HOUR_H : 0;

  const cols = `62px repeat(${zones.length}, minmax(120px, 1fr))`;
  const baseZone = zones.find((z) => z.id === baseZoneId);

  return (
    <div className="dayview">
      <div className="dayview__scroll">
        <div className="dayview__inner">
          <div className="dayview__head" style={{ gridTemplateColumns: cols }}>
            <div className="dayview__corner" title={baseZone ? `Ruler shows ${baseZone.label} time` : undefined}>
              {baseZone?.flag}
            </div>
            {zones.map((z) => {
              const zStartISO = windowStart.setZone(z.id).toFormat("yyyy-LL-dd");
              const baseISO = windowStart.toFormat("yyyy-LL-dd");
              const behind = zStartISO < baseISO;
              const showDate = zStartISO !== baseISO;
              return (
                <div
                  key={z.id}
                  className={"dayview__colhead" + (z.id === baseZoneId ? " is-base" : "")}
                >
                  <span className="flag">{z.flag}</span>
                  <span className="dayview__colname">{z.label}</span>
                  {z.id === baseZoneId && <span className="pill">base</span>}
                  {showDate && (
                    <span
                      className={"daydiff " + (behind ? "down" : "up")}
                      title="This column starts on this date"
                    >
                      {windowStart.setZone(z.id).toFormat("LLL d")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="dayview__grid" style={{ height: TOTAL_H, gridTemplateColumns: cols }}>
          {/* left gutter: base-zone hours */}
          <div className="dayview__gutter" style={{ height: TOTAL_H }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="hourline" style={{ top: h * HOUR_H }}>
                <span className="hourlabel">
                  {windowStart.plus({ hours: h }).toFormat("h a")}
                </span>
              </div>
            ))}
          </div>

          {/* one track per zone */}
          {zones.map((z) => (
            <div
              key={z.id}
              className="dayview__col"
              style={{ height: TOTAL_H }}
              onPointerDown={(e) =>
                begin(e, z.id, (startMin, dur) => {
                  const local = windowStart.plus({ minutes: startMin }).setZone(z.id);
                  onCreateAt({
                    date: local.toFormat("yyyy-LL-dd"),
                    time: local.toFormat("HH:mm"),
                    durationMin: dur,
                    zoneId: z.id,
                  });
                })
              }
            >
              {Array.from({ length: 24 }, (_, h) => {
                const local = windowStart.plus({ hours: h }).setZone(z.id);
                return (
                  <div key={h} className="hourline" style={{ top: h * HOUR_H }}>
                    <span className="hourlabel faint">{local.toFormat("h a")}</span>
                  </div>
                );
              })}

              {/* divider where this zone's local date rolls over (its midnight) */}
              {(() => {
                const midnight = windowStart.setZone(z.id).startOf("day").plus({ days: 1 });
                const mins = midnight.diff(windowStart, "minutes").minutes;
                if (mins <= 0 || mins >= 1440) return null;
                return (
                  <div className="dateline" style={{ top: (mins / 60) * HOUR_H }}>
                    <span className="dateline__label">{midnight.toFormat("ccc, LLL d")}</span>
                  </div>
                );
              })()}

              {bandSegs.map((b, i) => (
                <div
                  key={i}
                  className="bandshade"
                  style={{ top: (b.topMin / 60) * HOUR_H, height: (b.heightMin / 60) * HOUR_H }}
                  title="Work hours"
                />
              ))}

              {occs.map((occ) => {
                const ev = occ.event;
                const s = eventStart(ev);
                const e = eventEnd(ev);
                const geo = blockGeometry(
                  s.toMillis(),
                  e.toMillis(),
                  windowStart.toMillis(),
                  HOUR_H
                );
                const isDragging = drag?.id === ev.id;
                const place = placementCss(placements.get(occ)!);
                return (
                  <EventBlock
                    key={occ.key}
                    occ={occ}
                    top={geo.top}
                    height={geo.height}
                    left={place.left}
                    width={place.width}
                    dragging={isDragging}
                    transform={isDragging ? `translateY(${drag.dy}px)` : undefined}
                    timeLabel={s.setZone(z.id).toFormat("h:mm a")}
                    endLabel={e.setZone(z.id).toFormat("h:mm a")}
                    titleAttr={`${ev.title} — drag to reschedule`}
                    onPointerDown={(e) =>
                      startDrag(e, ev, {
                        onClick: () => onEditEvent(occ),
                        onCommit: (delta) => onMoveEvent(occ, delta),
                      })
                    }
                  />
                );
              })}

              {showNow && <div className="nowline" style={{ top: nowTop }} />}

              {sel?.colKey === z.id && (
                <div className="createsel" style={{ top: sel.top, height: sel.height }} />
              )}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}

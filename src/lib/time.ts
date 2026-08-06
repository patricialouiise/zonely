import { DateTime } from "luxon";
import type { CalEvent } from "../types";

/**
 * Build an absolute instant (DateTime, UTC-anchored) from a wall-clock
 * date + time interpreted in a given IANA zone.
 */
export function instantFrom(date: string, time: string, zoneId: string): DateTime {
  return DateTime.fromISO(`${date}T${time}`, { zone: zoneId });
}

export function eventStart(ev: CalEvent): DateTime {
  return instantFrom(ev.date, ev.time, ev.zoneId);
}

export function eventEnd(ev: CalEvent): DateTime {
  return eventStart(ev).plus({ minutes: ev.durationMin });
}

/** Current offset label for a zone, e.g. "UTC+8" or "UTC-7". */
export function offsetLabel(zoneId: string, at?: DateTime): string {
  const dt = (at ?? DateTime.now()).setZone(zoneId);
  const mins = dt.offset; // minutes
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

export interface ZonedView {
  time: string; // "1:00 PM"
  weekday: string; // "Fri"
  dateShort: string; // "Aug 21"
  fullDate: string; // "Fri, Aug 21, 2026"
  offset: string; // "UTC+8"
  /** day difference vs a reference instant's date in the base zone */
  dayDiff: number;
  dt: DateTime;
}

/**
 * Render an instant in a target zone, and compute the calendar-day difference
 * relative to how the same instant reads in `baseZoneId`.
 */
export function viewInZone(
  instant: DateTime,
  targetZoneId: string,
  baseZoneId: string
): ZonedView {
  const dt = instant.setZone(targetZoneId);
  const base = instant.setZone(baseZoneId);
  // Compare calendar dates only: re-anchor each local midnight to UTC so the
  // zone offsets cancel and we get a clean integer day difference.
  const targetDay = dt.startOf("day").setZone("utc", { keepLocalTime: true });
  const baseDay = base.startOf("day").setZone("utc", { keepLocalTime: true });
  const dayDiff = targetDay.diff(baseDay, "days").days;
  return {
    time: dt.toFormat("h:mm a"),
    weekday: dt.toFormat("ccc"),
    dateShort: dt.toFormat("LLL d"),
    fullDate: dt.toFormat("ccc, LLL d, yyyy"),
    offset: offsetLabel(targetZoneId, instant),
    dayDiff: Math.round(dayDiff),
    dt,
  };
}

/** Human label for a day difference, e.g. "next day", "prev day", "+2 days". */
export function dayDiffLabel(diff: number): string | null {
  if (diff === 0) return null;
  if (diff === 1) return "next day";
  if (diff === -1) return "prev day";
  if (diff > 0) return `+${diff} days`;
  return `${diff} days`;
}

/**
 * Map a work band (defined by start/end wall-clock in `bandZoneId` on a given
 * date) into another zone, returning start/end views. `end` before `start`
 * (e.g. 22:00 -> 06:00) is treated as crossing midnight.
 */
export function bandInZone(
  date: string,
  start: string,
  end: string,
  bandZoneId: string,
  targetZoneId: string
) {
  const startInstant = instantFrom(date, start, bandZoneId);
  let endInstant = instantFrom(date, end, bandZoneId);
  if (endInstant <= startInstant) endInstant = endInstant.plus({ days: 1 });
  return {
    start: viewInZone(startInstant, targetZoneId, bandZoneId),
    end: viewInZone(endInstant, targetZoneId, bandZoneId),
    startInstant,
    endInstant,
  };
}

/**
 * All occurrences of a daily work band [start,end] (defined in bandZoneId)
 * that overlap the absolute window [windowStart, windowEnd), expressed as
 * offsets in minutes from windowStart. Handles overnight bands and date-line
 * spillover, so it works when the window's zone differs from the band's zone.
 */
export function bandSegmentsInWindow(
  windowStart: DateTime,
  windowEnd: DateTime,
  bandZoneId: string,
  start: string,
  end: string,
  days?: number[]
): { topMin: number; heightMin: number }[] {
  const segs: { topMin: number; heightMin: number }[] = [];
  const ws = windowStart.toMillis();
  const we = windowEnd.toMillis();
  // Walk band-zone calendar dates from one day before the window to one after,
  // so overnight occurrences that start the previous day are included.
  let cursor = windowStart.setZone(bandZoneId).startOf("day").minus({ days: 1 });
  const limit = windowEnd.setZone(bandZoneId).startOf("day").plus({ days: 1 });
  while (cursor <= limit) {
    // Only shade days-of-week the band applies to (band-zone weekday).
    if (days && !days.includes(cursor.weekday)) {
      cursor = cursor.plus({ days: 1 });
      continue;
    }
    const dISO = cursor.toFormat("yyyy-LL-dd");
    const bs = instantFrom(dISO, start, bandZoneId);
    let be = instantFrom(dISO, end, bandZoneId);
    if (be <= bs) be = be.plus({ days: 1 });
    const s = Math.max(bs.toMillis(), ws);
    const e = Math.min(be.toMillis(), we);
    if (e > s) {
      segs.push({ topMin: (s - ws) / 60000, heightMin: (e - s) / 60000 });
    }
    cursor = cursor.plus({ days: 1 });
  }
  return segs;
}

/** Start of the week containing `dt`, Sunday-based (weekday 7 = Sunday). */
export function startOfWeekSun(dt: DateTime): DateTime {
  return dt.startOf("day").minus({ days: dt.weekday % 7 });
}

/** Today's ISO date (YYYY-MM-DD) in a given zone. */
export function todayInZone(zoneId: string): string {
  return DateTime.now().setZone(zoneId).toFormat("yyyy-LL-dd");
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Compact duration label, e.g. "4h 30m", "45m", "2h". */
export function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

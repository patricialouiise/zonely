import { DateTime } from "luxon";
import type { Zone } from "../types";
import { bandSegmentsInWindow } from "./time";

export interface TimeWindow {
  /** absolute start/end in epoch ms */
  s: number;
  e: number;
}

function intersectTwo(a: TimeWindow[], b: TimeWindow[]): TimeWindow[] {
  const out: TimeWindow[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].s, b[j].s);
    const e = Math.min(a[i].e, b[j].e);
    if (e > s) out.push({ s, e });
    if (a[i].e < b[j].e) i++;
    else j++;
  }
  return out;
}

/**
 * Windows on the base-zone day `dateISO` where the local time is within
 * [winStart, winEnd] in EVERY zone at once, at least `minDurationMin` long.
 * Each zone's daily availability is computed via bandSegmentsInWindow (which
 * handles the date-line), then all zones are intersected.
 */
export function commonWindows(
  zones: Zone[],
  dateISO: string,
  baseZoneId: string,
  winStart: string,
  winEnd: string,
  minDurationMin: number
): TimeWindow[] {
  if (!zones.length) return [];
  const windowStart = DateTime.fromISO(dateISO, { zone: baseZoneId }).startOf("day");
  const windowEnd = windowStart.plus({ days: 1 });
  if (!windowStart.isValid) return [];
  const ws = windowStart.toMillis();

  let running: TimeWindow[] = [{ s: ws, e: windowEnd.toMillis() }];
  for (const z of zones) {
    const segs = bandSegmentsInWindow(windowStart, windowEnd, z.id, winStart, winEnd).map(
      (sg) => ({ s: ws + sg.topMin * 60000, e: ws + (sg.topMin + sg.heightMin) * 60000 })
    );
    running = intersectTwo(running, segs);
    if (!running.length) break;
  }
  return running.filter((iv) => iv.e - iv.s >= minDurationMin * 60000);
}

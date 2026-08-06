import { DateTime, IANAZone } from "luxon";
import type { AppSettings, CalEvent, Recurrence, TripLeg, WorkBand, Zone } from "../types";

/**
 * Coerce untrusted data (imported backups, or corrupted localStorage) into
 * well-formed shapes. Anything unrecoverable is dropped rather than allowed to
 * crash the render (e.g. a non-iterable `exdates` would throw in `new Set(...)`).
 */

const isStr = (v: unknown): v is string => typeof v === "string";
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const validTime = (v: unknown): v is string => {
  if (!isStr(v) || !/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
};
const validDate = (v: unknown): v is string =>
  isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).isValid;
const validZone = (v: unknown): v is string => isStr(v) && IANAZone.isValidZone(v);

function sanitizeRecurrence(r: unknown): Recurrence | undefined {
  if (!isObj(r)) return undefined;
  const freq = r.freq === "daily" || r.freq === "weekly" ? r.freq : null;
  if (!freq) return undefined;
  const interval =
    typeof r.interval === "number" && Number.isFinite(r.interval) && r.interval >= 1
      ? Math.floor(r.interval)
      : 1;
  let byWeekday: number[] | undefined;
  if (Array.isArray(r.byWeekday)) {
    const days = r.byWeekday.filter(
      (n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 7
    );
    if (days.length) byWeekday = days;
  }
  const until = validDate(r.until) ? r.until : undefined;
  return { freq, interval, byWeekday, until };
}

/** Validate one event; returns null if it's missing required, usable fields. */
export function sanitizeEvent(raw: unknown): CalEvent | null {
  if (!isObj(raw)) return null;
  if (!isStr(raw.id) || !raw.id) return null;
  if (!validDate(raw.date)) return null;
  if (!validTime(raw.time)) return null;
  if (!validZone(raw.zoneId)) return null;

  const ev: CalEvent = {
    id: raw.id,
    title: isStr(raw.title) ? raw.title : "",
    date: raw.date,
    time: raw.time,
    durationMin:
      typeof raw.durationMin === "number" && Number.isFinite(raw.durationMin) && raw.durationMin > 0
        ? Math.round(raw.durationMin)
        : 60,
    zoneId: raw.zoneId,
  };
  if (isStr(raw.note)) ev.note = raw.note;
  if (isStr(raw.color)) ev.color = raw.color;
  if (typeof raw.opacity === "number" && Number.isFinite(raw.opacity)) {
    ev.opacity = Math.min(1, Math.max(0, raw.opacity));
  }
  const rec = sanitizeRecurrence(raw.recurrence);
  if (rec) ev.recurrence = rec;
  if (Array.isArray(raw.exdates)) {
    const ex = raw.exdates.filter(validDate);
    if (ex.length) ev.exdates = ex;
  }
  if (isStr(raw.seriesId)) ev.seriesId = raw.seriesId;
  if (validDate(raw.recurDate)) ev.recurDate = raw.recurDate;
  return ev;
}

export function sanitizeEvents(raw: unknown): CalEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeEvent).filter((e): e is CalEvent => e !== null);
}

function sanitizeZone(z: unknown): Zone | null {
  if (!isObj(z) || !validZone(z.id)) return null;
  const label = isStr(z.label) && z.label ? z.label : (z.id.split("/").pop() ?? z.id).replace(/_/g, " ");
  return { id: z.id, label, flag: isStr(z.flag) ? z.flag : undefined };
}

function sanitizeWorkBand(w: unknown, fallback: WorkBand): WorkBand {
  if (!isObj(w)) return fallback;
  const days = Array.isArray(w.days)
    ? w.days.filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 7)
    : fallback.days;
  return {
    enabled: typeof w.enabled === "boolean" ? w.enabled : fallback.enabled,
    zoneId: validZone(w.zoneId) ? w.zoneId : fallback.zoneId,
    start: validTime(w.start) ? w.start : fallback.start,
    end: validTime(w.end) ? w.end : fallback.end,
    days,
  };
}

function sanitizeTrip(raw: unknown): TripLeg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l): TripLeg | null => {
      if (!isObj(l) || !isStr(l.id) || !validZone(l.zoneId) || !validDate(l.from) || !validDate(l.to)) {
        return null;
      }
      return { id: l.id, from: l.from, to: l.to, location: isStr(l.location) ? l.location : "", zoneId: l.zoneId };
    })
    .filter((l): l is TripLeg => l !== null);
}

export function sanitizeSettings(raw: unknown, fallback: AppSettings): AppSettings {
  if (!isObj(raw)) return fallback;
  const zones = Array.isArray(raw.zones)
    ? (raw.zones.map(sanitizeZone).filter(Boolean) as Zone[])
    : [];
  const finalZones = zones.length ? zones : fallback.zones;
  const baseZoneId =
    validZone(raw.baseZoneId) && finalZones.some((z) => z.id === raw.baseZoneId)
      ? (raw.baseZoneId as string)
      : finalZones[0].id;
  return {
    zones: finalZones,
    baseZoneId,
    workBand: sanitizeWorkBand(raw.workBand, fallback.workBand),
    trip: sanitizeTrip(raw.trip),
  };
}

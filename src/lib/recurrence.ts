import { DateTime } from "luxon";
import type { CalEvent, EditScope, EventDraft, Recurrence } from "../types";
import { instantFrom, uid } from "./time";

/** A concrete, renderable instance of an event (a single event, a series
 *  occurrence, or an override that replaces one occurrence). */
export interface Occurrence {
  key: string;
  event: CalEvent; // concrete event (virtual for generated occurrences)
  isRecurring: boolean;
  seriesId?: string; // the master id, when part of a series
  recurDate?: string; // the original occurrence date within the series
}

function isMaster(e: CalEvent): boolean {
  return !!e.recurrence;
}
function isOverride(e: CalEvent): boolean {
  return !!e.seriesId && !!e.recurDate && !e.recurrence;
}
function isSingle(e: CalEvent): boolean {
  return !e.recurrence && !e.seriesId;
}

function daysBetween(from: DateTime, to: DateTime): number {
  return Math.round(to.startOf("day").diff(from.startOf("day"), "days").days);
}

/** Does date D (event-zone DateTime) fall on the series defined by rec from startD? */
function matchesRule(rec: Recurrence, startD: DateTime, d: DateTime): boolean {
  if (d < startD.startOf("day")) return false;
  if (rec.freq === "daily") {
    return daysBetween(startD, d) % Math.max(1, rec.interval) === 0;
  }
  // weekly
  const days = rec.byWeekday && rec.byWeekday.length ? rec.byWeekday : [startD.weekday];
  if (!days.includes(d.weekday)) return false;
  const weeks = Math.round(
    d.startOf("week").diff(startD.startOf("week"), "weeks").weeks
  );
  return weeks % Math.max(1, rec.interval) === 0;
}

function overlaps(ev: CalEvent, winStartMs: number, winEndMs: number): boolean {
  const s = instantFrom(ev.date, ev.time, ev.zoneId);
  const e = s.plus({ minutes: ev.durationMin });
  return e.toMillis() > winStartMs && s.toMillis() < winEndMs;
}

/**
 * Expand all events into concrete occurrences overlapping [winStartMs, winEndMs).
 * Singles and overrides render as themselves; masters generate occurrences,
 * skipping exdates and dates that have an override.
 */
export function expandEvents(
  events: CalEvent[],
  winStartMs: number,
  winEndMs: number
): Occurrence[] {
  const out: Occurrence[] = [];
  const overrides = events.filter(isOverride);
  const overrideKeys = new Set(overrides.map((o) => `${o.seriesId}|${o.recurDate}`));

  for (const ev of events) {
    if (isSingle(ev)) {
      if (overlaps(ev, winStartMs, winEndMs)) {
        out.push({ key: ev.id, event: ev, isRecurring: false });
      }
      continue;
    }
    if (isOverride(ev)) {
      if (overlaps(ev, winStartMs, winEndMs)) {
        out.push({
          key: ev.id,
          event: ev,
          isRecurring: true,
          seriesId: ev.seriesId,
          recurDate: ev.recurDate,
        });
      }
      continue;
    }
    if (isMaster(ev)) {
      const rec = ev.recurrence!;
      const exdates = new Set(ev.exdates ?? []);
      const startD = DateTime.fromISO(ev.date, { zone: ev.zoneId }).startOf("day");
      const untilD = rec.until
        ? DateTime.fromISO(rec.until, { zone: ev.zoneId }).startOf("day")
        : null;
      // Fast-forward to just before the window (rule membership is anchored to
      // startD, so jumping the cursor doesn't change phase).
      const winStartDate = DateTime.fromMillis(winStartMs)
        .setZone(ev.zoneId)
        .startOf("day")
        .minus({ days: 1 });
      let cur = startD > winStartDate ? startD : winStartDate;
      let guard = 0;
      while (guard++ < 800) {
        if (untilD && cur > untilD) break;
        const dISO = cur.toFormat("yyyy-LL-dd");
        const s = instantFrom(dISO, ev.time, ev.zoneId);
        if (s.toMillis() >= winEndMs) break; // past the window (dates increase)
        if (
          matchesRule(rec, startD, cur) &&
          !exdates.has(dISO) &&
          !overrideKeys.has(`${ev.id}|${dISO}`)
        ) {
          const e = s.plus({ minutes: ev.durationMin });
          if (e.toMillis() > winStartMs) {
            const virt: CalEvent = {
              ...ev,
              id: `${ev.id}::${dISO}`,
              date: dISO,
              recurrence: undefined,
              exdates: undefined,
            };
            out.push({
              key: virt.id,
              event: virt,
              isRecurring: true,
              seriesId: ev.id,
              recurDate: dISO,
            });
          }
        }
        cur = cur.plus({ days: 1 });
      }
    }
  }
  return out;
}

function findMaster(events: CalEvent[], seriesId?: string): CalEvent | undefined {
  return events.find((e) => e.id === seriesId);
}

function shiftFields(ev: CalEvent, delta: { days: number; minutes: number }, baseZoneId: string) {
  const moved = instantFrom(ev.date, ev.time, ev.zoneId)
    .setZone(baseZoneId)
    .plus(delta)
    .setZone(ev.zoneId);
  return { date: moved.toFormat("yyyy-LL-dd"), time: moved.toFormat("HH:mm") };
}

function dayBefore(iso: string): string {
  return DateTime.fromISO(iso).minus({ days: 1 }).toFormat("yyyy-LL-dd");
}

/** Shift a Luxon weekday (1..7) by N days, wrapping. */
function shiftWeekday(wd: number, days: number): number {
  return (((wd - 1 + days) % 7) + 7) % 7 + 1;
}

function addDaysISO(iso: string, days: number): string {
  return DateTime.fromISO(iso).plus({ days }).toFormat("yyyy-LL-dd");
}

/** When a whole weekly series is dragged by whole days, shift its weekdays too. */
function shiftRecurrenceWeekdays(rec: Recurrence | undefined, days: number): Recurrence | undefined {
  if (!rec || !days || rec.freq !== "weekly" || !rec.byWeekday) return rec;
  return {
    ...rec,
    byWeekday: rec.byWeekday.map((wd) => shiftWeekday(wd, days)).sort((a, b) => a - b),
  };
}

/** Shift a whole recurrence (weekdays + `until`) by N days. */
function shiftRecurrenceDays(rec: Recurrence | undefined, days: number): Recurrence | undefined {
  if (!rec || !days) return rec;
  const shifted = shiftRecurrenceWeekdays(rec, days) ?? rec;
  return shifted.until ? { ...shifted, until: addDaysISO(shifted.until, days) } : shifted;
}

/** Exdates that belong to the new (>= cut) series after a "following" split. */
function futureExdates(master: CalEvent | undefined, cutISO: string): string[] {
  return (master?.exdates ?? []).filter((d) => d >= cutISO);
}

/** Apply an edit (from the form draft) to a single occurrence, scoped. */
export function applyEditScope(
  scope: EditScope,
  occ: Occurrence,
  draft: EventDraft,
  events: CalEvent[]
): CalEvent[] {
  const fields = {
    title: draft.title,
    date: draft.date,
    time: draft.time,
    durationMin: draft.durationMin,
    zoneId: draft.zoneId,
    note: draft.note,
    color: draft.color,
    opacity: draft.opacity,
  };

  if (!occ.isRecurring) {
    return events.map((e) =>
      e.id === occ.event.id ? { ...e, ...fields, recurrence: draft.recurrence } : e
    );
  }

  const sid = occ.seriesId!;
  const master = findMaster(events, sid);
  const recDate = occ.recurDate!;

  if (scope === "this") {
    const existing = events.find((e) => e.seriesId === sid && e.recurDate === recDate);
    const override: CalEvent = {
      id: existing?.id ?? uid(),
      seriesId: sid,
      recurDate: recDate,
      ...fields,
    };
    return [...events.filter((e) => !(e.seriesId === sid && e.recurDate === recDate)), override];
  }

  if (scope === "all") {
    // Removing recurrence turns the series into a single event: drop its
    // overrides and exceptions too.
    const removing = !draft.recurrence;
    return events
      .filter((e) => !(removing && e.seriesId === sid))
      .map((e) =>
        e.id === sid
          ? {
              ...e,
              title: draft.title,
              time: draft.time,
              durationMin: draft.durationMin,
              zoneId: draft.zoneId,
              note: draft.note,
              color: draft.color,
              opacity: draft.opacity,
              recurrence: draft.recurrence,
              exdates: removing ? undefined : e.exdates,
            }
          : e
      );
  }

  // following: end the old series before this date; start a new series here
  const removing = !draft.recurrence;
  const newId = uid();
  const newMaster: CalEvent = {
    id: newId,
    ...fields,
    date: recDate,
    recurrence: draft.recurrence,
    exdates: removing ? undefined : futureExdates(master, recDate),
  };
  const updated = events
    .filter(
      // if de-recurring the tail, its future overrides no longer make sense
      (e) => !(removing && e.seriesId === sid && e.recurDate && e.recurDate >= recDate)
    )
    .map((e) => {
      if (e.id === sid) {
        return {
          ...e,
          exdates: (e.exdates ?? []).filter((d) => d < recDate),
          recurrence: { ...e.recurrence!, until: dayBefore(recDate) },
        };
      }
      if (e.seriesId === sid && e.recurDate && e.recurDate >= recDate) {
        return { ...e, seriesId: newId };
      }
      return e;
    });
  return [...updated, newMaster];
}

/** Delete one occurrence, scoped. */
export function applyDeleteScope(
  scope: EditScope,
  occ: Occurrence,
  events: CalEvent[]
): CalEvent[] {
  if (!occ.isRecurring) {
    return events.filter((e) => e.id !== occ.event.id);
  }
  const sid = occ.seriesId!;
  const recDate = occ.recurDate!;

  if (scope === "all") {
    return events.filter((e) => e.id !== sid && e.seriesId !== sid);
  }
  if (scope === "this") {
    return events
      .filter((e) => !(e.seriesId === sid && e.recurDate === recDate))
      .map((e) =>
        e.id === sid ? { ...e, exdates: [...(e.exdates ?? []), recDate] } : e
      );
  }
  // following
  return events
    .filter((e) => !(e.seriesId === sid && e.recurDate && e.recurDate >= recDate))
    .map((e) =>
      e.id === sid
        ? {
            ...e,
            exdates: (e.exdates ?? []).filter((d) => d < recDate),
            recurrence: { ...e.recurrence!, until: dayBefore(recDate) },
          }
        : e
    );
}

/** Move one occurrence by a day/minute delta (applied in baseZone), scoped. */
export function applyMoveScope(
  scope: EditScope,
  occ: Occurrence,
  delta: { days: number; minutes: number },
  events: CalEvent[],
  baseZoneId: string
): CalEvent[] {
  if (!occ.isRecurring) {
    return events.map((e) =>
      e.id === occ.event.id ? { ...e, ...shiftFields(e, delta, baseZoneId) } : e
    );
  }
  const sid = occ.seriesId!;
  const master = findMaster(events, sid);
  const recDate = occ.recurDate!;
  const sh = shiftFields(occ.event, delta, baseZoneId);

  if (scope === "this") {
    const existing = events.find((e) => e.seriesId === sid && e.recurDate === recDate);
    const override: CalEvent = {
      id: existing?.id ?? uid(),
      seriesId: sid,
      recurDate: recDate,
      title: occ.event.title,
      date: sh.date,
      time: sh.time,
      durationMin: occ.event.durationMin,
      zoneId: occ.event.zoneId,
      note: occ.event.note,
      color: occ.event.color,
      opacity: occ.event.opacity,
    };
    return [...events.filter((e) => !(e.seriesId === sid && e.recurDate === recDate)), override];
  }
  if (scope === "all") {
    const d = delta.days;
    return events.map((e) => {
      if (e.id === sid) {
        // shift the master's anchor, weekdays, until, and exceptions together
        return {
          ...e,
          date: d ? shiftFields(e, delta, baseZoneId).date : e.date,
          time: sh.time,
          recurrence: shiftRecurrenceDays(e.recurrence, d),
          exdates: d ? e.exdates?.map((x) => addDaysISO(x, d)) : e.exdates,
        };
      }
      if (e.seriesId === sid) {
        // carry overrides along by the same shift
        const os = shiftFields(e, delta, baseZoneId);
        return {
          ...e,
          date: os.date,
          time: os.time,
          recurDate: e.recurDate && d ? addDaysISO(e.recurDate, d) : e.recurDate,
        };
      }
      return e;
    });
  }
  // following
  const d = delta.days;
  const newId = uid();
  const newMaster: CalEvent = {
    id: newId,
    title: occ.event.title,
    date: sh.date,
    time: sh.time,
    durationMin: occ.event.durationMin,
    zoneId: occ.event.zoneId,
    note: occ.event.note,
    color: occ.event.color,
    opacity: occ.event.opacity,
    recurrence: shiftRecurrenceDays(master?.recurrence, d),
    exdates: futureExdates(master, recDate).map((x) => addDaysISO(x, d)),
  };
  const updated = events.map((e) => {
    if (e.id === sid) {
      return {
        ...e,
        exdates: (e.exdates ?? []).filter((x) => x < recDate),
        recurrence: { ...e.recurrence!, until: dayBefore(recDate) },
      };
    }
    if (e.seriesId === sid && e.recurDate && e.recurDate >= recDate) {
      // retarget to the new series and shift by the same drag delta
      const os = shiftFields(e, delta, baseZoneId);
      return {
        ...e,
        seriesId: newId,
        date: os.date,
        time: os.time,
        recurDate: addDaysISO(e.recurDate, d),
      };
    }
    return e;
  });
  return [...updated, newMaster];
}

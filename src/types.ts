export interface Zone {
  /** IANA zone id, e.g. "Asia/Manila" */
  id: string;
  /** Short display label, e.g. "Manila" */
  label: string;
  /** Optional flag emoji */
  flag?: string;
}

export type RecurFreq = "daily" | "weekly";

export interface Recurrence {
  freq: RecurFreq;
  /** every N days/weeks (1 = every day/week) */
  interval: number;
  /** for weekly: Luxon weekdays 1..7 (Mon..Sun). "Weekdays" preset = [1,2,3,4,5]. */
  byWeekday?: number[];
  /** inclusive end date "YYYY-MM-DD" in the event's zone; omitted = forever */
  until?: string;
}

export interface CalEvent {
  id: string;
  title: string;
  /** ISO date "YYYY-MM-DD" as entered in `zoneId` (series start for a master) */
  date: string;
  /** "HH:mm" (24h) as entered in `zoneId` */
  time: string;
  /** Duration in minutes */
  durationMin: number;
  /** IANA zone the date/time was entered in */
  zoneId: string;
  /** Optional note */
  note?: string;
  /** Optional color key */
  color?: string;
  /** fill opacity 0..1 (defaults applied at render) */
  opacity?: number;

  // --- recurrence ---
  /** present on a "master" event that repeats */
  recurrence?: Recurrence;
  /** master only: occurrence start-dates removed from the series */
  exdates?: string[];
  /** override only: the master series id this event overrides an occurrence of */
  seriesId?: string;
  /** override only: the original occurrence date this override replaces */
  recurDate?: string;
}

/** The fields the event form collects (identity/scoping handled by the app). */
export interface EventDraft {
  title: string;
  date: string;
  time: string;
  durationMin: number;
  zoneId: string;
  note?: string;
  color?: string;
  /** fill opacity 0..1 (defaults applied at render) */
  opacity?: number;
  recurrence?: Recurrence;
}

export type EditScope = "this" | "following" | "all";

export interface TripLeg {
  id: string;
  /** inclusive "YYYY-MM-DD" */
  from: string;
  /** inclusive "YYYY-MM-DD" */
  to: string;
  /** free-text place name, e.g. "Toronto" or "Home" */
  location: string;
  /** IANA zone for this leg */
  zoneId: string;
}

export interface WorkBand {
  enabled: boolean;
  /** IANA zone the band is defined in */
  zoneId: string;
  /** "HH:mm" start */
  start: string;
  /** "HH:mm" end (may cross midnight relative to other zones) */
  end: string;
  /** Luxon weekdays 1..7 (Mon..Sun) the band applies to */
  days: number[];
}

export interface AppSettings {
  zones: Zone[];
  baseZoneId: string;
  workBand: WorkBand;
  trip: TripLeg[];
}

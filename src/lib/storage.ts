import type { AppSettings, CalEvent } from "../types";
import { localZone } from "./zones";
import { sanitizeEvents, sanitizeSettings } from "./sanitize";

const EVENTS_KEY = "tzp.events.v1";
const SETTINGS_KEY = "tzp.settings.v1";

/** Generic blank-slate settings: just the device's local zone, empty trip. */
export function makeDefaultSettings(): AppSettings {
  const lz = localZone();
  return {
    zones: [lz],
    baseZoneId: lz.id,
    workBand: {
      enabled: true,
      zoneId: lz.id,
      start: "09:00",
      end: "17:00",
      days: [1, 2, 3, 4, 5],
    },
    trip: [],
  };
}

export const DEFAULT_SETTINGS: AppSettings = makeDefaultSettings();

export function loadEvents(): CalEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    return sanitizeEvents(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveEvents(events: CalEvent[]): void {
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw), DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

import type { Zone } from "../types";

/** A curated list of common zones to pick from (kept short & practical). */
export const ZONE_OPTIONS: Zone[] = [
  { id: "Asia/Manila", label: "Manila", flag: "🇵🇭" },
  { id: "America/Vancouver", label: "Vancouver", flag: "🇨🇦" },
  { id: "America/Toronto", label: "Toronto", flag: "🇨🇦" },
  { id: "America/New_York", label: "New York", flag: "🇺🇸" },
  { id: "America/Chicago", label: "Chicago", flag: "🇺🇸" },
  { id: "America/Denver", label: "Denver", flag: "🇺🇸" },
  { id: "America/Los_Angeles", label: "Los Angeles", flag: "🇺🇸" },
  { id: "America/Sao_Paulo", label: "São Paulo", flag: "🇧🇷" },
  { id: "Europe/London", label: "London", flag: "🇬🇧" },
  { id: "Europe/Amsterdam", label: "Amsterdam", flag: "🇳🇱" },
  { id: "Europe/Paris", label: "Paris", flag: "🇫🇷" },
  { id: "Europe/Berlin", label: "Berlin", flag: "🇩🇪" },
  { id: "Europe/Madrid", label: "Madrid", flag: "🇪🇸" },
  { id: "Europe/Rome", label: "Rome", flag: "🇮🇹" },
  { id: "Asia/Dubai", label: "Dubai", flag: "🇦🇪" },
  { id: "Asia/Kolkata", label: "India (Kolkata)", flag: "🇮🇳" },
  { id: "Asia/Singapore", label: "Singapore", flag: "🇸🇬" },
  { id: "Asia/Hong_Kong", label: "Hong Kong", flag: "🇭🇰" },
  { id: "Asia/Tokyo", label: "Tokyo", flag: "🇯🇵" },
  { id: "Asia/Seoul", label: "Seoul", flag: "🇰🇷" },
  { id: "Australia/Sydney", label: "Sydney", flag: "🇦🇺" },
  { id: "Pacific/Auckland", label: "Auckland", flag: "🇳🇿" },
];

/** Country / alias keywords so common zones are findable by country name. */
const KEYWORDS: Record<string, string> = {
  "Asia/Manila": "philippines ph",
  "America/Vancouver": "canada british columbia bc pacific",
  "America/Toronto": "canada ontario eastern",
  "America/New_York": "usa united states us eastern est",
  "America/Chicago": "usa united states us central",
  "America/Denver": "usa united states us mountain",
  "America/Los_Angeles": "usa united states us california pacific pst",
  "America/Sao_Paulo": "brazil brasil",
  "Europe/London": "uk united kingdom england britain gb gmt",
  "Europe/Amsterdam": "netherlands holland nl dutch",
  "Europe/Paris": "france fr",
  "Europe/Berlin": "germany deutschland de",
  "Europe/Madrid": "spain espana es",
  "Europe/Rome": "italy italia it",
  "Asia/Dubai": "uae united arab emirates",
  "Asia/Kolkata": "india in calcutta",
  "Asia/Singapore": "singapore sg",
  "Asia/Hong_Kong": "hong kong china hk",
  "Asia/Tokyo": "japan jp",
  "Asia/Seoul": "korea south korea kr",
  "Australia/Sydney": "australia au nsw",
  "Pacific/Auckland": "new zealand nz",
};

let _allCache: Zone[] | null = null;

/**
 * The complete IANA timezone list from the browser (~450 zones), with derived
 * labels, cached. Common zones (ZONE_OPTIONS) are excluded so they can be shown
 * in their own group with flags. Falls back to empty on engines lacking
 * Intl.supportedValuesOf.
 */
export function getAllZones(): Zone[] {
  if (_allCache) return _allCache;
  const commonIds = new Set(ZONE_OPTIONS.map((z) => z.id));
  let ids: string[] = [];
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === "function") ids = fn("timeZone");
  } catch {
    /* ignore */
  }
  _allCache = ids
    .filter((id) => !commonIds.has(id))
    .map((id) => {
      const parts = id.split("/");
      const region = parts[0].replace(/_/g, " ");
      const city = parts[parts.length - 1].replace(/_/g, " ");
      return { id, label: parts.length > 1 ? `${city} (${region})` : city, flag: "🌐" };
    });
  return _allCache;
}

/** Look up a zone by id across common + full lists. */
export function zoneById(id: string): Zone | undefined {
  return ZONE_OPTIONS.find((z) => z.id === id) ?? getAllZones().find((z) => z.id === id);
}

/** The device's timezone as a Zone (with a flag if it's a known common zone). */
export function localZone(): Zone {
  let id = "UTC";
  try {
    id = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    /* ignore */
  }
  const known = ZONE_OPTIONS.find((z) => z.id === id);
  if (known) return known;
  const parts = id.split("/");
  const city = parts[parts.length - 1].replace(/_/g, " ");
  return { id, label: city, flag: "🌐" };
}

/**
 * Search common + all zones by city, region, id, or country keyword. Common
 * zones rank first. Returns up to `limit` matches (all when query is empty).
 */
export function searchZones(query: string, excludeIds: Set<string>, limit = 60): Zone[] {
  const q = query.trim().toLowerCase();
  const all = [...ZONE_OPTIONS, ...getAllZones()]; // common first
  const out: Zone[] = [];
  for (const z of all) {
    if (excludeIds.has(z.id)) continue;
    if (q) {
      const hay = `${z.label} ${z.id} ${KEYWORDS[z.id] ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(z);
    if (out.length >= limit) break;
  }
  return out;
}

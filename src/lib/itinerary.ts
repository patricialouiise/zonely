import { DateTime } from "luxon";
import type { TripLeg } from "../types";

/** Which trip leg (if any) contains this ISO date? First match wins. */
export function legForDate(isoDate: string, trip: TripLeg[]): TripLeg | null {
  const d = DateTime.fromISO(isoDate);
  if (!d.isValid) return null;
  for (const leg of trip) {
    const from = DateTime.fromISO(leg.from);
    const to = DateTime.fromISO(leg.to);
    if (from.isValid && to.isValid && d >= from.startOf("day") && d <= to.endOf("day")) {
      return leg;
    }
  }
  return null;
}

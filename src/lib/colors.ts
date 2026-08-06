export interface EventColor {
  key: string;
  name: string;
  hex: string;
}

export const EVENT_COLORS: EventColor[] = [
  { key: "blue", name: "Blue", hex: "#3b82f6" },
  { key: "green", name: "Green", hex: "#22c55e" },
  { key: "amber", name: "Amber", hex: "#f59e0b" },
  { key: "red", name: "Red", hex: "#ef4444" },
  { key: "purple", name: "Purple", hex: "#8b5cf6" },
  { key: "pink", name: "Pink", hex: "#ec4899" },
  { key: "teal", name: "Teal", hex: "#14b8a6" },
  { key: "slate", name: "Slate", hex: "#64748b" },
];

export const DEFAULT_EVENT_COLOR = "#3b82f6";
export const DEFAULT_OPACITY = 1;
export const OPACITY_PRESETS = [1, 0.8, 0.6, 0.4];

/** Background fill for an event block — the color at the given opacity (0..1). */
export function eventFill(color?: string, opacity?: number): string {
  const pct = Math.round((opacity ?? DEFAULT_OPACITY) * 100);
  return `color-mix(in srgb, ${color || DEFAULT_EVENT_COLOR} ${pct}%, transparent)`;
}

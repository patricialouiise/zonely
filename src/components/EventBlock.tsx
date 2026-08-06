import type { Occurrence } from "../lib/recurrence";
import { eventFill } from "../lib/colors";
import { durationLabel } from "../lib/time";

const MIN_BLOCK_H = 16;
/** Below this height, show only the title (no room for the time line). */
const TIME_LINE_MIN_H = 34;
/** Blocks at least this tall also show the duration on its own line. */
const DUR_LINE_MIN_H = 56;

/** Top/height (px) for an event within a day window, given absolute millis. */
export function blockGeometry(
  startMs: number,
  endMs: number,
  windowStartMs: number,
  hourHeight: number
) {
  const topMin = Math.max(0, (startMs - windowStartMs) / 60000);
  const endMin = Math.min(1440, (endMs - windowStartMs) / 60000);
  return {
    top: (topMin / 60) * hourHeight,
    height: Math.max(MIN_BLOCK_H, ((endMin - topMin) / 60) * hourHeight),
  };
}

interface Props {
  occ: Occurrence;
  top: number;
  height: number;
  /** horizontal placement (CSS values) for overlap layout */
  left: string;
  width: string;
  transform?: string;
  dragging: boolean;
  /** start time in the display zone */
  timeLabel: string;
  /** end time in the display zone */
  endLabel: string;
  titleAttr: string;
  /** week-view variant (tighter styling) */
  week?: boolean;
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>;
}

/** The colored event chip used by both the Day and Week grids. */
export default function EventBlock({
  occ,
  top,
  height,
  left,
  width,
  transform,
  dragging,
  timeLabel,
  endLabel,
  titleAttr,
  week,
  onPointerDown,
}: Props) {
  return (
    <button
      className={"eventblock" + (week ? " eventblock--week" : "") + (dragging ? " dragging" : "")}
      style={{
        top,
        height,
        left,
        width,
        background: eventFill(occ.event.color, occ.event.opacity),
        transform,
      }}
      onPointerDown={onPointerDown}
      title={titleAttr}
    >
      {height >= TIME_LINE_MIN_H && (
        <span className="eventblock__time">
          {timeLabel} <span className="eventblock__arrow">→</span> {endLabel}
          {occ.isRecurring && <span className="recur"> ↻</span>}
        </span>
      )}
      <span className="eventblock__title">
        {height < TIME_LINE_MIN_H && occ.isRecurring && <span className="recur">↻ </span>}
        {occ.event.title}
      </span>
      {height >= DUR_LINE_MIN_H && (
        <span className="eventblock__dur">{durationLabel(occ.event.durationMin)}</span>
      )}
    </button>
  );
}

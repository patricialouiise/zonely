import { useRef, useState } from "react";
import type { CalEvent } from "../types";

export interface MoveDelta {
  days: number;
  minutes: number;
}

interface StartOpts {
  /** width of one day column in px; 0 disables horizontal (day-shift) dragging */
  colWidth?: number;
  /** called when the pointer was a click, not a drag */
  onClick: () => void;
  /** called with the snapped delta when a real move happened */
  onCommit: (delta: MoveDelta) => void;
}

interface DragInfo extends StartOpts {
  id: string;
  startX: number;
  startY: number;
  moved: boolean;
}

/**
 * Pointer-based drag for absolutely-positioned event blocks on an hour grid.
 * Vertical movement snaps to 15-minute steps; horizontal snaps to whole day
 * columns (when colWidth is provided). Distinguishes a click from a drag.
 */
export function useBlockDrag(hourHeight: number, snapMin = 15) {
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const ref = useRef<DragInfo | null>(null);

  function delta(clientX: number, clientY: number) {
    const d = ref.current!;
    const rawDx = clientX - d.startX;
    const rawDy = clientY - d.startY;
    const minutes = Math.round((rawDy / hourHeight) * (60 / snapMin)) * snapMin;
    const days = d.colWidth ? Math.round(rawDx / d.colWidth) : 0;
    return { rawDx, rawDy, minutes, days };
  }

  function startDrag(e: React.PointerEvent, ev: CalEvent, opts: StartOpts) {
    e.preventDefault();
    ref.current = {
      id: ev.id,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      ...opts,
    };
    setDrag({ id: ev.id, dx: 0, dy: 0 });

    const move = (me: PointerEvent) => {
      const d = ref.current;
      if (!d) return;
      const { rawDx, rawDy, minutes, days } = delta(me.clientX, me.clientY);
      if (Math.abs(rawDx) + Math.abs(rawDy) > 3) d.moved = true;
      setDrag({ id: d.id, dx: days * (d.colWidth ?? 0), dy: (minutes / 60) * hourHeight });
    };
    const up = (ue: PointerEvent) => {
      const d = ref.current;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!d) return;
      const { minutes, days } = delta(ue.clientX, ue.clientY);
      ref.current = null;
      setDrag(null);
      if (!d.moved || (days === 0 && minutes === 0)) {
        d.onClick();
        return;
      }
      d.onCommit({ days, minutes });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return { drag, startDrag };
}

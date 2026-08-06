import { useState } from "react";

export interface CreateSelection {
  colKey: string;
  top: number;
  height: number;
}

const LONG_PRESS_MS = 450;
const SCROLL_CANCEL_PX = 10;

/**
 * Create-by-dragging on an hour-grid column.
 *  - Mouse: press-drag starts immediately; a plain click = 60 min.
 *  - Touch/pen: a ~450ms long-press (finger held still) activates a selection;
 *    a quick touch scrolls the grid instead. After activation you can drag to
 *    size the span, or lift for a 60-minute event.
 * Spans snap to `snapMin`.
 */
export function useCreateDrag(hourHeight: number, snapMin = 15) {
  const [sel, setSel] = useState<CreateSelection | null>(null);

  const snap = (m: number) => Math.round(m / snapMin) * snapMin;
  const clampMin = (m: number) => Math.max(0, Math.min(1440, m));
  const minAt = (clientY: number, colTop: number) =>
    clampMin(snap(((clientY - colTop) / hourHeight) * 60));
  const toPx = (min: number) => (min / 60) * hourHeight;

  function begin(
    e: React.PointerEvent,
    colKey: string,
    onCommit: (startMin: number, durationMin: number) => void
  ) {
    if (e.pointerType === "mouse" && e.button !== 0) return; // primary mouse only
    if ((e.target as HTMLElement).closest(".eventblock")) return; // events handle themselves

    const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
    const colTop = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    const startX = e.clientX;
    const startY = e.clientY;

    let active = false;
    let moved = false;
    let startMin = 0;
    let armTimer: number | null = null;

    const activate = () => {
      active = true;
      moved = false;
      startMin = minAt(startY, colTop);
      setSel({ colKey, top: toPx(startMin), height: toPx(snapMin) });
      if (isTouch && typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
    };

    const onMove = (me: PointerEvent) => {
      if (!active) {
        // pre-activation (touch): treat real movement as a scroll → bail out
        if (
          Math.abs(me.clientY - startY) > SCROLL_CANCEL_PX ||
          Math.abs(me.clientX - startX) > SCROLL_CANCEL_PX
        ) {
          teardown();
        }
        return;
      }
      const curMin = minAt(me.clientY, colTop);
      if (Math.abs(curMin - startMin) >= snapMin) moved = true;
      const top = Math.min(startMin, curMin);
      const height = Math.max(snapMin, Math.abs(curMin - startMin));
      setSel({ colKey, top: toPx(top), height: toPx(height) });
    };

    const onUp = (ue: PointerEvent) => {
      const wasActive = active;
      teardown();
      if (!wasActive) return; // a tap/scroll that never activated
      const curMin = minAt(ue.clientY, colTop);
      let start: number;
      let dur: number;
      if (!moved) {
        start = startMin;
        dur = 60;
      } else {
        start = Math.min(startMin, curMin);
        dur = Math.max(snapMin, Math.abs(curMin - startMin));
      }
      if (start + dur > 1440) dur = 1440 - start;
      setSel(null);
      onCommit(start, dur);
    };

    const onCancel = () => {
      teardown();
      setSel(null);
    };

    // block native scrolling only once a touch selection is active
    const preventTouch = (te: TouchEvent) => {
      if (active) te.preventDefault();
    };

    const teardown = () => {
      if (armTimer !== null) {
        clearTimeout(armTimer);
        armTimer = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("touchmove", preventTouch);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    if (isTouch) {
      document.addEventListener("touchmove", preventTouch, { passive: false });
      armTimer = window.setTimeout(activate, LONG_PRESS_MS);
    } else {
      e.preventDefault();
      activate();
    }
  }

  return { sel, begin };
}

export interface Placement {
  /** column index (0-based) */
  col: number;
  /** how many columns this event spans (expands right into free space) */
  colSpan: number;
  /** total columns in this overlap cluster */
  numCols: number;
}

/**
 * Google-Calendar-style overlap layout. Groups time-overlapping items into
 * clusters, packs each into the fewest columns, then lets each event expand
 * rightward into columns no later event occupies. Returns a placement per item.
 */
export function packOverlaps<T>(
  items: T[],
  getStart: (t: T) => number,
  getEnd: (t: T) => number
): Map<T, Placement> {
  const result = new Map<T, Placement>();
  const sorted = [...items].sort(
    (a, b) => getStart(a) - getStart(b) || getEnd(a) - getEnd(b)
  );

  let cluster: T[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    // greedy first-fit into columns (each column holds a non-overlapping chain)
    const cols: T[][] = [];
    const colOf = new Map<T, number>();
    for (const ev of cluster) {
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        const last = cols[c][cols[c].length - 1];
        if (getEnd(last) <= getStart(ev)) {
          cols[c].push(ev);
          colOf.set(ev, c);
          placed = true;
          break;
        }
      }
      if (!placed) {
        cols.push([ev]);
        colOf.set(ev, cols.length - 1);
      }
    }
    const numCols = cols.length;
    for (const ev of cluster) {
      const col = colOf.get(ev)!;
      let colSpan = 1;
      for (let c = col + 1; c < numCols; c++) {
        const blocked = cols[c].some(
          (o) => getStart(o) < getEnd(ev) && getEnd(o) > getStart(ev)
        );
        if (blocked) break;
        colSpan++;
      }
      result.set(ev, { col, colSpan, numCols });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of sorted) {
    if (cluster.length && getStart(ev) >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, getEnd(ev));
  }
  flush();
  return result;
}

/** CSS left/width for a placement, reserving `gutterPx` on the right for
 *  click-to-create and small gaps between columns. */
export function placementCss(p: Placement, gutterPx = 14): { left: string; width: string } {
  const slot = 1 / p.numCols;
  const leftFrac = p.col * slot;
  const widthFrac = p.colSpan * slot;
  return {
    left: `calc(${leftFrac} * (100% - ${gutterPx}px) + 2px)`,
    width: `calc(${widthFrac} * (100% - ${gutterPx}px) - 4px)`,
  };
}

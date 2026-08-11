import type { Zone } from "../types";
import { zoneById } from "../lib/zones";
import ZoneCombobox from "./ZoneCombobox";

interface Props {
  zones: Zone[];
  onChange: (zones: Zone[]) => void;
  /** Remove a zone (handles base-zone reassignment in the parent). */
  onRemove: (id: string) => void;
}

const MAX = 5;

/** Add/remove active zones (up to 5), with a searchable picker for adding. */
export default function ZonePicker({ zones, onChange, onRemove }: Props) {
  const activeIds = new Set(zones.map((z) => z.id));

  function add(id: string) {
    if (!id || zones.length >= MAX) return;
    const z = zoneById(id);
    if (z && !activeIds.has(z.id)) onChange([...zones, z]);
  }

  return (
    <div className="zonepicker">
      <div className="chips">
        {zones.map((z) => (
          <span key={z.id} className="chip">
            <span className="flag">{z.flag}</span> {z.label}
            {zones.length > 1 && (
              <button className="chip__x" onClick={() => onRemove(z.id)} title="Remove">
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {zones.length < MAX ? (
        <ZoneCombobox excludeIds={activeIds} onSelect={add} />
      ) : (
        <span className="muted small">Max {MAX} zones</span>
      )}
    </div>
  );
}

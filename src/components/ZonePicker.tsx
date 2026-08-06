import type { Zone } from "../types";
import { zoneById } from "../lib/zones";
import ZoneCombobox from "./ZoneCombobox";

interface Props {
  zones: Zone[];
  onChange: (zones: Zone[]) => void;
}

const MAX = 5;

/** Add/remove active zones (up to 5), with a searchable picker for adding. */
export default function ZonePicker({ zones, onChange }: Props) {
  const activeIds = new Set(zones.map((z) => z.id));

  function add(id: string) {
    if (!id || zones.length >= MAX) return;
    const z = zoneById(id);
    if (z && !activeIds.has(z.id)) onChange([...zones, z]);
  }

  function remove(id: string) {
    if (zones.length <= 1) return;
    onChange(zones.filter((z) => z.id !== id));
  }

  return (
    <div className="zonepicker">
      <div className="chips">
        {zones.map((z) => (
          <span key={z.id} className="chip">
            <span className="flag">{z.flag}</span> {z.label}
            {zones.length > 1 && (
              <button className="chip__x" onClick={() => remove(z.id)} title="Remove">
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

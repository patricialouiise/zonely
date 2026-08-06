import { useMemo, useRef, useState } from "react";
import type { Zone } from "../types";
import { searchZones } from "../lib/zones";

interface Props {
  excludeIds: Set<string>;
  onSelect: (id: string) => void;
}

/** A searchable timezone picker: type a city or country, then pick a match. */
export default function ZoneCombobox({ excludeIds, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const blurTimer = useRef<number | null>(null);

  const excludeKey = [...excludeIds].sort().join(",");
  const results = useMemo(
    () => searchZones(q, excludeIds, 60),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, excludeKey]
  );

  function choose(z: Zone) {
    onSelect(z.id);
    setQ("");
    setOpen(false);
    setIdx(0);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[idx]) {
        e.preventDefault();
        choose(results[idx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="zonecombo">
      <input
        className="zonecombo__input"
        value={q}
        placeholder="+ Add zone — search city or country…"
        role="combobox"
        aria-expanded={open}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul className="zonecombo__list" onMouseDown={(e) => e.preventDefault()}>
          {results.map((z, i) => (
            <li
              key={z.id}
              className={"zonecombo__item" + (i === idx ? " active" : "")}
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(z)}
            >
              <span className="flag">{z.flag}</span> {z.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

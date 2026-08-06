import type { ReactNode } from "react";

interface Props {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** optional element shown on the right of the header (doesn't toggle) */
  accessory?: ReactNode;
  children: ReactNode;
}

/** A card whose body collapses/expands when the header is clicked. */
export default function CollapsibleCard({ title, open, onToggle, accessory, children }: Props) {
  return (
    <section className={"card" + (open ? "" : " card--collapsed")}>
      <div className="card__bar">
        <button
          type="button"
          className="card__toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className={"chev" + (open ? " chev--open" : "")} aria-hidden="true">
            ▸
          </span>
          <h2>{title}</h2>
        </button>
        {accessory && <div className="card__accessory">{accessory}</div>}
      </div>
      {open && <div className="card__body">{children}</div>}
    </section>
  );
}

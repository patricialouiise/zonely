import type { EditScope } from "../types";

interface Props {
  title: string;
  /** verb shown on the buttons context, e.g. "Save" or "Delete" */
  message?: string;
  onPick: (scope: EditScope) => void;
  onCancel: () => void;
}

/** Asks whether a change to a recurring event applies to one / following / all. */
export default function ScopeDialog({ title, message, onPick, onCancel }: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal scopedialog" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {message && <p className="muted">{message}</p>}
        <div className="scope-options">
          <button className="btn" onClick={() => onPick("this")}>
            This event
          </button>
          <button className="btn" onClick={() => onPick("following")}>
            This and following events
          </button>
          <button className="btn" onClick={() => onPick("all")}>
            All events
          </button>
        </div>
        <div className="modal__actions">
          <span className="spacer" />
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

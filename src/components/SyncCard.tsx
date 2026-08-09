import { useState } from "react";

export type SyncStatus = "idle" | "syncing" | "error";

interface Props {
  connected: boolean;
  status: SyncStatus;
  message?: string;
  lastSyncedAt: number;
  busy: boolean;
  onConnect: (passphrase: string) => void;
  onDisconnect: () => void;
  onSyncNow: () => void;
}

function ago(ms: number): string {
  if (!ms) return "not yet";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Passphrase-based, end-to-end-encrypted sync across devices. */
export default function SyncCard({
  connected,
  status,
  message,
  lastSyncedAt,
  busy,
  onConnect,
  onDisconnect,
  onSyncNow,
}: Props) {
  const [phrase, setPhrase] = useState("");
  const [show, setShow] = useState(false);

  if (!connected) {
    const tooShort = phrase.trim().length < 8;
    return (
      <div className="sync">
        <p className="muted small">
          Sync your schedule across devices with a secret passphrase. Everything is
          <strong> end-to-end encrypted</strong> in your browser — the server only ever
          holds ciphertext, never your passphrase or your events.
        </p>
        <label className="sync__field">
          Passphrase
          <div className="sync__inputrow">
            <input
              type={show ? "text" : "password"}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="a long, unique phrase"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !tooShort && !busy) onConnect(phrase.trim());
              }}
            />
            <button
              type="button"
              className="btn ghost tiny"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide passphrase" : "Show passphrase"}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <p className="muted small">
          Use the <strong>same phrase</strong> on your other device to connect it. Pick
          something long and unique — anyone who knows it can read this schedule, and it
          can't be recovered if you forget it.
        </p>
        <button
          className="btn primary"
          disabled={tooShort || busy}
          onClick={() => onConnect(phrase.trim())}
        >
          {busy ? "Connecting…" : "Turn on sync"}
        </button>
        {status === "error" && message && <p className="error small">{message}</p>}
      </div>
    );
  }

  return (
    <div className="sync">
      <div className={"sync__status sync__status--" + status}>
        <span className="sync__dot" aria-hidden="true" />
        <span>
          {status === "syncing"
            ? "Syncing…"
            : status === "error"
              ? message || "Sync error"
              : "Synced"}
        </span>
      </div>
      <p className="muted small">Last synced {ago(lastSyncedAt)}.</p>
      <p className="muted small">
        Connected. Enter the same passphrase on another device to sync it here.
      </p>
      <div className="sync__actions">
        <button className="btn" onClick={onSyncNow} disabled={busy || status === "syncing"}>
          Sync now
        </button>
        <button className="btn danger" onClick={onDisconnect} disabled={busy}>
          Turn off
        </button>
      </div>
    </div>
  );
}

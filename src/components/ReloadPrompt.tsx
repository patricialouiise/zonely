import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Surfaces a small toast when a new service worker has been installed and is
 * waiting to activate. We use `registerType: "prompt"` (see vite.config.ts) so a
 * background deploy never force-reloads and discards in-progress edits — instead
 * the user chooses when to reload. "Later" dismisses; the update still applies
 * next time the app is fully closed and reopened.
 */
export default function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="sw-toast" role="status" aria-live="polite">
      <span className="sw-toast__msg">A new version of Zonely is available.</span>
      <div className="sw-toast__actions">
        <button className="btn primary tiny" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
        <button className="btn ghost tiny" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    </div>
  );
}

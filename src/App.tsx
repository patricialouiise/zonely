import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import type { AppSettings, CalEvent, EditScope, EventDraft } from "./types";
import {
  DEFAULT_SETTINGS,
  makeDefaultSettings,
  loadEvents,
  loadSettings,
  saveEvents,
  saveSettings,
} from "./lib/storage";
import { sanitizeEvents, sanitizeSettings } from "./lib/sanitize";
import { todayInZone, uid } from "./lib/time";
import {
  applyEditScope,
  applyDeleteScope,
  applyMoveScope,
  type Occurrence,
} from "./lib/recurrence";
import { legForDate } from "./lib/itinerary";
import { encodeShare, decodeShare } from "./lib/share";
import {
  type SyncConfig,
  type SyncDoc,
  deriveKeys,
  encryptDoc,
  decryptDoc,
  pullBlob,
  pushBlob,
  sanitizeDoc,
  mergeEventsById,
  loadSyncConfig,
  saveSyncConfig,
  clearSyncConfig,
  loadUpdatedAt,
  saveUpdatedAt,
  SyncUnconfigured,
} from "./lib/sync";
import ZoneBar from "./components/ZoneBar";
import ZonePicker from "./components/ZonePicker";
import Converter from "./components/Converter";
import WorkBand from "./components/WorkBand";
import DayView, { type CreateAt } from "./components/DayView";
import WeekView from "./components/WeekView";
import MonthView from "./components/MonthView";
import CollapsibleCard from "./components/CollapsibleCard";
import MeetingFinder from "./components/MeetingFinder";
import TripEditor from "./components/TripEditor";
import EventForm from "./components/EventForm";
import ScopeDialog from "./components/ScopeDialog";
import ReloadPrompt from "./components/ReloadPrompt";
import SyncCard, { type SyncStatus } from "./components/SyncCard";
import { zoneById } from "./lib/zones";

const PANELS_KEY = "tzp.panels.v1";
type PanelKey = "zones" | "work" | "meeting" | "convert" | "trip" | "sync";
const DEFAULT_PANELS: Record<PanelKey, boolean> = {
  zones: false,
  work: false,
  meeting: false,
  convert: false,
  trip: false,
  sync: false,
};

/** Sidebar cards start collapsed; the open/closed state is remembered. */
function loadPanels(): Record<PanelKey, boolean> {
  try {
    const raw = localStorage.getItem(PANELS_KEY);
    if (!raw) return DEFAULT_PANELS;
    return { ...DEFAULT_PANELS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PANELS;
  }
}

/** A recurring change awaiting the user's this/following/all choice. */
type PendingScope =
  | { kind: "edit"; occ: Occurrence; draft: EventDraft }
  | { kind: "delete"; occ: Occurrence }
  | { kind: "move"; occ: Occurrence; delta: { days: number; minutes: number } };

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [now, setNow] = useState<DateTime>(() => DateTime.now());
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [convTime, setConvTime] = useState<string>("13:00");
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [editingOcc, setEditingOcc] = useState<Occurrence | null>(null);
  const [createDefaults, setCreateDefaults] = useState<CreateAt | null>(null);
  const [pending, setPending] = useState<PendingScope | null>(null);
  const [openCards, setOpenCards] = useState<Record<PanelKey, boolean>>(loadPanels);
  const [notice, setNotice] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sync, setSync] = useState<SyncConfig | null>(loadSyncConfig);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState<string | undefined>(undefined);
  const [syncBusy, setSyncBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  // Mirrors of state + config for use inside async sync callbacks and timers,
  // which would otherwise close over stale values.
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const syncRef = useRef<SyncConfig | null>(sync);
  syncRef.current = sync;
  const localUpdatedAt = useRef<number>(loadUpdatedAt());
  const suppressPush = useRef(false); // set when applying remote data, to avoid an echo push
  const pushTimer = useRef<number | null>(null);

  function flashNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  }

  const toggleCard = (key: keyof typeof openCards) =>
    setOpenCards((s) => ({ ...s, [key]: !s[key] }));

  // Load persisted state on mount.
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setEvents(loadEvents());
    setSelectedDate(todayInZone(s.baseZoneId));
  }, []);

  // If opened via a share link (#data=…), offer to import it once, then strip
  // the token from the URL so a refresh doesn't re-prompt.
  useEffect(() => {
    const match = window.location.hash.match(/[#&]data=([^&]+)/);
    if (!match) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    let cancelled = false;
    (async () => {
      try {
        const data = await decodeShare(match[1]);
        if (cancelled) return;
        const preview = sanitizeEvents(
          Array.isArray(data)
            ? data
            : (data as Record<string, unknown> | null)?.events
        );
        const ok = window.confirm(
          `Import ${preview.length} event${preview.length === 1 ? "" : "s"} from this link? ` +
            "It merges into your current data (matching events are overwritten)."
        );
        if (!ok || cancelled) return;
        const result = importPayload(data);
        flashNotice(
          result
            ? `Imported ${result.events} event${result.events === 1 ? "" : "s"}${
                result.settings ? " + settings" : ""
              }.`
            : "That link didn't contain any data to import."
        );
      } catch {
        if (!cancelled) flashNotice("That share link couldn't be read.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flip the hydration flag on a later tick, so the mount-time runs of the
  // persistence effects below (which still see empty initial state) are skipped
  // and only genuine user changes get written back.
  useEffect(() => {
    const t = setTimeout(() => {
      hydrated.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Live clock tick.
  useEffect(() => {
    const t = setInterval(() => setNow(DateTime.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Persist — but only after the initial load has hydrated state, so the
  // mount-time run of these effects can't clobber saved data with defaults.
  useEffect(() => {
    if (hydrated.current) saveSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (hydrated.current) saveEvents(events);
  }, [events]);
  useEffect(() => {
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(openCards));
    } catch {
      /* ignore */
    }
  }, [openCards]);

  // ---- Cross-device sync (end-to-end encrypted, passphrase-based) ----
  function setSyncError(err: unknown, surface = false) {
    let msg = "Couldn't reach sync — will retry.";
    if (err instanceof SyncUnconfigured) msg = "Sync isn't set up on the server yet.";
    else if (err instanceof DOMException && err.name === "OperationError")
      msg = "That passphrase doesn't match the data already synced under it.";
    else if (err instanceof Error && err.message) msg = err.message;
    setSyncStatus("error");
    setSyncMessage(msg);
    if (surface) flashNotice(msg);
  }

  function markSynced() {
    setSyncStatus("idle");
    setSyncMessage(undefined);
    const cfg = syncRef.current;
    if (!cfg) return;
    const updated = { ...cfg, lastSyncedAt: Date.now() };
    syncRef.current = updated;
    setSync(updated);
    saveSyncConfig(updated);
  }

  // Apply a remote document to local state without provoking an echo push.
  function adoptRemote(remote: {
    events: CalEvent[];
    settings: AppSettings | null;
    updatedAt: number;
  }) {
    suppressPush.current = true;
    localUpdatedAt.current = remote.updatedAt;
    saveUpdatedAt(remote.updatedAt);
    setEvents(remote.events);
    if (remote.settings) {
      setSettings(remote.settings);
      setSelectedDate(todayInZone(remote.settings.baseZoneId));
    }
  }

  async function doPush() {
    const cfg = syncRef.current;
    if (!cfg) return;
    setSyncStatus("syncing");
    try {
      const doc: SyncDoc = {
        app: "zonely",
        version: 1,
        updatedAt: localUpdatedAt.current,
        events: eventsRef.current,
        settings: settingsRef.current,
      };
      await pushBlob(cfg.storageId, await encryptDoc(cfg.keyB64, doc));
      markSynced();
    } catch (err) {
      setSyncError(err);
    }
  }

  function schedulePush() {
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = null;
      void doPush();
    }, 1500);
  }

  // Pull the cloud copy; adopt it if newer (this is how deletions propagate),
  // otherwise push ours up so the cloud has the latest.
  async function doPull() {
    const cfg = syncRef.current;
    if (!cfg) return;
    setSyncStatus("syncing");
    try {
      const blob = await pullBlob(cfg.storageId);
      if (!blob) {
        await doPush();
        return;
      }
      const remote = sanitizeDoc(await decryptDoc(cfg.keyB64, blob));
      if (remote.updatedAt > localUpdatedAt.current) {
        adoptRemote(remote);
        markSynced();
      } else if (remote.updatedAt < localUpdatedAt.current) {
        await doPush();
      } else {
        markSynced();
      }
    } catch (err) {
      setSyncError(err);
    }
  }

  // Turn sync on / connect this device. Unions events with any existing cloud
  // copy so joining two populated devices never drops data.
  async function connectSync(passphrase: string) {
    setSyncBusy(true);
    setSyncStatus("syncing");
    setSyncMessage(undefined);
    try {
      const { storageId, keyB64 } = await deriveKeys(passphrase);
      let mergedEvents = eventsRef.current;
      let mergedSettings = settingsRef.current;
      const blob = await pullBlob(storageId);
      if (blob) {
        let remote;
        try {
          remote = sanitizeDoc(await decryptDoc(keyB64, blob));
        } catch {
          throw new Error(
            "A different passphrase already uses a similar code (or the data is corrupt). Pick a longer, more unique phrase."
          );
        }
        mergedEvents = mergeEventsById(eventsRef.current, remote.events);
        if (remote.settings && remote.updatedAt > localUpdatedAt.current) {
          mergedSettings = remote.settings;
        }
      }
      const now = Date.now();
      suppressPush.current = true;
      localUpdatedAt.current = now;
      saveUpdatedAt(now);
      setEvents(mergedEvents);
      setSettings(mergedSettings);
      setSelectedDate(todayInZone(mergedSettings.baseZoneId));

      const cfg: SyncConfig = { storageId, keyB64, lastSyncedAt: now };
      syncRef.current = cfg;
      setSync(cfg);
      saveSyncConfig(cfg);

      const doc: SyncDoc = {
        app: "zonely",
        version: 1,
        updatedAt: now,
        events: mergedEvents,
        settings: mergedSettings,
      };
      await pushBlob(storageId, await encryptDoc(keyB64, doc));
      markSynced();
      flashNotice(
        blob
          ? `Sync on — ${mergedEvents.length} event${
              mergedEvents.length === 1 ? "" : "s"
            } merged across your devices.`
          : "Sync on — this device is the source. Use the same phrase elsewhere to connect it."
      );
    } catch (err) {
      setSyncError(err, true);
    } finally {
      setSyncBusy(false);
    }
  }

  function disconnectSync() {
    if (pushTimer.current) {
      window.clearTimeout(pushTimer.current);
      pushTimer.current = null;
    }
    clearSyncConfig();
    syncRef.current = null;
    setSync(null);
    setSyncStatus("idle");
    setSyncMessage(undefined);
    flashNotice("Sync turned off on this device. Your data stays here.");
  }

  // Bump the last-write clock on genuine user changes and, when sync is on,
  // push them up (debounced). Skips the mount load and remote-applied changes.
  useEffect(() => {
    if (!hydrated.current) return;
    if (suppressPush.current) {
      suppressPush.current = false;
      return;
    }
    localUpdatedAt.current = Date.now();
    saveUpdatedAt(localUpdatedAt.current);
    if (syncRef.current) schedulePush();
  }, [events, settings]);

  // On mount, if sync is configured, pull the cloud copy once hydrated.
  useEffect(() => {
    if (!syncRef.current) return;
    const t = setTimeout(() => void doPull(), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-pull whenever the app comes back to the foreground (tab refocus / PWA
  // resume), so an already-open device catches edits made elsewhere without a
  // manual "Sync now". Throttled, and skipped while a local edit is pending.
  useEffect(() => {
    let lastPull = 0;
    const maybePull = () => {
      if (document.visibilityState !== "visible") return;
      if (!syncRef.current || pushTimer.current) return;
      const now = Date.now();
      if (now - lastPull < 3000) return;
      lastPull = now;
      void doPull();
    };
    document.addEventListener("visibilitychange", maybePull);
    window.addEventListener("focus", maybePull);
    return () => {
      document.removeEventListener("visibilitychange", maybePull);
      window.removeEventListener("focus", maybePull);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leg = useMemo(
    () => (selectedDate ? legForDate(selectedDate, settings.trip) : null),
    [selectedDate, settings.trip]
  );
  const legFlag = leg ? zoneById(leg.zoneId)?.flag ?? "📍" : "";

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
  }

  function shiftDay(delta: number) {
    setSelectedDate((d) => DateTime.fromISO(d).plus({ days: delta }).toFormat("yyyy-LL-dd"));
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setEditingOcc(null);
  }

  // Save from the form. New events and non-recurring edits apply immediately;
  // editing a recurring occurrence asks for scope first.
  function handleSave(draft: EventDraft) {
    if (!editingOcc) {
      // creating a brand-new event
      const base: CalEvent = {
        id: uid(),
        title: draft.title,
        date: draft.date,
        time: draft.time,
        durationMin: draft.durationMin,
        zoneId: draft.zoneId,
        note: draft.note,
        color: draft.color,
        opacity: draft.opacity,
      };
      const ev = draft.recurrence
        ? { ...base, recurrence: draft.recurrence, exdates: [] }
        : base;
      setEvents((list) => [...list, ev]);
      closeForm();
      return;
    }
    if (!editingOcc.isRecurring) {
      setEvents((list) => applyEditScope("all", editingOcc, draft, list));
      closeForm();
      return;
    }
    // recurring: need this / following / all
    setPending({ kind: "edit", occ: editingOcc, draft });
    setFormOpen(false);
  }

  // Delete from the form's Delete button.
  function handleDeleteFromForm() {
    const occ = editingOcc;
    if (!occ) return;
    if (!occ.isRecurring) {
      setEvents((list) => applyDeleteScope("all", occ, list));
      closeForm();
      return;
    }
    setPending({ kind: "delete", occ });
    setFormOpen(false);
  }

  // Drag-move an occurrence.
  function handleMove(occ: Occurrence, delta: { days: number; minutes: number }) {
    if (!occ.isRecurring) {
      setEvents((list) => applyMoveScope("all", occ, delta, list, settings.baseZoneId));
      return;
    }
    setPending({ kind: "move", occ, delta });
  }

  // Resolve a pending recurring change once the user picks a scope.
  function resolveScope(scope: EditScope) {
    if (!pending) return;
    setEvents((list) => {
      if (pending.kind === "edit") return applyEditScope(scope, pending.occ, pending.draft, list);
      if (pending.kind === "delete") return applyDeleteScope(scope, pending.occ, list);
      return applyMoveScope(scope, pending.occ, pending.delta, list, settings.baseZoneId);
    });
    setPending(null);
    setEditing(null);
    setEditingOcc(null);
  }

  function openAdd() {
    setCreateDefaults(null);
    setEditing(null);
    setEditingOcc(null);
    setFormOpen(true);
  }

  // Drag-to-create on the grid opens the Add form pre-filled with the span.
  function handleCreateAt(at: CreateAt) {
    setCreateDefaults(at);
    setEditing(null);
    setEditingOcc(null);
    setFormOpen(true);
  }

  // ---- Backup: export/import as JSON ----
  function exportData() {
    const payload = {
      app: "zonely",
      version: 1,
      exportedAt: new Date().toISOString(),
      events,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zonely-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashNotice(`Exported ${events.length} event${events.length === 1 ? "" : "s"}.`);
  }

  /**
   * Merge a decoded backup/share payload into state. Imported events overwrite
   * matching ids; settings replace wholesale. Returns a summary, or null when
   * the payload held nothing usable.
   */
  function importPayload(data: unknown): { events: number; settings: boolean } | null {
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const valid = sanitizeEvents(Array.isArray(data) ? data : obj?.events);
    const hasSettings = !!obj?.settings;
    if (!valid.length && !hasSettings) return null;
    setEvents((prev) => {
      const byId = new Map(prev.map((ev) => [ev.id, ev]));
      valid.forEach((ev) => byId.set(ev.id, ev));
      return [...byId.values()];
    });
    if (hasSettings) {
      const s = sanitizeSettings(obj.settings, DEFAULT_SETTINGS);
      setSettings(s);
      setSelectedDate(todayInZone(s.baseZoneId));
    }
    return { events: valid.length, settings: hasSettings };
  }

  // ---- Share: move data to another device via a link (no file, no backend) ----
  async function shareData() {
    let url: string;
    try {
      const token = await encodeShare({
        app: "zonely",
        version: 1,
        exportedAt: new Date().toISOString(),
        events,
        settings,
      });
      url = `${window.location.origin}${window.location.pathname}#data=${token}`;
    } catch {
      flashNotice("Couldn't build a share link on this browser.");
      return;
    }
    // Very large schedules blow past practical URL limits — fall back to Export.
    if (url.length > 50000) {
      flashNotice("Too much data for a link — use Export to move a file instead.");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "Zonely", text: "My Zonely schedule", url });
        return;
      } catch (err) {
        // User dismissed the share sheet — not an error, and don't fall through.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise fall through to the clipboard path.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flashNotice("Share link copied — open it on your other device to import.");
    } catch {
      flashNotice("Couldn't copy the link. Try Export instead.");
    }
  }

  function clearAll() {
    const ok = window.confirm(
      "Clear all events and reset settings to a blank slate? This can't be undone — export a backup first if you want to keep your data."
    );
    if (!ok) return;
    const def = makeDefaultSettings();
    setEvents([]);
    setSettings(def);
    setSelectedDate(todayInZone(def.baseZoneId));
    flashNotice("Cleared — reset to a blank slate.");
  }

  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importPayload(JSON.parse(String(reader.result)));
        if (!result) {
          flashNotice("No valid data found in that file.");
          return;
        }
        flashNotice(
          `Imported ${result.events} event${result.events === 1 ? "" : "s"}${
            result.settings ? " + settings" : ""
          }.`
        );
      } catch {
        flashNotice("Could not read that file — is it a valid backup?");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function openEdit(occ: Occurrence) {
    setEditingOcc(occ);
    // prefill the form's recurrence from the series master, if any
    const master = occ.seriesId ? events.find((e) => e.id === occ.seriesId) : null;
    setEditing({ ...occ.event, recurrence: master?.recurrence });
    setFormOpen(true);
  }

  if (!selectedDate) return null; // wait for mount init

  const baseZone = settings.zones.find((z) => z.id === settings.baseZoneId);

  return (
    <div className="app">
      <div className="topbar">
        <button
          className="topbar__menu"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open zones & tools"
        >
          ☰
        </button>
        <button className="topbar__base" onClick={() => setDrawerOpen(true)} title="Zones & tools">
          <span className="flag">{baseZone?.flag}</span>
          <span className="topbar__zone">{baseZone?.label}</span>
          <b>{now.setZone(settings.baseZoneId).toFormat("h:mm a")}</b>
        </button>
        <span className="topbar__brand">🌐 Zonely</span>
      </div>

      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <header className="app__header">
        <div>
          <h1>🌐 Zonely</h1>
          <p className="muted">
            Plan your day across time zones — every event shown in each place, with day
            rollovers made obvious.
          </p>
        </div>
      </header>

      <div className="layout">
        <aside className={"sidebar" + (drawerOpen ? " sidebar--open" : "")}>
          <div className="sidebar__drawerhead">
            <span>Zones &amp; tools</span>
            <button
              className="btn tiny ghost"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              ✕ Close
            </button>
          </div>
          <CollapsibleCard
            title="Your zones"
            open={openCards.zones}
            onToggle={() => toggleCard("zones")}
          >
            <ZonePicker zones={settings.zones} onChange={(zones) => updateSettings({ zones })} />
            <p className="muted small hint">Tap a zone to make it your base.</p>
            <ZoneBar
              zones={settings.zones}
              now={now}
              baseZoneId={settings.baseZoneId}
              onSetBase={(id) => updateSettings({ baseZoneId: id })}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Work hours"
            open={openCards.work}
            onToggle={() => toggleCard("work")}
          >
            <WorkBand
              zones={settings.zones}
              band={settings.workBand}
              date={selectedDate}
              onChange={(workBand) => updateSettings({ workBand })}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Find a time"
            open={openCards.meeting}
            onToggle={() => toggleCard("meeting")}
          >
            <MeetingFinder
              zones={settings.zones}
              baseZoneId={settings.baseZoneId}
              date={selectedDate}
              onCreateAt={handleCreateAt}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Convert a specific time"
            open={openCards.convert}
            onToggle={() => toggleCard("convert")}
          >
            <Converter
              zones={settings.zones}
              baseZoneId={settings.baseZoneId}
              date={selectedDate}
              time={convTime}
              onBaseZoneChange={(id) => updateSettings({ baseZoneId: id })}
              onDateChange={setSelectedDate}
              onTimeChange={setConvTime}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Trip"
            open={openCards.trip}
            onToggle={() => toggleCard("trip")}
          >
            <TripEditor
              trip={settings.trip}
              defaultDate={selectedDate}
              defaultZoneId={settings.baseZoneId}
              onChange={(trip) => updateSettings({ trip })}
            />
          </CollapsibleCard>

          <CollapsibleCard
            title="Sync across devices"
            open={openCards.sync}
            onToggle={() => toggleCard("sync")}
            accessory={
              sync ? (
                <span
                  className={"sync-badge sync-badge--" + syncStatus}
                  title={
                    syncStatus === "error" ? syncMessage : syncStatus === "syncing" ? "Syncing…" : "Synced"
                  }
                  aria-hidden="true"
                />
              ) : undefined
            }
          >
            <SyncCard
              connected={!!sync}
              status={syncStatus}
              message={syncMessage}
              lastSyncedAt={sync?.lastSyncedAt ?? 0}
              busy={syncBusy}
              onConnect={connectSync}
              onDisconnect={disconnectSync}
              onSyncNow={doPull}
            />
          </CollapsibleCard>
        </aside>

        <div className="main">
      <section className="card">
        <div className="card__head">
          <h2>Schedule</h2>
          <div className="toolbar">
            <div className="segmented">
              <button
                className={view === "day" ? "active" : ""}
                onClick={() => setView("day")}
              >
                Day
              </button>
              <button
                className={view === "week" ? "active" : ""}
                onClick={() => setView("week")}
              >
                Week
              </button>
              <button
                className={view === "month" ? "active" : ""}
                onClick={() => setView("month")}
              >
                Month
              </button>
            </div>
            <button
              className="btn ghost"
              onClick={shareData}
              title="Copy a link that loads this data on another device"
            >
              Share
            </button>
            <button className="btn ghost" onClick={exportData} title="Download a backup file">
              Export
            </button>
            <button
              className="btn ghost"
              onClick={() => fileInputRef.current?.click()}
              title="Restore from a backup file"
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={onImportFile}
              hidden
            />
            <button className="btn primary" onClick={openAdd}>
              + Add event
            </button>
          </div>
        </div>

        {notice && <div className="notice">{notice}</div>}

        <div className="dayctrls">
          <label className="inline">
            <span>Day</span>
            {view === "day" && (
              <button
                className="btn tiny ghost"
                onClick={() => shiftDay(-1)}
                aria-label="Previous day"
              >
                ‹
              </button>
            )}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            {view === "day" && (
              <>
                <button
                  className="btn tiny ghost"
                  onClick={() => shiftDay(1)}
                  aria-label="Next day"
                >
                  ›
                </button>
                <button
                  className="btn tiny"
                  onClick={() => setSelectedDate(todayInZone(settings.baseZoneId))}
                >
                  Today
                </button>
              </>
            )}
          </label>
          {leg && (
            <span className="tripbadge">
              {legFlag} You're in {leg.location}
              {settings.baseZoneId !== leg.zoneId && (
                <button
                  className="btn tiny ghost"
                  onClick={() => updateSettings({ baseZoneId: leg.zoneId })}
                  title={`Switch the base zone to ${leg.location} time`}
                >
                  Use {leg.location} time
                </button>
              )}
            </span>
          )}
        </div>

        {view === "day" ? (
          <DayView
            zones={settings.zones}
            baseZoneId={settings.baseZoneId}
            date={selectedDate}
            events={events}
            now={now}
            workBand={settings.workBand}
            onEditEvent={openEdit}
            onMoveEvent={handleMove}
            onCreateAt={handleCreateAt}
          />
        ) : view === "week" ? (
          <WeekView
            zones={settings.zones}
            baseZoneId={settings.baseZoneId}
            date={selectedDate}
            events={events}
            now={now}
            workBand={settings.workBand}
            onEditEvent={openEdit}
            onMoveEvent={handleMove}
            onCreateAt={handleCreateAt}
            onDateChange={setSelectedDate}
            onBaseZoneChange={(id) => updateSettings({ baseZoneId: id })}
            onOpenDay={(iso) => {
              setSelectedDate(iso);
              setView("day");
            }}
          />
        ) : (
          <MonthView
            zones={settings.zones}
            baseZoneId={settings.baseZoneId}
            date={selectedDate}
            events={events}
            now={now}
            onEditEvent={openEdit}
            onDateChange={setSelectedDate}
            onBaseZoneChange={(id) => updateSettings({ baseZoneId: id })}
            onOpenDay={(iso) => {
              setSelectedDate(iso);
              setView("day");
            }}
          />
        )}
      </section>
        </div>
      </div>

      <footer className="app__footer">
        <span className="muted small">
          Saved privately in this browser · times use official IANA zones (DST handled automatically)
        </span>
        <button className="btn tiny danger" onClick={clearAll} title="Delete everything and reset">
          Clear all data
        </button>
      </footer>

      {formOpen && (
        <EventForm
          zones={settings.zones}
          defaultDate={createDefaults?.date ?? selectedDate}
          defaultZoneId={createDefaults?.zoneId ?? settings.baseZoneId}
          defaultTime={createDefaults?.time}
          defaultDuration={createDefaults?.durationMin}
          editing={editing}
          editingRecurring={editingOcc?.isRecurring}
          onSave={handleSave}
          onDelete={handleDeleteFromForm}
          onCancel={closeForm}
        />
      )}

      {pending && (
        <ScopeDialog
          title={
            pending.kind === "delete"
              ? "Delete repeating event"
              : pending.kind === "move"
                ? "Move repeating event"
                : "Edit repeating event"
          }
          message="Apply this change to:"
          onPick={resolveScope}
          onCancel={() => {
            setPending(null);
            setEditingOcc(null);
          }}
        />
      )}

      <ReloadPrompt />
    </div>
  );
}

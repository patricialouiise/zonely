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
import { zoneById } from "./lib/zones";

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
  const [openCards, setOpenCards] = useState({
    zones: true,
    work: true,
    meeting: true,
    convert: true,
    trip: false,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

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

  return (
    <div className="app">
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
        <aside className="sidebar">
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
    </div>
  );
}

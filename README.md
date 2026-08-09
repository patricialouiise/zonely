# Zonely 🌐

A timezone planner for people who work across zones. Plan your day and see every
event — meetings, shifts, flights — in each place at once, with day rollovers made
obvious.

**Live:** https://timezone-planner-flame.vercel.app

Everything is stored privately in your browser (localStorage). No accounts, no
backend, nothing leaves your device.

## Features

- **Multiple zones (up to 5).** Pick any IANA timezone via a searchable picker
  (search by city or country). Live clocks, dates, and UTC offsets; tap a zone to
  make it your **base**. DST is handled automatically.
- **Convert a time.** Enter a date + time in one zone and see it everywhere, with
  clear "prev day / next day" badges when the calendar date differs.
- **Work-hours band.** Shade your working hours across every zone (incl. overnight
  rollovers), on the specific **weekdays** you choose.
- **Schedule — Day / Week / Month.**
  - **Day:** one column per zone; each column shows the event in its own local time,
    with a marker where that zone's date rolls over.
  - **Week:** Sun–Sat grid in your base zone; navigate weeks, click a day to open it.
  - **Month:** overview grid with colored event chips; click a day to jump in.
  - Overlapping events lay out **side-by-side** (Google-Calendar style), and a small
    right gap lets you click/long-press to add another event at the same time.
- **Events.** Add by clicking/dragging on the grid or the **+ Add event** button.
  Set start/end (any duration, crossing midnight OK), a color and opacity, and a
  cross-zone summary shows the span in every zone. Drag to reschedule; each card
  shows start → end and duration.
- **Recurring events.** Daily, every weekday, or weekly on chosen days, with an
  optional end date. Edits and deletes are scoped: **this event / this and
  following / all events** — just like Google Calendar.
- **Trip editor.** Add legs (location + zone + date range); the "You're in …" badge
  and one-click "Use … time" follow your itinerary.
- **Backup & reset.** Export/Import your data as JSON to move between devices, or
  Clear all to start fresh.
- **Sync across devices.** Turn on sync with a secret passphrase and your schedule
  stays in step between web and your installed app — pulls on open, pushes on change.
  It's **end-to-end encrypted** in the browser (PBKDF2 + AES-GCM); the server only
  ever stores ciphertext, never your passphrase or events. Type the same phrase on
  another device to connect it. Requires a Vercel KV / Upstash store (see below).
- **Share link.** One tap copies (or shares, via the native share sheet) a
  compressed link that loads your schedule on another device — open it there and
  Zonely offers to merge it in. No file, no account.
- **Installable (PWA).** Add it to your home screen / desktop and it opens like a
  native app and works **offline**. Data stays local per install (use Share or
  Export/Import to move it between devices).

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Build & deploy

```bash
npm run build      # type-checks then builds to dist/
```

It's a static site — deploy `dist/` anywhere. This one runs on Vercel; with the
Vercel CLI you can `vercel --prod` from the project root, or connect the GitHub repo
in the Vercel dashboard for automatic deploys on push.

## Sync setup (Vercel KV / Upstash)

Sync needs a tiny key/value store to hold the encrypted blobs. One-time setup:

1. In the Vercel dashboard, open the project → **Storage** → **Create** → a Redis
   (Upstash) / KV store, and **Connect** it to this project. Vercel injects
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment variables.
2. Redeploy (`vercel deploy --prod`) so the `api/sync` function picks up the vars.

That's it — no schema, no accounts. The function (`api/sync.ts`) is a dumb encrypted
key/value box; all crypto happens client-side (`src/lib/sync.ts`). Until a store is
connected, the app shows "Sync isn't set up on the server yet." and everything else
keeps working locally.

## Tech

Vite + React + TypeScript, [Luxon](https://moment.github.io/luxon/) for timezone math
(IANA zones, DST-aware). No backend, no tracking; state lives in `localStorage` and is
validated on load so a bad import can't break the app.

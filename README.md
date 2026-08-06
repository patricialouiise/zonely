# Timezone Planner 🕐

A small, private web app to see the same moment across up to 5 timezones — with
day-of-week and **day-rollover** made obvious. Built for a Philippines → Vancouver →
Toronto trip while keeping a 2 PM – 10 PM PHT work block.

## Features

- **Live zone bar** — current time/date/offset for Manila, Vancouver, Toronto (add/remove up to 5).
- **Convert a specific time** — pick a date + time in one zone, see it everywhere, with
  "prev day / next day" badges when the calendar date differs.
- **Work hours band** — shows where your 2–10 PM PHT block lands in every zone
  (e.g. Vancouver 11 PM–7 AM, Toronto 2–10 AM), including overnight rollover.
- **Schedule (Google-Calendar style)** — add events manually in any zone; view them as:
  - **Day** — a per-zone hour grid (one column per timezone).
  - **Week** — a 7-day calendar laid out in your base zone, with clickable day headers
    that jump into the Day view; navigate weeks with ‹ ›.
  - **List** — each event once, converted across every zone.

  **Drag any event block to reschedule it** — drag vertically (Day or Week) to change
  the time in 15-minute steps, or horizontally in Week view to move it to another day.
  Click an event to edit or delete it.

  Saved privately in your browser (localStorage) — nothing leaves your device.

- **Backup (Export / Import)** — since data is per-browser, use **Export** to download a
  JSON backup of all events + settings, and **Import** on another device/browser to restore
  them (imported events merge by id). Handy for moving between your laptop and phone.
- **Trip awareness** — knows where you are on a given date and can set that as the base zone.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Vercel

The app is a static site — Vercel auto-detects Vite (build `npm run build`, output `dist/`).

**Option A — CLI (fastest):**

```bash
npm i -g vercel
vercel        # first run: logs you in + links the project
vercel --prod # deploy to your production URL
```

**Option B — GitHub + Vercel dashboard:**

1. Push this folder to a GitHub repo.
2. In the Vercel dashboard: **Add New → Project → Import** the repo.
3. Framework preset **Vite** is detected automatically. Click **Deploy**.

You'll get a private URL you can open from any device while traveling.

## Editing your trip

Trip dates and locations live in [`src/lib/itinerary.ts`](src/lib/itinerary.ts) — edit
there if plans change.

## Later: Google Calendar (Phase 2)

Deferred by choice. The safe options when you're ready:

- **Read-only Google sign-in** (`calendar.readonly`) via Google Identity Services, token
  held client-side — nothing stored on any server.
- **`.ics` import** — export from Google Calendar and drag the file in. No login at all.

## Tech

Vite + React + TypeScript, [Luxon](https://moment.github.io/luxon/) for timezone math
using IANA zone names (DST handled automatically). No backend, no accounts, no tracking.

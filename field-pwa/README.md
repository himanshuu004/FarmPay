# Allied KCC — Field PWA

The CIA (Cattle Induction) field app for **Route Supervisor** and **Vet** —
one shared shell, role-gated views (CLAUDE.md: *"ONE offline-capable field
PWA ... role-gated views, never shared screens"*). Separate app from the
farmer Flutter app and the (future) back-office dashboard, but talks to the
**same backend** — one source of truth across all three.

Covers the 4 screens in `prototypes/wireframes.html`'s Field PWA section:
task list → supervisor verification → vet exam & valuation → post-purchase
inspection → offline sync queue.

## Run it locally

```bash
npm install
npm run dev -- --port 5180
```

Open the printed `http://localhost:5180/` in a browser. To test on a real
phone on the same Wi-Fi, add `--host` and use the printed network URL.

By default it talks to the live pilot backend
(`https://farmpay-1l94.onrender.com`). To point at a local backend instead,
create `.env.local`:

```
VITE_API_BASE_URL=http://localhost:3000
```

## Test logins

Two staff accounts exist on the live pilot backend today:

| Role | Mobile | MPIN |
|---|---|---|
| Route Supervisor | 9811100001 | 4521 |
| Vet | 9811100002 | 7734 |

These were created via a pilot-only `role` param on `/auth/register`,
gated by the `SHOW_DEV_OTP` flag already used for the OTP-echo pilot
convenience — see `authService.js`'s `PILOT_SELF_REGISTERABLE_ROLES`.

## Installing as a PWA on a phone

Open the URL in Chrome (Android) or Safari (iOS), then "Add to Home
Screen." No `.apk` — it's a website that behaves like an app once
installed (see the in-chat explanation of what PWA means if this is new).

## Architecture notes

- **Offline queue**: only supervisor **verification** submissions are
  queued in IndexedDB (`src/offline/db.ts`) and idempotently replayed via
  `POST /cattle-induction/field/sync`. Vet-exam and inspection submissions
  are NOT queued — the backend's `/field/sync` endpoint only knows how to
  replay verification ops today (see `verificationService.sync`'s doc
  comment), so those two screens simply disable "Submit" while offline
  rather than risk a duplicate/lost write with no idempotent replay path.
- **Camera capture**: live-capture only via `<input capture="environment">`
  (Convention 9/25/32) — no gallery picker. This is the standard web
  pattern for forcing the camera on mobile browsers; it's not as hard a
  guarantee as a native camera plugin, but reliably opens the camera app
  on the real target device (a phone in the field).
- **Evidence upload**: a field-scoped endpoint
  (`/cattle-induction/field/evidence/:appUuid`), not the farmer-owned CIA
  evidence endpoint — a Supervisor/Vet is never the application's owner,
  so the farmer-ownership check would always 403 them.

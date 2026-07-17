# Allied KCC — Flutter app

Full Flutter rebuild of the Allied KCC farmer app (iOS + Android). The backend
(`/backend`, Node/Express + PostgreSQL) is unchanged and treated as a fixed
REST API — see the repo root [`CLAUDE.md`](../CLAUDE.md) for domain rules and
[`FLUTTER-CONVERSION-PRD.md`](../FLUTTER-CONVERSION-PRD.md) for the full spec.

## Status

Delivered in six phases (see PRD §6), each a demoable vertical slice against
the real backend:

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation — auth, design system, API client, offline queue, i18n, shell | ✅ |
| 2 | Coop wedge — milk passbook, ordering, receipts | ⏳ |
| 3 | Dairy logbook + registers | ⏳ |
| 4 | KCC — calculator, application, drawdown, renewal pack | ⏳ |
| 5 | Pashu Suraksha (insurance) | ⏳ |
| 6 | CIA (Cattle Induction Application) | ⏳ |

## Getting started

Requires Flutter 3.44+ (stable channel) and, for iOS/macOS builds, Xcode +
CocoaPods (`brew install cocoapods`).

```bash
flutter pub get

# Generate localization sources (lib/l10n/generated/) and drift's .g.dart files
flutter gen-l10n
dart run build_runner build --delete-conflicting-outputs

# Run against the pilot backend (live on Render, see repo root
# IMPLEMENTATION-PROMPT.md for details)
flutter run --dart-define=FLAVOR=dev \
  --dart-define=API_BASE_URL=https://farmpay-1l94.onrender.com
```

Any time you edit an `.arb` file under `lib/l10n/` or a `@DriftDatabase`
table, re-run the two generator commands above.

## Environment / flavors

No API URLs or secrets are hardcoded — everything comes from `--dart-define`
(see `lib/core/env/env.dart`):

| Flag | Purpose | Example |
|---|---|---|
| `FLAVOR` | `dev` \| `staging` \| `prod` | `dev` |
| `API_BASE_URL` | Backend root, **without** `/api/v1` | `https://farmpay-1l94.onrender.com` |

The Render pilot backend's free tier sleeps after 15 minutes idle (30-50s
cold start on the next request) — this is expected, not a bug.

## Architecture

- **State management**: Riverpod, throughout — no mixed patterns.
- **Navigation**: `go_router`, route names mirror the RN app's Expo Router
  paths (`/kcc-apply` → `/kcc`, etc.) so any existing deep links/notification
  payloads keep working.
- **API client** (`lib/core/api/api_client.dart`): mirrors
  `app/lib/api.ts` exactly — same base-URL construction, same
  bearer-token + auto-refresh-on-401 behavior, same `x-aadhaar-token`
  step-up header handling for DICE (Tier-2) endpoints. Never invents new
  DTOs — responses are the backend's raw `{success, data, message,
  errorCode}` shape.
- **Offline queue** (`lib/core/offline/`): drift/SQLite-backed, mirrors
  `app/lib/offlineQueue.ts`'s `QUEUED_LOCAL → SYNCING → SYNCED | CONFLICT |
  FAILED` state machine 1:1, flushing idempotently to `POST /api/v1/sync`.
  Conflicts are surfaced to the farmer (server-wins + notify), never
  silently dropped.
- **Design system** (`lib/design_system/`): tokens lifted directly from
  `/prototypes`' CSS custom properties (brand green, status colors,
  card/radius/spacing) — the settled UI/UX spec. Every screen consumes
  these tokens; no per-screen color/spacing literals.
- **Feature modules** (`lib/features/{auth,coop,logbook,kcc,insurance,cia}/`):
  each has `screens/`, `widgets/`, `models/`, `providers/`, `api/`.
- **i18n**: Hindi (default) + English via Flutter's standard `gen-l10n`
  tooling (`lib/l10n/app_en.arb` / `app_hi.arb`). No hardcoded strings in
  widgets — every user-facing string is an `AppLocalizations` key.

## Non-negotiables (enforced throughout, not just described)

- No password fields anywhere — MPIN (4-digit) + OTP + JWT + Aadhaar
  step-up only.
- Statutory numbers (KCC limits, insurance premiums, subsidy amounts) are
  never computed client-side — only the backend's response is rendered,
  formatted (not recomputed) via `formatRupees()`.
- CIA ear-tag/animal/geo evidence capture is camera-only — the gallery/photo
  picker is technically blocked, not just discouraged by copy — and
  EXIF/GPS are preserved lossless.
- Voice-captured logbook entries always show a confirm screen before saving.
- Status screens render exactly the state machines defined in `CLAUDE.md` —
  no invented UI-only states.

## Testing

```bash
flutter analyze
flutter test
```

`test/` mirrors the `lib/` feature structure. Widget tests cover
state-machine status rendering; `test/core/offline_queue_test.dart` covers
the offline-queue idempotency contract (each `enqueue()` gets a distinct
`opUuid`, writes are `QUEUED_LOCAL` with no network call).

## Project layout

```
lib/
  core/            # API client, secure storage, offline queue, env, utils
  design_system/   # tokens, theme, shared widgets
  routes/          # go_router config
  l10n/            # app_en.arb, app_hi.arb (+ generated/ — gitignored, gen-l10n output)
  features/
    auth/          # login, register, forgot-mpin, aadhaar step-up
    coop/          # milk passbook, ordering (Phase 2)
    logbook/       # dairy registers, voice logging (Phase 3)
    kcc/           # calculator, application, drawdown (Phase 4)
    insurance/     # Pashu Suraksha (Phase 5)
    cia/           # Cattle Induction Application (Phase 6)
    shell/         # bottom-tab shell
    home/          # home tab
test/              # mirrors lib/
```

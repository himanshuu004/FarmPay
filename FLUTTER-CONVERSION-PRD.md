# Allied KCC — Flutter Rebuild PRD

## 0. How to use this document
This PRD is written to be handed to Claude (or any AI coding agent) as the spec for rebuilding the Allied KCC **mobile app** in Flutter. It assumes:
- The existing **Node.js/Express + PostgreSQL backend is kept as-is** and treated as a fixed REST API contract (do not rewrite backend business logic; only add/adjust endpoints if the Flutter client genuinely needs something the RN app didn't).
- The existing React Native/Expo app (`/app`) is the **functional reference implementation** — read its screens/lib files to recover exact business behavior before rebuilding each screen. This PRD describes *what* must exist; the RN code is the ground truth for exact field names, validation, and API payloads where this document is silent.
- The `/prototypes` folder is the **design/UX reference** and takes priority over both this PRD and the RN app for visual layout, copy, and interaction flow. Per `CLAUDE.md`'s own convention ("P0 prototype rule: settled prototypes are the spec"), every screen was first built as a clickable HTML mockup before any app code — these are not throwaway sketches, they're the settled spec. Open `prototypes/index.html` (the launcher) and `prototypes/mobile-app.html` (all farmer screens re-hosted inside a real phone frame, in flow order) before building each screen group. See §3.1 for the exact file-to-screen mapping.
- The rebuild's goal is not just parity — it is parity **plus** materially better UI/UX polish, since that is the explicit reason for the rewrite. Treat the prototypes as the *baseline* to exceed, not to redesign from scratch — reproduce their information architecture, screen flow, and copy exactly; the UI upgrade comes from rebuilding those same layouts with real Flutter design polish (proper typography, spacing, motion, componentry) rather than from a separate design tool. **For the time being, `/prototypes` is the sole UI/UX source — do not use or reference a separately generated design (e.g. Google Stitch) for this build.**

**Priority order when sources conflict:** `CLAUDE.md` (business rules/compliance) > `/prototypes` (screen layout, copy, flow) > `/app` React Native code (API wiring, field names, validation) > this PRD (structure/checklist). This PRD is the map; those three are the territory.

Read `CLAUDE.md` at the repo root first — it is the authoritative architecture/domain reference and takes precedence over this document on any conflict.

---

## 1. Product Summary

Allied KCC is a farmer-facing platform for members of a dairy cooperative (UCDF/Aanchal, Uttarakhand) that bundles:

1. **Digital farm logbook** — voice-first herd + money record-keeping (dairy, goatery, poultry), offline-capable, becomes the underlying credit file.
2. **KCC (Kisan Credit Card) for allied activities** — RBI-compliant subsidized credit-limit calculator, eligibility check, application, limit dashboard, long-term ("LT") drawdown for animal/shed/equipment purchases, and an auto-generated renewal pack (this **is** the banker-facing interface in v1 — no banker dashboard).
3. **Pashu Suraksha (livestock insurance)** — NLM-compliant per-animal insurance: tagging, quoting, enrolment, policy vault, renewal, claims.
4. **Cooperative module (the "wedge")** — milk passbook (auto-populated from the co-op ERP, zero data entry), input-item ordering against a 70%-of-payables credit limit, order status tracking, receipt confirmation.
5. **Cattle Induction Application (CIA)** — a separate loan-cum-subsidy programme for buying a milch animal: scheme browsing, eligibility, expression of interest, application, guided purchase flow, EMI ledger (deducted from milk payments), claims, grievances.

**Primary persona (v1 GTM):** a UCDF dairy-society member farmer in Uttarakhand. Non-members are supported (manual/voice logbook, calculator, "join society" nudge) but are the acquisition funnel, not the primary flow.

**Product thesis:** the logbook is the credit file. Sequence of value: milk passbook habit → input ordering → KCC → insurance.

---

## 2. Non-negotiable domain rules (must be reproduced exactly)

These are compliance-critical and must not be approximated. Full detail is in `CLAUDE.md` and the golden-source docs (`kcc_composite.txt`, `INSURANCE-SYSTEM-DESIGN.md`, `Input Service App.pdf`, `CATTLE-INDUCTION-APP-PRD.md`, `revised_nlm_guidelines.pdf`); all of the actual math executes **server-side** — the Flutter app only renders and submits, never computes statutory numbers itself.

- **KCC Limit Engine**: `WC_total = Σ(SoF × units) + 10% consumption (once) + 20% maintenance + Σ insurance premiums`; `MPL(n) = round_to_1000(MPL(n-1) × 1.10)`; `CMPL = MPL(6) + LT investment items`. The app must display these numbers exactly as returned by `/kcc/calculate` — never reformat/round client-side.
- **NLM livestock insurance**: beneficiary pays 15%, govt 85% (state-split varies); premium ceilings by tenure; 10 cattle-unit household cap; 12-digit ear tag (`^\d{12}$`) + RFID + 2 photos; claims need exactly 4 documents, 21-day waiting period, 15-day settlement SLA with visible countdown, 12% p.a. penal interest on SLA breach — this clock must be farmer-visible in the UI.
- **Coop input ordering**: order limit = 70% of outstanding milk payables minus in-flight orders; ordering only allowed in 1st/3rd week of the month (windowed); **all approval happens in the external ERP, never in-app** — the app only ever submits an order and confirms receipt; every other status (secretary/supervisor approval, dispatch) is a read-only mirror synced from the ERP and must be labeled with an honest "as of [sync timestamp]" freshness indicator, especially since ERP sync can run in a degraded daily-filedrop mode.
- **CIA**: full traceability chain farmer→application→sanction→animal→seller→transport→insurance→payout→EMI is FK-enforced server-side; a payment step is only shown as reachable in the UI once vet certification + transit & cattle insurance + farmer acknowledgment all exist server-side. Ear-tag capture must be **camera-only** (block gallery/photo-library picker) and geo-tagged. EMI ledger shows due/deducted/remitted/pending/partial/overdue/default states.
- **Auth**: MPIN (4-digit) + OTP + JWT + Aadhaar step-up for sensitive actions. **Never build a password field.**
- **State machines**: reproduce the state machines in `CLAUDE.md` exactly for UI status displays (KCC application, LT drawdown, coop order, CIA application, CIA purchase, CIA EMI, claim, policy, voice draft, offline queue item). Status badges/timelines in the UI should map 1:1 to these enums — don't invent intermediate UI-only states.
- **Voice drafts never auto-commit** — any voice-captured log entry must show a confirm screen before it is saved.
- **Offline-first is a hard requirement**, not a nice-to-have — logbook, receipts, evidence capture, and the CIA field-verification-adjacent farmer screens must fully function with no network, queue locally, and sync idempotently with server-wins-plus-notify conflict handling.

---

## 3. Screen inventory (rebuild target)

Source of truth for the current set: `/app/app/*.tsx` (53 screens, ~8,100 LOC) + `/app/app/(tabs)/*` (bottom-tab shell: home, farm, kcc, society, suraksha).

Group screens exactly as the current app does — this grouping is also how you should structure the Flutter route/module folders:

| Group | Screens | Notes |
|---|---|---|
| **Shell / tabs** | index (home), farm, kcc, society, suraksha | Bottom nav shell; home = passbook summary + limit card + renewal-due hero + advisory + society/join-nudge card |
| **Auth** | login, register, forgot-password, aadhaar-verify | MPIN+OTP, no passwords |
| **Activity setup/onboarding** | activity-dairy, activity-goatery, activity-poultry, setup-dairy, setup-goatery, setup-poultry, dairy-onboarding | Multi-activity subscription model |
| **Dairy registers/logbook** | dairy-animals, dairy-breeding, dairy-log-cost, dairy-log-revenue, dairy-logbook, dairy-pnl, dairy-treatment | Voice-first logging, persistent mic affordance |
| **KCC** | kcc-calculator, kcc-eligibility, kcc-apply, kcc-limit, kcc-drawdown, kcc-pack | Renewal pack = PDF generation trigger, not a live banker dashboard |
| **Pashu Suraksha (insurance)** | pashu-home, pashu-animals, pashu-quote, pashu-enrol, pashu-vault, pashu-renew, pashu-claim | Policy vault delivers to farmer directly, never "parked" anywhere else |
| **Society/coop** | society-passbook, society-order, society-orders | 70%-limit meter + voice ordering; passbook is the daily-pull surface |
| **CIA (Cattle Induction)** | cia-scheme, cia-schemes, cia-eligibility, cia-eoi, cia-application, cia-status, cia-loan, cia-purchase, cia-emi, cia-emi-consent, cia-claim | Full loan-cum-subsidy lifecycle; consent screen is legally load-bearing — do not simplify its copy/flow |

### 3.1 Prototype-to-screen mapping (open these before building each screen)

The `/prototypes` folder is organized by module, each as a self-contained clickable HTML file/mini-app. Open the matching file for a screen group *before* building it in Flutter — it has the settled copy, field layout, and click-through flow.

| Screen group | Prototype file(s) | Internal screens (where single-file) |
|---|---|---|
| Society/coop | `prototypes/society/index.html` | passbook, catalog (order), orders (timeline), receipt |
| KCC | `prototypes/kcc/index.html` | s-calc (calculator), s-elig (eligibility), s-apply (application), s-limit (limit dashboard), s-draw (drawdown), s-pack (renewal pack) — plus live TRUST-score and limit-math widgets (`wc`, `mpl1`, `cmpl`, `tscore`, `tband`, `sched`) worth reading directly since they encode the exact Illustration-1B math from `kcc_composite.txt` |
| Pashu Suraksha (insurance) | `prototypes/insurance/index.html` | s-home, s-quote, s-enrol, s-renew, s-claim — plus premium/sum-insured calc widgets (`ceil`, `si`, `term`, `species`, `tag`) |
| CIA — farmer screens | `prototypes/cattle-induction/farmer-*.html` (scheme, eligibility, eoi, application, status, loan-status, purchase, insurance, emi-schedule, emi-ledger, emi-consent, claim) | One file per screen — these map close to 1:1 with the `cia-*` group in the table above |
| CIA — farmer purchase sub-flow | `prototypes/cattle-induction/farmer-purchase.html` | Guided purchase hub (seller, vet exam, transit, insurance, acknowledge sub-steps) |
| Integrated mobile shell reference | `prototypes/mobile-app.html` | **Open this one first** — it re-hosts every farmer/field prototype inside an actual phone frame in flow order, with a persona switcher; the fastest way to see the whole farmer journey end-to-end before decomposing it into Flutter routes |
| Out of scope for this rebuild | `prototypes/cattle-induction/{dcs-selection, duss-inbox, bank-sanction, field-*, finance-payment-gate, ucdf-*}.html` | Back-office/field-PWA personas (DCS, DUSS, Bank, UCDF, Route Supervisor/Vet) — confirmed out of scope per §3, listed here only so you don't accidentally build them |

**Not yet screens but referenced in the wider PRD (`CATTLE-INDUCTION-APP-PRD.md`) as v1+ scope for the farmer app** — confirm with the client whether these ship in the Flutter v1 or stay backlog: grievance filing UI, "assisted mode" for CIA. Do not build the DCS/DUSS/bank/UCDF/field-PWA surfaces — those are separate web/PWA products out of scope for this mobile rebuild.

---

## 4. Non-functional / platform requirements

- **Offline-first**: local write queue for logbook entries, receipt confirmations, and evidence capture; idempotent sync; conflict resolution = server-wins with a visible farmer notification, never silent overwrite. Recommend `drift`/`sqflite` for local persistence + a sync-queue worker, mirroring the current `app/lib/offlineQueue.ts` semantics.
- **Voice input**: Hindi-first ASR (backend proxies to Bhashini/AI4Bharat — the app just records/streams audio and renders the returned transcript + confirm card). Persistent mic affordance on logbook screens.
- **OCR**: for tag/document capture (ear tags, quotations, KYC docs) — backend performs OCR; app is responsible for high-quality live capture (see below) and optional on-device pre-crop/QC.
- **Live-capture-only camera** for CIA ear-tag/geo evidence and animal photos — the photo picker/gallery must be technically blocked, not just discouraged by copy, and EXIF/GPS must be preserved.
- **Biometric**: device-level biometric unlock (Face/Touch ID equivalent) as an app-lock convenience layer — this is separate from the muzzle-biometric animal-identity feature, which is a backend/CV concern the app only surfaces as a capture flow.
- **i18n**: Hindi + English minimum (current app has `app/lib/i18n.tsx` + `app/lib/strings/`); design all copy to be translated, no hardcoded English strings in widgets.
- **Auth**: MPIN entry UI, OTP entry UI, JWT storage in secure storage, Aadhaar step-up flow for sensitive actions (large drawdowns, policy transfer, etc. — confirm exact trigger list against backend).
- **Accessibility**: this is a rural, variable-literacy user base — prioritize large tap targets, icon+text (never icon-only for primary actions), high-contrast status colors, and voice as a first-class input method, not an accessibility afterthought.
- **Performance**: target low/mid-range Android devices as the primary hardware profile (this is the dominant real-world device class for this persona), not high-end iOS — optimize accordingly (image sizes, list virtualization, avoid heavy animation on entry screens).
- **Platforms**: iOS + Android from one Flutter codebase; no platform-specific screens expected beyond standard permission-prompt handling (camera, mic, location, notifications).

---

## 5. Architecture for the Flutter rebuild

- **API layer**: single typed HTTP client wrapping the existing REST API (`/api/v1/...` routes per `CLAUDE.md`'s route-mounting table). Mirror `app/lib/api.ts` and `app/lib/ciaApi.ts` request/response shapes exactly — do not invent new DTOs; camelCase JSON in, camelCase Dart models out.
- **State management**: pick one and use it consistently across the whole app (Riverpod recommended for testability and offline-sync-friendly reactive state; Bloc is an acceptable alternative if the team is more familiar with it) — do not mix patterns screen-to-screen.
- **Navigation**: `go_router` with named routes mirroring the current Expo Router path names (`/kcc-apply`, `/cia-status`, etc.) so deep-linking and any existing notification payloads keep working.
- **Local persistence**: `drift` (SQLite) for the offline write queue + cached passbook/status data (`society:passbook`, `cia:app:status`, etc. — mirror the Redis cache-key freshness windows noted in `CLAUDE.md`'s Async Infrastructure section, e.g. passbook cache ~30m, so the UI should show a "last updated Xm ago" honestly).
- **Folder structure**: mirror the screen groups in section 3 as feature modules (`lib/features/kcc/`, `lib/features/cia/`, `lib/features/coop/`, `lib/features/insurance/`, `lib/features/logbook/`, `lib/features/auth/`), each with `screens/`, `widgets/`, `models/`, `providers|blocs/`, `api/`.
- **Design system**: a single shared `lib/design_system/` (tokens: color, type scale, spacing, status-badge colors mapped to the state-machine enums in section 2) consumed by every feature module — this is what makes the "enhanced UI" goal achievable without visual drift screen-to-screen. Derive these tokens directly from `/prototypes` (its CSS custom properties — brand green, amber/red/blue status colors, card/radius/spacing conventions — are already a settled, consistent system across every prototype file) rather than from a separate design tool. Lock the tokens first, then build screens against them.
- **Testing**: widget tests per screen for state-machine status rendering (e.g., every CIA application status renders the correct badge/copy/available-actions), and integration tests for the offline-queue → sync → conflict-resolution path, since that's the highest-risk-of-regression area.

---

## 6. Delivery plan

Recommend delivering in the same order as the product's own value sequence (`CLAUDE.md` §Build Phases), since each phase is independently demoable to the client and lets you validate the API contract incrementally rather than big-bang:

1. **Foundation**: auth (MPIN/OTP/Aadhaar), app shell/tabs, design system, API client, offline-queue infra, i18n scaffolding.
2. **Coop wedge**: milk passbook, input ordering + 70% meter, order timeline, receipt confirmation. (Highest-value, lowest-complexity screen group — good first full vertical slice.)
3. **Dairy logbook + registers**: voice-first logging, P&L, breeding/treatment records.
4. **KCC**: calculator, eligibility, application, limit dashboard, drawdown, renewal pack.
5. **Pashu Suraksha**: animal tagging, quote, enrol, vault, renew, claim.
6. **CIA**: scheme browsing → EOI → application → purchase flow → EMI ledger → claim/grievance. (Largest, most state-machine-heavy group — do last so the design system and offline patterns are already proven.)

At the end of each phase: run it against the real backend (already deployed/running per `GETTING-STARTED.md`), not mocks, and compare screen-by-screen against the current RN app for behavioral parity before considering that phase done.

---

## 7. Acceptance criteria (definition of done for the rebuild)

- Every screen in section 3 exists in Flutter, is wired to the real backend, and reproduces the state machines/domain math in section 2 exactly (verify against backend responses, never hardcode).
- App is fully usable offline for logbook entry, receipt confirmation, and evidence capture, with correct queue → sync → conflict UX.
- No password field anywhere. No gallery picker on CIA evidence/ear-tag capture. No client-side recomputation of statutory limit/premium numbers.
- Hindi + English both fully supported, no hardcoded strings.
- Runs acceptably on a representative low/mid-range Android device, not just a simulator/high-end phone.
- Visual design is a clear improvement over the current RN app's screens (this is the explicit reason for the rewrite) while staying consistent with the design-system tokens across all six feature modules.

---

## 8. Tech stack & deployment plan

Two deployment targets: a **pilot** (fast, free/cheap, good enough to demo to the client and validate the product) and **production** (post client approval, sized for a large real user base). The backend application code and Flutter app code do **not** change between the two — only infrastructure/hosting choices and environment config change. This is intentional: nothing built for the pilot is throwaway.

### 8.1 Pilot stack

| Piece | Choice | Cost | Why |
|---|---|---|---|
| Frontend | Flutter app (this PRD), distributed via TestFlight (iOS) + Play Internal Testing or direct APK (Android) | Free, except mandatory $99/yr Apple Developer account for iOS distribution | No app-store review needed for a client demo |
| Backend API | Existing Node/Express app, unchanged, containerized via the repo's existing `deploy/Dockerfile` | Free tier | Business logic (KCC math, insurance rules, CIA state machines, ERP adapter) stays untouched |
| Backend hosting | **Fly.io** | Free allowance (always-on small VM, no cold-start delay during a live demo) | Deploys straight from the existing Dockerfile |
| Database + object storage | **Supabase** (Postgres + pgvector + PostGIS + S3-compatible storage bucket) | Free tier | Drop-in Postgres — existing Sequelize migrations run unmodified; also covers evidence/KYC file storage |
| Redis | **Upstash** (serverless Redis) | Free tier | Drop-in replacement for `ioredis` config; no server to manage |
| RabbitMQ / outbox | Skipped for pilot — `outboxRelayJob.js` runs in-process on schedule instead of against a real broker | Free | Not needed at pilot scale; add CloudAMQP free tier later only if real async decoupling is needed pre-production |
| Error tracking | **Sentry** free tier | Free | Catches crashes before the client does |
| CI/CD | Manual `fly deploy`, or GitHub Actions once that becomes annoying to do by hand | Free | Automate only once it's worth it |
| Domain/TLS | Fly.io's provided `*.fly.dev` subdomain + auto HTTPS | Free | No need to buy a domain for an internal pilot |

**Pilot deployment steps:**
1. `git init` the repo and commit the current state (no version history currently exists — do this before anything else).
2. Supabase: create project, enable `vector`, `postgis`, `pgcrypto`, `uuid-ossp` extensions, run existing Sequelize migrations against it (`npx sequelize-cli db:migrate`), create a storage bucket for evidence/KYC files.
3. Upstash: create a free Redis DB, grab `REDIS_URL`.
4. Fill in `.env` from `.env.example` with the Supabase `DATABASE_URL`, storage keys, and `REDIS_URL`.
5. Deploy backend to Fly.io: `fly launch --dockerfile deploy/Dockerfile --no-deploy` (skip Fly's own Postgres provisioning), `fly secrets set ...` for env vars, `fly deploy`.
6. Point the Flutter app's API base URL at the resulting `https://<app>.fly.dev`.
7. Build and distribute: Android via `flutter build apk` or Play Console Internal Testing; iOS via `flutter build ipa` → TestFlight.
8. Smoke test the full app end-to-end against the real Supabase-backed API before the client sees it.

### 8.2 Production stack (post client approval, large-audience scale)

| Piece | Choice | Why |
|---|---|---|
| Frontend | Same Flutter app → real App Store + Play Store release; CI build pipeline (Codemagic or GitHub Actions + Fastlane) | Standard release hygiene at scale |
| Backend | Same Express app, containerized, run on managed compute (AWS ECS/Fargate or GCP Cloud Run to start; Kubernetes only if/when multi-service orchestration is actually needed) | Move off a single always-on VM once uptime/scale matters |
| Database | Managed Postgres in an **India region** (AWS RDS `ap-south-1` or GCP Cloud SQL Mumbai) with pgvector + PostGIS, read replica once load requires it | DPDP data-residency requirement (`CLAUDE.md` — Indian-region storage for biometric/PII data); migration from Supabase is a plain `pg_dump`/`pg_restore` since both are Postgres |
| Cache | Managed Redis (ElastiCache / Memorystore), India region | Matches the cache-key strategy already designed in `CLAUDE.md`'s Async Infrastructure section |
| Queue | Managed RabbitMQ (Amazon MQ) or migrate the existing outbox pattern to SQS/Pub/Sub if RabbitMQ ops become a burden | The outbox-relay code already exists — only needs a durable broker behind it |
| Object storage | S3-compatible, India region (AWS S3 `ap-south-1`) | Evidence photos, KYC docs, biometric captures must stay in-region |
| Secrets/config | AWS Secrets Manager / GCP Secret Manager, not `.env` files | Handling Aadhaar + financial data at scale |
| CI/CD | GitHub Actions: build → test → migrate → deploy, staged (dev → staging → prod) | No manual deploys once real users depend on uptime |
| Monitoring/alerting | APM + Sentry + uptime checks + explicit monitoring on the SLA-clock jobs (claim settlement, penal interest) | These are compliance-critical timers — they must not silently fail |
| AI services | Stand up the Python/FastAPI `ai-services` layer `CLAUDE.md` describes (voice/OCR/vision) — doesn't exist yet | Needed once voice-logging and muzzle-ID features go live for real users |

**Trigger for moving pilot → production infra:** (a) the client has approved moving forward, and (b) the open data-residency/hosting-location question in `docs/CIA-OPEN-QUESTIONS.md` has an actual legal answer — that answer determines which cloud/region is even permissible, not just which is technically preferable. Don't over-invest in production-grade infra before both are true.

---

## 9. Project setup — where the Flutter code lives

**Do all Flutter development in a new, dedicated folder at the repo root — never inside `/app` (that folder is the React Native reference implementation and must stay untouched and readable throughout the rebuild) and never scattered into other existing folders.**

- Create `/flutter_app` at the repo root as the single home for all new Flutter code. Nothing else (backend, prototypes, RN app, docs) moves or gets restructured.
- Inside `/flutter_app`, structure it like a real company-grade production app, not a tutorial project — specifically:
  - Standard Flutter project scaffold (`android/`, `ios/`, `lib/`, `test/`, `pubspec.yaml`) generated via `flutter create`, not hand-assembled.
  - `lib/` organized by feature per §5 of this PRD (`lib/features/{auth,coop,logbook,kcc,insurance,cia}/`, each with `screens/`, `widgets/`, `models/`, `providers/` (or `blocs/`), `api/`), plus a shared `lib/design_system/`, `lib/core/` (API client, offline queue, secure storage, i18n setup), and `lib/routes/` (`go_router` config).
  - `test/` mirroring the `lib/` feature structure (widget tests + offline-sync integration tests, per §5).
  - Environment config via `--dart-define` / flavor files (`dev`, `staging`, `prod`) — no hardcoded API URLs, matching the pilot/production split in §8.
  - Standard hygiene from day one: `.gitignore` for build artifacts, `analysis_options.yaml` with lint rules enabled (not defaults-only), a `README.md` explaining how to run/build/deploy, and CI config (`.github/workflows/`) once §8.1 step "automate once it's worth it" is reached.
- Treat `/flutter_app` as the deliverable you'd hand to another engineering team cold — someone should be able to clone the repo, read `/flutter_app/README.md`, and get the app running without needing to ask you anything.

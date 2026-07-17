Implement the Allied KCC Flutter mobile app end-to-end, in full, to a production-ready standard.

## Repo state

Git is initialized on `main`, remote `origin` is set to `https://github.com/himanshuu004/FarmPay.git`, and the baseline is pushed. Continue committing there — don't force-push, don't rewrite history, don't run destructive git commands without asking first.

## Pilot infra status — already done, don't redo this

- **Supabase**: a live project is provisioned and all 22 Sequelize migrations have already been run against it successfully (pgvector + PostGIS extensions enabled, every module's tables exist). Connection details are already in `backend/.env` (git-ignored) — `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` point at Supabase's **Session Pooler** endpoint (chosen deliberately over Direct Connection, since Direct Connection is IPv6-only on Supabase's free tier and our hosting needs IPv4). `DB_SSL_REJECT_UNAUTHORIZED=false` is also set and required — Supabase's pooler presents a cert chain Node won't validate by default under strict mode; this is intentional, not a bug to "fix" by reverting it. The backend has been confirmed booting locally against this database (`/health` returns `200 {"status":"ok",...}`).
- **Redis**: intentionally not wired up yet for the pilot — the app runs without it (logs reconnect errors on startup, which is expected noise, not a crash). Don't spend time fixing this unless asked.
- **Backend hosting**: deploying to **Render** (not Fly.io/Koyeb — both were ruled out: Fly.io needs a credit card, Koyeb was mid-acquisition by Mistral AI with a broken-looking dashboard at the time this was evaluated). Render's free tier needs no card but sleeps after 15 min idle (30-50s cold start on first request after sleep) — acceptable for a pilot demo, revisit for production.
- **OTP**: using the backend's existing mock/dev behavior — `[DEV] OTP for <number>: <code>` is printed to server logs when `NODE_ENV` isn't `production`. No real SMS provider is wired up; this is deliberate for the pilot, not a gap to fill.
- **Voice/ASR**: the existing RN app's `voiceInput.ts` uses free on-device speech-to-text (Web Speech API / `expo-speech`), not Bhashini. Reproduce that with an equivalent free on-device Flutter package (e.g. `speech_to_text`) — no Bhashini account or API key is needed for parity.

## What's still needed from the user before certain steps — ask explicitly, don't proceed without them

1. **Apple Developer account** (for iOS builds/TestFlight): not yet created. Needed once there's a first iOS build ready to distribute, not before — ask when you reach that point, don't block earlier work on it.
2. **Google Play Console account** (for Android internal testing/release): not yet created. Same — needed once there's a first Android build ready, ask then.
3. **Branding assets**: app icon, splash screen, app display name — if these should differ from what's already in `/app/assets`, ask; otherwise reuse those.
4. **Client-specific demo data** (society name, sample farmer profiles, milk-passbook history) if the pilot demo should look realistic rather than using generic seed data — `scripts/seedDemo.js` and `scripts/seedCia.js` already exist as a starting point; ask whether to use/extend them.
5. **Aanchal ERP live credentials**: not needed — `mock` mode is already configured and is almost certainly sufficient for the pilot. Only ask if the client specifically wants live co-op data shown.

**How to ask for anything above**: never ask the user to paste API keys, passwords, or connection strings directly into chat. Ask what's needed, then have them paste it once and put it straight into the relevant `.env` file or hosting platform's secret manager (Render env vars, GitHub repo secrets) yourself, so it doesn't linger in chat history unnecessarily. For accounts (Apple/Google), prefer being added as a collaborator/team member over being given a password.

## Before writing any code

1. Read `CLAUDE.md` in full — it is the authoritative source for architecture, domain rules, module map, and state machines. Every rule in it is a hard constraint, not a suggestion.
2. Read `FLUTTER-CONVERSION-PRD.md` in full — this is your spec for the rebuild: scope, screen inventory, non-functional requirements, architecture, delivery phases, and deployment plan.
3. Open `prototypes/mobile-app.html` in a browser first (it re-hosts every farmer screen inside a real phone frame, in flow order) to see the whole farmer journey end-to-end, then open the individual prototype files per the mapping table in `FLUTTER-CONVERSION-PRD.md` §3.1 as you build each screen group. `/prototypes` is the settled UI/UX spec — reproduce its information architecture, copy, and flow exactly; your job is to execute it with real Flutter design polish (typography, spacing, motion, componentry), not redesign it.
4. Skim the existing React Native app at `/app` for exact API payload shapes, field names, and validation logic where the PRD or prototypes are silent on implementation detail.
5. If any of these sources conflict, resolve in this order: `CLAUDE.md` (business rules/compliance) > `/prototypes` (screen layout/copy/flow) > `/app` React Native code (API wiring) > `FLUTTER-CONVERSION-PRD.md` (structure/checklist).

Do not start building until you've actually read these — not skimmed. This app computes real credit limits and insurance payouts for real farmers; getting the domain rules approximately right is not good enough.

## What you're building

A Flutter app (iOS + Android) that is a full UI/UX rebuild of the existing React Native/Expo app. The backend (Node/Express + PostgreSQL, in `/backend`) is **not** being rewritten — treat it as a fixed REST API and integrate against it as-is. Do not modify backend business logic; only touch the backend if the Flutter client needs an endpoint that genuinely doesn't exist yet, and flag that explicitly rather than improvising a workaround client-side.

**Where the code goes:** create a new `/flutter_app` folder at the repo root via `flutter create`, and do all work there. Do not touch or restructure `/app` (leave it as the reference implementation), `/backend`, `/prototypes`, or any docs. Structure `/flutter_app` like a real production codebase — see `FLUTTER-CONVERSION-PRD.md` §9 for the exact required layout (feature-organized `lib/`, shared `design_system/` and `core/`, mirrored `test/`, dev/staging/prod flavors, lint config, README, CI scaffolding). It should be something another engineering team could clone and run without asking you anything.

## Non-negotiables

- No password fields anywhere — MPIN + OTP + JWT + Aadhaar step-up only.
- Never compute statutory numbers (KCC limits, insurance premiums, subsidy amounts) client-side — always display exactly what the backend returns.
- CIA ear-tag/animal/geo evidence capture is camera-only — block the gallery/photo picker entirely, preserve EXIF/GPS.
- Voice-captured logbook entries always show a confirm screen before saving — never auto-commit.
- The app must be fully usable offline for logbook entry, receipt confirmation, and evidence capture, with a local write queue and idempotent, server-wins-with-notification sync — this is a hard requirement, not a stretch goal.
- Every status screen (KCC application, CIA application/purchase/EMI, claims, coop orders, policies) renders exactly the state machine defined in `CLAUDE.md` — no invented UI-only states.
- Hindi + English both fully supported, no hardcoded strings in widgets.

## How to work

- Build in the six phases from `FLUTTER-CONVERSION-PRD.md` §6, in order: (1) foundation/auth/design-system/offline infra, (2) coop wedge, (3) dairy logbook, (4) KCC, (5) Pashu Suraksha, (6) CIA. Treat each phase as a demoable, working vertical slice against the real backend before moving to the next — don't build all screens shallowly in parallel.
- Use TodoWrite to track your plan through each phase and keep it current.
- After each phase: run `flutter analyze` and `flutter test` clean, then actually run the app (simulator/emulator is fine) against the real backend and exercise the golden path plus at least one offline/edge case for that phase before calling it done. Don't mark something complete on the basis of "it should work" — demonstrate it working.
- Commit to git after each completed phase (or smaller logical unit within a phase) with clear messages, so there's a working checkpoint to roll back to at every step. Confirm with me before any destructive git operation.
- No stub screens, no `TODO` placeholders, no mock data left behind in what you report as "done" — if something is genuinely out of scope or blocked (e.g. needs a backend endpoint that doesn't exist, needs a legal/policy decision per `docs/CIA-OPEN-QUESTIONS.md`), say so explicitly rather than faking it.
- If you hit a genuine ambiguity the sources above don't resolve — not a preference call you can reasonably make yourself, but something that changes user-facing behavior or money/compliance logic — stop and ask rather than guessing.

## Definition of done

Match the acceptance criteria in `FLUTTER-CONVERSION-PRD.md` §7: every screen in the inventory exists, wired to the real backend, reproducing the domain rules and state machines exactly; full offline functionality with correct sync/conflict UX; no passwords, no gallery picker on evidence capture, no client-side statutory math; full Hindi/English support; acceptable performance on a representative low/mid-range Android device, not just a simulator; and a visual quality that's a clear improvement over the current RN app while staying consistent across every screen via the shared design system.

Start by reading the four sources above, then give me a short plan for Phase 1 before you start writing code.

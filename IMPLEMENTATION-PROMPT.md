Implement the Allied KCC Flutter mobile app end-to-end, in full, to a production-ready standard.

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

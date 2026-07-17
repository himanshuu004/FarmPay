# CIA — Claude Code kickoff prompt

Paste the block below into Claude Code after opening the `Dairy_kcc` folder to start CIA-1 development.

**Recommended model:** Opus 4.8 for the architecture-heavy build (many files, dense conventions, stateful workflows, migrations). Drop to Sonnet 5 for routine CRUD/validators once the CIA-1 patterns are set.

---

```
You are working in the Allied KCC / Aanchal platform (Node 20 + Express 4 + Sequelize/PostgreSQL 16, greenfield). We are building the Cattle Induction Application (CIA) — UCDF's milch-animal loan-cum-subsidy programme.

READ FIRST, in order, and treat them as authoritative:
1. CLAUDE.md — architecture + conventions. Pay special attention to the CIA rows in Domain Constants, the Module Map, Roles, State Machines, Conventions 30–34, and the CIA phase track.
2. CATTLE-INDUCTION-APP-PRD.md — the CIA product/requirements spec (Parts 1–18).
3. docs/CIA-OPEN-QUESTIONS.md — decisions made (EMI=initiate, bank=API primary, DCS/supervisor in-app for CIA only) and what's still blocking.
4. backend/src/modules/cattle_induction/README.md — what the scaffold contains and the CIA-1→4 build order.

WHAT ALREADY EXISTS (a Phase-1 scaffold — do not rebuild it, extend it):
- backend/src/modules/cattle_induction/ : 6 role-gated routers, controller (CIA-2/3 endpoints return 501 on purpose), Joi validators, 6 stubbed services + bankApiService, 9 Sequelize models, workers/ciaStageSlaWorker.js.
- Wired into app.js, shared/constants/roles.js (CIA roles, UPPERCASE values), shared/models/index.js (allowlist), migrations/20260711000000-cia-phase1.js, prototypes/cattle-induction/index.html.

NON-NEGOTIABLE GUARDRAILS:
- Scope now is CIA-1 only (application + capture). NO money movement. Leave the 501-deferred endpoints deferred (CIA-2/3 are blocked on open questions #1,2,4,5,9,13,14).
- Prototype-first (CLAUDE.md P0 rule): every farmer/field/DCS/DUSS screen is a clickable HTML mock with mock JSON in prototypes/cattle-induction/ BEFORE its backend is built. The settled prototype is the spec.
- Follow house patterns exactly: lazy getDb(), controllers HTTP-only, snake_case tables / camelCase DTOs, transactions for multi-table writes, every state transition writes the domain_events outbox, evidence live-capture + lossless, MPIN/OTP auth (no passwords).
- Honour Conventions 30 (DCS/supervisor in-app is CIA-only), 31 (payment gate), 32 (evidence/anti-fraud), 34 (CIA≠KCC≠COOP credit).

FIRST TASK — do NOT write code yet:
Produce a short CIA-1 implementation plan: the slice order (I suggest: farmer EOI → application + document upload → status tracker → DCS selection → offline supervisor verification → DUSS scrutiny + prescribed-format packet → bank sanction-file stage/confirm), which prototypes to build first, which services/models each slice touches, and the Jest tests per slice (payment-gate, traceability, ear-tag regex/uniqueness, maker-checker segregation, offline-sync idempotency). Flag anything in the scaffold you'd change and why. Wait for my approval before implementing.
```

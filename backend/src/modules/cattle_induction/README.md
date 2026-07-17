# `cattle_induction` module (CIA)

UCDF milch-animal **loan-cum-subsidy** programme. Source of truth: `CATTLE-INDUCTION-APP-PRD.md` (repo root) and the original brief `Cattle Induction App.pdf`. Governed by `CLAUDE.md` — see the CIA rows in Domain Constants, Module Map, Roles, State Machines, Conventions 30–34, and the CIA phase track.

## What this scaffold contains (CIA-1 MVP — application & capture, **no money movement**)

```
cattle_induction/
├── index.js                 module doc + phase map
├── routes/ciaRoutes.js      6 routers: farmer · field · dcs · duss · bank · admin
├── controllers/ciaController.js   HTTP only; CIA-2/3 endpoints return 501 (deferred)
├── validators/ciaValidator.js     Joi shapes (ear-tag ^\d{12}$, geo bounds, reason-on-reject)
├── services/                applicationService · selectionService · verificationService ·
│                            dussService · bankApiService (primary) · bankFiledropService (fallback) ·
│                            purchaseCaptureService  (stubbed)
├── models/                  CiaApplication · CiaSelectionDecision · CiaFieldVerification ·
│                            CiaBankBatch · CiaSanction · CiaSeller · CiaAnimal · CiaTransport · CiaPurchase
├── workers/ciaStageSlaWorker.js   stage-SLA sweep (ciaStageSlaJob)
└── README.md
```

Wired into the platform:
- `app.js` mounts all six routers under `/api/v1/cattle-induction*` and `/api/v1/admin/cattle-induction`.
- `shared/constants/roles.js` adds CIA roles (UPPERCASE values, matching DB `role_name`) + maker-checker `ROLE_GROUPS`.
- `shared/models/index.js` allowlists `cattle_induction` so its models load.
- `migrations/20260711000000-cia-phase1.js` syncs the nine CIA-1 tables in FK order.

## Non-negotiables baked into the scaffold
- **Payment-gate (Convention 31):** `CiaPurchase` holds the gate inputs (vet_certified, transit_insured, cattle_insured, farmer_acknowledged); `SELLER_PAYMENT_PENDING` is unreachable until all exist + the traceability chain is complete.
- **Traceability chain (Convention 31):** application → animal(ear_tag) → seller(verified a/c) → transport(origin/destination geo) → policies → payout.
- **Evidence integrity (Convention 32):** live-capture only, perceptual-hash, geo-fence, ear-tag `^\d{12}$` registry-unique — enforced in CIA-3, columns present now.
- **CIA in-app exception (Convention 30):** DCS + supervisor act in-app for CIA only; input-order approvals stay ERP-side.
- **Three separate ledgers (Convention 34):** CIA ≠ KCC ≠ COOP credit.

## Prototype-first
Clickable HTML mocks with mock JSON live in `prototypes/cattle-induction/` — the settled prototype is the spec (same rule as insurance/kcc/society).

## Build order for Claude Code
1. CIA-1: fill the six services + workers; ERP pre-fill; domain_events on every transition; offline sync; prescribed-format packet generation; bank sanction-file stage→confirm (quarantine unmatched).
2. CIA-2: subsidy/disbursement records, loan↔milk-account map, EMI schedule ingest + reconciliation (`ciaEmiReconcileJob`). Un-defer the 501 endpoints. **Decided:** bank = **API primary** (`bankApiService`; add `src/integrations/coopbank/`, filedrop = fallback) and EMI = **initiate** (`bankApiService.initiateEmiDeduction`, consent-gated — else track-only). See `docs/CIA-OPEN-QUESTIONS.md`.
3. CIA-3: penny-drop seller, vet e-sign, geo-fence, registry uniqueness, duplicate-photo hash, insurance-date integrity, the payment gate + seller-payment recommendation, fraud exception panel (shadow).
4. CIA-4: 7/30/90-day inspections, claims (SLA + penal interest), muzzle re-ID, ML, live bank/gov dashboards.

## Tests to add (CLAUDE.md Convention 29)
Payment-gate enforcement, traceability completeness, ear-tag regex + registry uniqueness, duplicate-photo hash, geo-fence, insurance-date integrity, EMI reconciliation, bank filedrop idempotency, maker-checker segregation.

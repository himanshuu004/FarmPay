# Allied KCC — Architecture & Claude Code Context

## Project Overview

Allied KCC is a **standalone farmer-facing platform extracted from FarmerPay**, focused exclusively on the composite Kisan Credit Card for **allied activities** (KCC-AH), NLM-compliant livestock insurance ("Pashu Suraksha"), a **cooperative module** for dairy-society farmers (UCDF/Aanchal Input Services Supply Chain), the **Cattle Induction Application** (CIA — UCDF milch-animal loan-cum-subsidy programme, end-to-end from expression-of-interest to milk-payment-linked EMI recovery; see `CATTLE-INDUCTION-APP-PRD.md`), and a **phase-gated Intelligence Layer** (CV · NLP/speech · ML).

**V1 is member-first: "the Aanchal member app that also gets you a KCC."** Primary persona = UCDF DCS-member dairy farmer (Uttarakhand). **The COOP milk passbook is the wedge** — the only daily-pull surface, populated from the ERP with zero farmer data entry (kills the logbook cold-start). Sequence of value: passbook habit → input ordering → KCC → insurance. Non-members are supported (voice/manual logbook, calculator, join-society nudge = the acquisition funnel) but not the v1 GTM. Fishery/multi-activity/other-state personas: v2+ (their *credit* math works from day 1 via the catalog).

**Product thesis: the logbook is the credit file.**
RECORD (voice-first herd/flock + money logbook; passbook auto-data for members) → PROVE (P&L → TRUST → drawing power) → UNLOCK (composite KCC limit, LT drawdown, auto renewal pack) → PROTECT (per-animal NLM insurance, premium via KCC, 4-role workflow, biometric animal identity) → GROW (rates + advisories + society input credit + assistant).

**Users:** farmers (main app). VO (doctor) + surveyor + POSP work in **ONE offline-capable field PWA** (role-gated views — never shared screens, shared shell). Insurer-ops gets a Next.js dashboard. **Banker interface in v1 = the generated application/renewal-pack PDF** (live dashboard: Phase 4). Gov = generated Annexure XX report (white-label: Phase 4). **For the routine COOP input-order wedge, co-op approval actors (DCS Secretary, Route Supervisor, DUSS/P&I/Store/CFF) work in the Aanchal ERP, never in this app.** **CIA is a scoped exception (see Convention 30):** the Cattle Induction Application gives the DCS Secretary, DCS Board and Route Supervisor in-app roles for CIA beneficiary selection and field verification; DUSS/district, cooperative bank, insurer, seller/transporter and UCDF also have CIA-specific surfaces. This does NOT change the input-order rule.

**AI stance:** statutory math is never a model; AI proposes, humans/farmers dispose; shadow → assist → automate-with-override; every inference logged.

**Status:** pre-Phase-0 (greenfield). **ALL new code is built in THIS folder (the Dairy_kcc repo).** Extraction sources: `~/Desktop/farmerpay-platform` (main) and `~/farmer_pay_projects/farmerpay-platform/dairy_cooperative` (co-op: ERP adapter, input/org modules) — these are **READ-ONLY references to copy from; never create, modify, or delete anything inside them.** Design docs in this folder are authoritative (see Golden Sources).

**Tech stack (v0.5/0.6):**
- Backend core: Node.js 20 + Express 4 (MVC + service layer), **PostgreSQL 16 + pgvector + PostGIS** (⚠ changed from MySQL — greenfield; Sequelize 6 kept, dialect `postgres`), Redis 7, RabbitMQ 3 + **`domain_events` outbox** (append-only)
- **AI services: Python 3.12 + FastAPI** (`ai-services/`: vision, speech, predict, rag) · ONNX Runtime (CPU-first) · MLflow · Label Studio · embeddings/RAG in pgvector · evidence GPS checks in PostGIS
- Speech/language: **Bhashini first**, AI4Bharat IndicConformer/IndicWhisper fallback; LLM = India-region hosted frontier + open-weights fallback
- Farmer app: React Native 0.81 + Expo 54 + Expo Router (NOT Next.js — ignore "use client" warnings) + on-device ONNX/TFLite capture QC + **offline-first local write queue (v1 REQUIREMENT — logbook, receipts, evidence must work with no signal)**
- Field PWA: offline-capable end-to-end (forms, queues, capture)
- Object storage: S3-compatible, Indian region (evidence store = data lake; parquet)
- Auth: 4-digit MPIN + OTP (UPI pattern) + JWT + Aadhaar step-up. **No passwords. Never reintroduce passwords.**
- Deferred by design: Kafka/Debezium, ClickHouse, Temporal, GPU serving.

---

## Golden Sources (read before designing anything)

| File (this folder) | Governs |
|---|---|
| `DAIRY-KCC-BLUEPRINT.md` (v0.6) | Product + technical blueprint; **§1.1 V1 scope declaration; §1.2 cut list; §11 re-phased plan** |
| `INSURANCE-SYSTEM-DESIGN.md` | **Suraksha**: KAVACH + CLAIMS — schema, endpoints, personas, phases. **LIVESTOCK line only** |
| `Input Service App.pdf` | **COOP source of truth** (UCDF/Aanchal): 70%-of-payables limit, 1st/3rd-week windows, ERP-side approval chain, dispatch alerts, receipt confirmation |
| `CATTLE-INDUCTION-APP-PRD.md` | **CIA source of truth**: full workflow, personas, status matrix, RBAC, data dictionary, fraud controls, roadmap, open questions. Governs the `cattle_induction` module |
| `Cattle Induction App.pdf` | UCDF's original CIA brief (as-is process flow, proposed app flow, EMI tracking, cattle-purchase data points) |
| `kcc_composite.txt` | RBI KCC Directions 2026 — limit math + worked dairy/fishery illustrations (= unit-test fixtures); ¶19(2) → LT drawdown |
| `revised_nlm_guidelines.pdf` | NLM OG (Jan 2025) — insurance parameters (pp.42–43, 53–56) |
| `ALLIED-KCC-ARCHITECTURE.svg` | System architecture diagram |

---

## Domain Constants & Math (encode exactly; never hardcode scheme parameters)

### KCC Limit Engine (RBI Directions 2026; scheme-versioned; DETERMINISTIC FOREVER)
```
WC_activity(yr n) = SoF(activity, yr n) × eligible_units(activity)     # units LIVE from registers
WC_total(yr n)    = Σ WC_activity
                  + 10% consumption        # counted ONCE across all activities (¶16(3))
                  + 20% maintenance/tech
                  + Σ insurance_premiums   # each insurance TYPE once; quotes from KAVACH
MPL(yr n) = round_to_1000( MPL(yr n−1) × 1.10 ),   MPL(1) = WC_total(1)
CMPL      = MPL(6) + Σ investment_credit_items     # LT: animals, sheds, equipment; ≤6-yr repayment
```
- Unit tests MUST reproduce Illustration 1(B) dairy (2 CB cows, SoF ₹7,000 → yr-1 ₹18,600; 6th-yr MPL ₹29,956) AND 2(B) fishery (₹2,00,000/acre → yr-1 ₹2,64,500; 6th-yr ₹4,25,981) — fishery math ships v1 even though the fishery ERP module doesn't.
- Collateral-free ≤ ₹2 lakh (₹3 lakh tie-up). No notified SoF → **outside KCC** (¶16(2)) — gate in `activity_catalog`.
- Scheme versioning: `KCC_MC_2018` vs `KCC_DIR_2026` (sanctions from 01-Jan-2027) — both in `scheme_configs`.
- MISS (FY 25-26): 7% lending, 1.5% subvention, 3% PRI → 4% effective; ₹2 lakh AH sub-limit. **Config, not code.**
- **LT drawdown (¶19(2)):** `kcc_drawdown_requests` — item (ANIMAL|SHED|EQUIPMENT), amount, quotation photo/OCR; `DRAFT → SUBMITTED → BANK_APPROVED → DISBURSED | REJECTED`; on disbursement the purchased animal enters the register + gets an insurance nudge (asset–loan–policy triangle).
- ML may FORECAST drawing power / pre-fill renewal packs; it may never compute sanctioned numbers.

### NLM livestock insurance (livestock line only)
- Beneficiary **15%**, govt 85% (60:40 / **90:10 NER-Him — Uttarakhand** / 100% UT — split in plan JSON).
- Premium ceilings: 1yr 4.5% · 2yr 8% · 3yr 11% (NER/Him 5.5/9/11.5). **3-yr default.**
- Cattle-unit cap: **10 CU/household** (5 CU pig/rabbit); 1 CU = 10 sheep/goat/pig/rabbit; MGNREGA household.
- Sum insured: market value, jointly assessed with vet; floors **₹3,000/L-day (cow), ₹4,000 (buffalo)** — auto from milk log; disputes → GP/BDO.
- Identification: **12-digit NDDB ear tag** (`^\d{12}$`) + RFID + **2 photos**; VCI-registered vet. Muzzle biometrics is OUR second factor — never replaces the statutory tag/photos.
- Claims: 21-day waiting; **4 documents only**; settlement **15 days from docs-complete** (config; p.55 also cites 21–25d); breach → **12% p.a. compound penal interest**, farmer-visible.
- Vet honorarium ₹50 / ₹125 → `vet_honorarium_ledger`, quarterly. Policy transfers on sale. Premium **through KCC account** with consent (¶32–33); policy **assigned to bank**.
- **System of record = this platform**; export-compatible with DAHD + **Annexure XX** (generated report in v1).

### Insurance scheme routing
dairy/goat/sheep/pig/rabbit/camel/yak/mithun → NLM · fishery/aqua → PMMSY · poultry → private/state · sericulture/beekeeping/lac → private/state. **No PMFBY. No crop insurance. No NCIP.**

### COOP input-service rules (source of truth: `Input Service App.pdf`)
- **Order limit = 70% × outstanding milk payment** owed to the member (ERP: milk supplied + outstanding), minus in-flight unadjusted orders. Factor in `coop_policy` config. *(Supersedes dairy_cooperative's `avgMilkValue×factor`.)*
- **Demand windows: 1st and 3rd week monthly** (config) — order creation gated.
- **All approvals in the Aanchal ERP.** The app authors ONLY order submission and receipt confirmation; all other statuses via ERP sync.
- Repayment adjusted against milk payables by the ERP. **Co-op credit is NOT part of the KCC limit; never double-count.**

### CIA — Cattle Induction rules (source of truth: `CATTLE-INDUCTION-APP-PRD.md`)
- **CIA is a loan-cum-subsidy origination programme, distinct from both KCC and the COOP 70% input credit.** Never double-count against either. Milk payables are used as **repayment-capacity evidence + the EMI recovery source**, not as a credit line.
- **Traceability chain (mandatory, FK-enforced):** `farmer → application → sanction/subsidy → animal(ear_tag) → seller(verified a/c) → origin_geo + destination_geo → transport → transit_policy + cattle_policy → seller payout → emi_schedule`. Any missing link **blocks the next financial step** and raises an exception.
- **Payment-gate rule:** `Seller Payment Pending` is only reachable after vet certification + transit & cattle insurance + farmer acknowledgment exist. **No payment recommendation without complete verification.** Payee must equal the penny-drop-verified registered seller account.
- **Evidence integrity:** cattle/ear-tag/geo evidence is **live-capture only** (gallery blocked), perceptual-hashed (block reused photos), EXIF/GPS preserved lossless. **Geo-fence** purchase + destination to approved geography (config). Ear tag `^\d{12}$` + **registry uniqueness check** (same animal → multiple loans blocked).
- **Insurance-date integrity:** transit policy must exist before movement; cattle policy effective date **cannot precede arrival confirmation** (no backdated / post-purchase insurance).
- **EMI deduction — INITIATE (decided).** The app **initiates** milk-payment EMI deductions (not merely tracks), sending the deduction instruction to the ERP/bank. **Per-loan gate (never dropped):** initiation is allowed ONLY when a recorded **legal authorisation + tri-partite (farmer–society–bank) consent** exists for that loan; without it the loan falls back to **track** mode. Reconciliation (due↔deducted↔remitted↔pending↔partial↔overdue↔default) runs in both modes. Deduction priority vs feed/insurance/other milk-payment debits is config.
- **Bank integration — API PRIMARY (decided).** The cooperative bank integrates by **API** (application submission, sanction, loan-account, disbursement, subsidy-receipt, seller-payment, EMI schedule/overdue, reconciliation). **Filedrop + maker-checker file upload is retained as the degraded fallback** (never let a bank-API outage halt the programme — mirrors the ERP filedrop philosophy). Bank here = the **cooperative bank**.
- **All CIA scheme parameters are config** (`cia_scheme_configs` / `rules_json`): subsidy %, govt-share split, beneficiary contribution %, price ceilings (breed/region), max cattle/beneficiary, min membership + milk-supply history, geo-fence radius, delivery/transit deadlines, grace period, default buckets, SLA timers.
- **Insurance routing unchanged:** cattle (dairy) → NLM via KAVACH; transit cover via the same insurer integration. No PMFBY/crop.

---

## Module Map

Every Node module: `routes/ → controllers/ (HTTP only) → services/ → models/ → validators/ → workers/`

| Module | Purpose | Key contents / v1 status |
|---|---|---|
| `auth` | MPIN+OTP, JWT, Aadhaar step-up | copied |
| `farmer` | profiles, multi-activity subscriptions, KYC | society membership via `coop_memberships` |
| `coop` ← **wedge** | society farmers (PDF) | `coop_memberships`, `coop_input_items`, `coop_input_orders`(+items), `coop_milk_snapshots` (passbook), `erp_sync_log` |
| `livestock` | generalized dairy-v2 ERP, species profiles | registers, production logs, cost/revenue events, recurring, hybrid P&L, breeding, treatment. DAIRY full; GOATERY/POULTRY/PIGGERY/SHEEP = register + logbook + PoP |
| `pop` | stage templates + touchpoints | goatery/poultry |
| `fishery` | fishery ERP v2 | **DEFERRED to Phase 4** — FISHERY lives in `activity_catalog` for credit from day 1 |
| `kcc` | **Limit Engine** + origination + **LT drawdown** + renewal pack | `activity_catalog`, `sof_registry`, `scheme_configs`, `kcc_facilities`, `kcc_facility_activities`, `kcc_limit_schedules`, `kcc_sublimit_ledgers`, `kcc_drawing_power_snaps`, **`kcc_drawdown_requests`**, **`kcc_society_certifications`**; 12-state society-mediated application (society certifies → bank); renewal-pack generator (**the banker interface in v1**) |
| `cattle_induction` ← **CIA** | UCDF milch-animal loan-cum-subsidy programme, EOI → EMI recovery | `cia_scheme_configs`, `cia_applications`, `cia_selection_decisions`(+resolution), `cia_field_verifications`, `cia_bank_batches`, `cia_sanctions`, `cia_subsidy_transfers`, `cia_disbursements`, `cia_purchases`, `cia_sellers`, `cia_animals`(ear_tag, live-capture media, hashes), `cia_transport`, `cia_insurance_links` (→ KAVACH transit + cattle), `cia_seller_payouts`, `cia_emi_schedules`, `cia_emi_ledger`, `cia_grievances`, `cia_post_purchase_inspections`. Reuses `livestock` registers, `kavach`/`claims`, `identity` muzzle, `trust` repayment-capacity, `erp` adapter, `location` PostGIS. **Payment-gated; full traceability chain; DCS/supervisor act in-app (CIA-only exception).** |
| `trust` | credit scoring | 5 pillars + insurance pillar + co-op formality evidence; 1000-pt, 4 bands; SHAP-style reason codes |
| `kavach` | insurance policy core (Suraksha) | plans, proposals, policies, `policy_assets`, premium/commission ledgers, `renewal_journeys` ★ |
| `claims` | claims, evidence, SLA (Suraksha) | `claim_cases`, `claim_events` (hash-chained), `evidence_files`, `surveyor_tasks`, `grievance_tickets`, `vet_honorarium_ledger` |
| `identity` | animal biometrics | `animal_biometrics` (muzzle_embedding VECTOR, quality, model_version); enrolment dedupe; claim match; shadow-mode → surveyor queue |
| `assistant` | RAG + voice-ingest edge | **AI-2** — do not build before Phase 4; voice logging ships first |
| `stakeholders` | field ops | Intermediary (POSP), task queues, evidence bundles, consents, offline sync, commission escrow |
| `market` | rate boards | **v1 = milk (fat/SNF, from ERP) + feed (from co-op catalog) + channel advisor.** Egg/broiler/fish: Phase 4 |
| `advisory` | rule packs | dairy v1: vaccination FMD/HS/BQ, mastitis, heat stress (IMD-THI), breeding windows, dry-off |
| `scenarios` | what-if engines | **DEFERRED to Phase 4** |
| `location` / `compliance` / `notifications` | LGD; DPDP consents (+ `model_improvement` purpose) + grievance; SMS/WhatsApp/push/IVR | copied |

### AI services (`ai-services/`, Python FastAPI)
`vision/` (muzzle re-ID, liveness, capture-QC → exported on-device, BCS/weight, breed, doc-AI, forensics) · `speech/` (Bhashini→IndicWhisper ASR/TTS, NLU slot-filling) · `predict/` (yield, renewal propensity, fraud, price/THI, EWS, DUSS demand) · `rag/` (pgvector retrieval). Every endpoint writes `model_inference_log`; models pinned via MLflow.

### Integrations (`src/integrations/`)
`erp/` — **Aanchal ERP adapter**: Adapter → clients, **`INTEGRATION_MODE = live | webhook | filedrop | mock`**. **filedrop is the degraded launch mode**: daily CSV/XLSX batches (member master, milk summary+outstanding, order statuses, dispatches) via SFTP → `erpSyncJob` ingests idempotently (sequence/late-file tolerant); receipts queue outbound as return files; UX labels freshness honestly ("as of yesterday"). Mock archetypes F1001–F1003. Modules import `{ erp }` only.
`bhashini/` · `llm/` (provider-abstracted, India-region) · `finacle/` (prefill + reconciliation).

### Route mounting
```
/api/v1/{auth, farmer, livestock, pop, kcc, trust, kavach, claims, coop,
         identity, assistant, market, advisory, location, cattle-induction}
/api/v1/claims/field          # roleCheck: SURVEYOR, VET, POSP  (the field PWA's API)
/api/v1/cattle-induction/field # roleCheck: ROUTE_SUPERVISOR, VET  (CIA field PWA views)
/api/v1/cattle-induction/dcs   # roleCheck: DCS_SECRETARY, DCS_BOARD
/api/v1/cattle-induction/duss  # roleCheck: DUSS_MAKER, DUSS_CHECKER, DISTRICT_OFFICER (maker-checker)
/api/v1/cattle-induction/bank  # roleCheck: BANK_MAKER, BANK_CHECKER, BANK_REGIONAL (maker-checker)
/api/v1/admin/kavach          # roleCheck: INSURER_OPS, GOV_VIEWER
/api/v1/admin/claims          # roleCheck: INSURER_OPS, GOV_VIEWER
/api/v1/admin/cattle-induction # roleCheck: UCDF_PM, UCDF_FINANCE, UCDF_ADMIN, AUDITOR, GOV_VIEWER
(fishery, scenarios mount in Phase 4)
```

### Roles (`roleCheck`)
`FARMER · VET · SURVEYOR · POSP · INSURER_OPS · GOV_VIEWER · GP_BDO · BANKER`
(No co-op **input-order** approval roles — ERP-side. VET/SURVEYOR/POSP share ONE field PWA with role-gated views.)

**CIA roles (in-app, scoped, maker-checker + segregation of duties):** `DCS_SECRETARY · DCS_BOARD · ROUTE_SUPERVISOR · DUSS_MAKER · DUSS_CHECKER · DISTRICT_OFFICER · BANK_MAKER · BANK_CHECKER · BANK_REGIONAL · SELLER · TRANSPORTER · UCDF_PM · UCDF_FINANCE · UCDF_ADMIN · AUDITOR`. ROUTE_SUPERVISOR + VET share the CIA field PWA (role-gated). AUDITOR is read-only everywhere incl. audit logs. These roles apply to CIA surfaces only.

---

## State Machines (implement exactly)

```
Enrolment proposal:  DRAFT → TAGGED → EXAMINED(VO) → VALUED → PAID → POLICY_ISSUED
Policy:              active → lapsed | expired | claimed | cancelled  (+ transfer on sale)
Claim:               INTIMATED → SURVEY_DONE → PM_DONE → DOCS_SUBMITTED → UNDER_REVIEW
                     → SETTLED | REJECTED (| ESCALATED on SLA breach)
Commission escrow:   accrued → escrow_held → qc_passed → released → paid  (T+15; disputed branch)
Renewal journey:     pending → reminded → renewed | lapsed | opted_out
KCC application:     DRAFT → SUBMITTED★ → SOCIETY_CERTIFIED‡ → UNDER_REVIEW → FORWARDED_TO_BANK
                     → SANCTIONED → DISBURSED → ACTIVE → RENEWAL_DUE → RENEWED (| REJECTED | CLOSED)
                     (society-mediated: ‡ = ERP-authored society/milk-union certification —
                      membership + cattle + milk-supply + DBT-to-account; tie-up unlocks the ₹3L
                      collateral-free limit. ★ = farmer-authored. Bank authors review→sanction.
                      Society membership is a precondition to apply.)
LT drawdown:         DRAFT → SUBMITTED → BANK_APPROVED → DISBURSED | REJECTED
                     (on DISBURSED: asset → register + insurance nudge)
Coop input order:    DRAFT → SUBMITTED★ → SECRETARY_APPROVED → SUPERVISOR_APPROVED
                     → DUSS_PROCESSING → DISPATCHED → RECEIPT_CONFIRMED★
                     (↘ REJECTED at any approval stage; ★ = only app-authored transitions,
                      all others via erpSyncJob — the app NEVER approves)
CIA application:     DRAFT → INTEREST_SUBMITTED★ → PENDING_DCS_REVIEW → SELECTED_BY_DCS‡
                     (| NOT_SELECTED) → APPLICATION_PENDING★ → PENDING_SUPERVISOR_VERIFY‡
                     (↘ RETURNED_FOR_CORRECTION) → FORWARDED_TO_DUSS → UNDER_DUSS_SCRUTINY
                     → SUBMITTED_TO_BANK → UNDER_BANK_APPRAISAL (↘ BANK_QUERY_RAISED)
                     → LOAN_SANCTIONED (| LOAN_REJECTED) → SUBSIDY_TRANSFERRED → LOAN_DISBURSED
                     → CATTLE_PURCHASE_PENDING → ... (hands off to CIA purchase) ...
                     → SELLER_PAID → EMI_ACTIVE → (EMI_OVERDUE ⇄ EMI_ACTIVE | LOAN_RESTRUCTURED)
                     → LOAN_CLOSED → APPLICATION_CLOSED
                     (★ = farmer-authored. ‡ = CIA in-app: DCS Board selection + Route Supervisor
                      field verification are AUTHORED IN THIS APP for CIA — the scoped exception to
                      the ERP-only co-op-approval rule. Bank + DUSS steps are maker-checker. Society
                      membership is a precondition. All financial steps are reconcilable.)
CIA purchase:        PURCHASE_INITIATED★ → VET_VERIFICATION_PENDING → PURCHASE_APPROVED
                     (| PURCHASE_REJECTED → back to CATTLE_PURCHASE_PENDING) → TRANSIT_IN_PROGRESS
                     → CATTLE_DELIVERED★ → INSURANCE_PENDING → SELLER_PAYMENT_PENDING → SELLER_PAID
                     (gated: SELLER_PAYMENT_PENDING unreachable until vet cert + transit&cattle
                      policy + farmer acknowledgment exist; live-capture media, geo-fence, ear-tag
                      registry-unique all enforced; gate fail → exception, never silent block)
CIA EMI:             SCHEDULED → DUE → (DEDUCTED_FULL | DEDUCTED_PARTIAL) → REMITTED
                     → PAID | OVERDUE(ageing buckets) | DEFAULT (| MORATORIUM | RESTRUCTURED)
                     (ERP-driven; app tracks by default, initiates only with legal auth+ consent)
Voice draft:         CAPTURED → TRANSCRIBED → DRAFTED → CONFIRMED(farmer) | EXPIRED
                     (a draft NEVER auto-commits)
Model lifecycle:     registered → shadow → assist → automate_with_override → retired
Offline queue item:  QUEUED_LOCAL → SYNCING → SYNCED | CONFLICT(server-wins + farmer notify)
```

---

## Async Infrastructure

**Scheduled jobs:** `renewalSweepJob` ★, `slaClockTickJob` (penal interest), `premiumDebitWatchJob`, `commissionPayoutJob`, `grievanceAgeingJob`, `erpSyncJob` (all 4 modes), `demandWindowJob`, `dairyRecurringJob`, `priceIngestJob`, `advisoryJob`, `featureSnapshotJob`, `modelDriftJob`. **CIA:** `ciaStageSlaJob` (per-stage escalation timers), `ciaPurchaseDeadlineJob` (delivery/transit deadlines), `ciaEmiReconcileJob` (milk-payment deduction ↔ schedule), `ciaBankFiledropJob` (sanction/loan-a/c/disbursement/EMI file ingest, idempotent), `ciaSubsidyReconcileJob`, `ciaPostPurchaseInspectionJob` (7/30/90-day). *(fisheryRecurringJob: Phase 4.)*

**RabbitMQ:** `kavach.renewal.reminders`, `kavach.policy.issued`, `claims.evidence.process`, `claims.sla.breach`, `claims.notify`, `coop.dispatch.alerts`, `ai.inference.requests`, `cia.stage.notify`, `cia.emi.default`, `cia.evidence.process`, `cia.fraud.flag`.

**Outbox:** `domain_events` — append-only (register mutations, logbook entries, policy/claim/order transitions). Feeds audit + ML training. Never UPDATE/DELETE.

**Redis keys:** `kavach:catalog:grouped` (1h), `kavach:policy:snapshot:<farmerId>` (10m), `claims:sla:<claimId>` (5m), `coop:elig:<memberRef>` (10m), `coop:passbook:<memberRef>` (30m), `feat:<entity>:<id>`, `cia:app:status:<applicationId>` (5m), `cia:emi:ledger:<farmerId>` (30m), `cia:dashboard:<scope>` (5m). Invalidate on policy issue/renew, claim stage change, evidence add, ERP sync delta, CIA stage transition, EMI reconcile.

---

## Code Patterns (identical to FarmerPay)

```javascript
// Services: lazy-load DB to avoid circular deps
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Controllers: resolve user, no business logic
const getResource = async (req, res, next) => {
  try { const fid = await resolveUserId(req);
    return success(res, { message: 'Done', data: await service.get(fid) });
  } catch (err) { next(err); }
};

// Errors
const err = new Error('msg'); err.statusCode = 4xx; err.errorCode = 'CODE'; throw err;

// Models: snake_case tables, underscored: true, is_active, associations in static associate()
// Postgres: VECTOR via pgvector; geography via PostGIS; JSONB for rules_json
```
Shared utils: `success`, `logger`, `generateUUID`, `parsePagination/buildMeta`, Redis helpers, `authenticate`, `roleCheck`, `validate` (Joi).

---

## Critical Conventions

1. **No circular imports** — `getDb()` lazy-load in every service.
2. **Transactions for multi-table writes.**
3. **Snake_case DB, camelCase API DTOs.** UUIDs for external ids.
4. **No passwords** — MPIN + OTP only.
5. **Scheme parameters are config, never code** — MISS rates, SoF, premium caps, SLA days, coop 70% + windows → `scheme_configs` / `sof_registry` / `rules_json` / `coop_policy`.
6. **Units live from registers** — never a typed count in the Limit Engine.
7. **10% consumption once**; each insurance type once (¶16(3)).
8. **`claim_events` + `domain_events` append-only**; `claim_events` hash-chained. Never UPDATE/DELETE.
9. **Evidence is lossless** — EXIF/GPS/device meta preserved; content-addressed; reject re-compression.
10. **Claims decisions are never automated** — no auto-denial; ML routes to humans.
11. **4-document claim checklist** — never ask beyond NLM's 4.
12. **Policy vault delivers to the farmer** — never parked with the VO.
13. **Role-separated surfaces** — role-gated views, never shared screens (one field PWA shell is fine; shared screens are not).
14. **The app never approves co-op orders** — only SUBMITTED★ and RECEIPT_CONFIRMED★ are app-authored.
15. **Co-op credit ≠ KCC credit** — never inside the KCC limit (payables DO count as receivables evidence, ¶16(4)).
16. **Delivered input orders auto-log** as feed cost events — single entry, both systems.
17. **DPDP**: consent records per share; purpose-bound, revocable; `model_improvement` is its own purpose — no training on unconsented data.
18. **Redis invalidation** on data changes.
19. **Export-compatibility** — DAHD portal + Annexure XX lossless mapping.
20. **Statutory math is never a model.**
21. **AI proposes, humans dispose** — voice drafts confirm-only; biometric flags → queues; credit models = decision support with reason codes.
22. **Shadow first** — money/claims models: shadow → assist → override; per-model kill-switch.
23. **Every inference logged** — `model_inference_log`, append-only.
24. **Biometric & voice data**: encrypted, Indian-region, consented purpose only, deletable; muzzle gallery never leaves the platform.
25. **On-device capture QC**; server re-validates.
26. **Offline-first is a requirement** — farmer logbook/receipts/evidence + entire field PWA work with no signal (local queue → idempotent sync; server-wins conflicts with farmer notification). Passbook/status screens show last-synced state with honest timestamps.
27. **ERP filedrop is a first-class mode** — daily CSV batches must fully drive the COOP module (idempotent, late/duplicate-file tolerant); never let API availability block the wedge.
28. **Banker/gov interfaces are generated documents first** (application file, renewal pack, Annexure XX); dashboards are Phase 4.
29. **Testing**: Limit-Engine (both illustrations), 70%-limit, SLA clocks, hash-chain, renewal cloning, CU-cap, **filedrop reconciliation idempotency, offline-sync conflicts** → full Jest coverage; per-model eval suites gate promotion; assistant red-team suite in CI. **CIA:** payment-gate enforcement (no payout before vet+insurance+ack), traceability-chain completeness, ear-tag registry uniqueness + duplicate-photo hash, geo-fence, insurance-date integrity, EMI reconciliation (full/partial/overdue/default), bank filedrop idempotency, maker-checker segregation → full Jest coverage.
30. **CIA in-app approval is a scoped exception** — DCS Secretary/Board + Route Supervisor author CIA selection & verification IN THIS APP. This exception is CIA-only; it does NOT apply to routine COOP input orders (Convention 14 stands).
31. **CIA payment-gate** — never recommend a seller/farmer payout until the traceability chain is complete AND vet certification + transit & cattle insurance + farmer acknowledgment exist; payee must equal the penny-drop-verified registered seller. Gate failures raise a human-review exception, never a silent block; **no automated payment or rejection.**
32. **CIA evidence & anti-fraud** — cattle/ear-tag/geo evidence is live-capture only (gallery blocked), perceptual-hashed, geo-fenced; ear tag `^\d{12}$` + registry-unique; no backdated/post-purchase insurance. Fraud signals FLAG to humans (shadow-first), never auto-reject.
33. **CIA EMI = INITIATE (decided), gated by consent** — the app initiates milk-payment deductions; initiation is permitted per-loan ONLY with recorded legal authorisation + tri-partite (farmer–society–bank) consent, else falls back to track. Always reconcile ERP deductions against the schedule. (Resolves open question #1.)
34. **CIA credit ≠ KCC ≠ COOP credit** — three separate ledgers, never double-counted; milk payables are repayment evidence + recovery source only.

---

## OUT OF SCOPE — do not build, do not import

- **PMFBY / crop insurance / NCIP** — no `crop-*`, NCIP ids/bridge, KRPH/DigiClaim, CCE, AGRI_OFFICIAL/CSC_VLE, 72-h crop triggers.
- `roots/crop`, `vyapar`, `sentinel`, `agristack`, `admin` EJS, DRISHTI engines 3–6, crop mandi PULSE stack.
- **AA (Account Aggregator)** — does not exist in FarmerPay code; Phase-4 net-new if ever.
- **Co-op *input-order* approval surfaces** — ERP-side. No instant auto-approval, no `avgMilkValue×factor`. *(Exception: CIA beneficiary-selection & field-verification ARE in-app — Convention 30. This carve-out is CIA-only and does not extend to input orders.)*
- **CIA out-of-scope:** no automated payment recommendation or auto-rejection; no backdated/post-purchase insurance; no non-dairy/non-cattle induction in v1; no CIA-initiated milk-payment deduction without legal authorisation + consent; muzzle/liveness/ML-risk/doc-forensics are optional-advanced (shadow-first), not launch-blocking.
- dairy_cooperative deferred: `emi`, `scheme`, `leadgen`, `payments`, `loanorig`, `feedback`, 360° profile.
- Auto-renewal without opt-in; auto-claim-denial; passwords; voice drafts that auto-commit; models that auto-reject; training on unconsented data; CV "diagnosis" (advisory wording only).
- Premature infra: Kafka/ClickHouse/Temporal/GPU before scale proves it.

**V1 DEFERRALS (build in Phase 4, not before):** fishery ERP module (catalog entry only in v1) · scenarios module · egg/broiler/fish rate boards · banker live dashboard (PDF pack instead) · gov white-label (generated Annexure XX instead) · standalone POSP dashboard (field-PWA view instead) · assistant/Pashu Mitra (AI-2).

---

## Build Phases (re-sequenced v0.6 — the wedge leads; product × AI tracks)

| Phase | Product scope | AI track | Exit criteria |
|---|---|---|---|
| **0 — Extraction** | FarmerPay modules + dairy_cooperative ERP adapter/input/org; port screens; **fresh Postgres migrations**; **offline sync foundation**; ERP adapter **live/webhook/filedrop/mock** | **AI-0a:** `domain_events` outbox, consent purposes (incl. `model_improvement`), evidence conventions | Register→log→P&L on PG; app works airplane-mode; filedrop reconciliation green |
| **1 — THE WEDGE: COOP** | Membership link, **milk passbook**, 70% engine, windowed ordering, ERP mirror, dispatch alerts, receipt — **filedrop acceptable for launch**; join-society nudge | voice-ordering prep | Members check passbook weekly (WAU target); full window cycle: order → receipt in-app |
| **2 — Creditworthy (KCC)** | Catalog (ALL allied incl. FISHERY) + SoF registry + scheme configs; Limit Engine + BOTH fixture tests; TRUST + co-op evidence; KCC_ALLIED_COMPOSITE origination; **LT drawdown**; **renewal-pack PDF = banker interface**; Finacle prefill | **AI-0b:** voice logging v1 (Hindi ASR + confirm cards), on-device capture QC, tag OCR | Sanction-ready application from passbook+logbook data; drawdown → disbursement mirrored; voice adoption measured |
| **3 — Protected (Pashu Suraksha)** | Suraksha slices: P0 prototype → KAVACH → renewal ★ → CLAIMS+SLA → `pashu-*` → field roles on **ONE PWA** | **AI-1:** muzzle capture + embeddings (shadow dedupe), doc-AI vet certs, IVR twin | Insured via 4-role flow; claim on visible clock; muzzle gallery growing |
| **4 — Market-worthy + scale** | Deferred list lands: fishery ERP, scenarios, egg/fish rates, banker/gov dashboards, group enrolment (COOP × KAVACH), coop emi/scheme/leadgen, multi-state, more insurers, FPO | **AI-2:** muzzle assist, renewal propensity, fraud scores, yield forecast, **assistant**, grievance triage → **AI-3:** EWS, price/THI, DUSS demand, disease screening | Fraud queue live; assistant grounded; second state/activity onboarded |

**P0 prototype rule (Suraksha §8A):** every farmer/PWA screen — including passbook/order (first!), LT drawdown, voice-ingest and muzzle-capture flows — is first a clickable HTML mockup in `prototypes/insurance/` with mock JSON. Settled prototypes are the spec. **CIA follows the same rule:** every CIA farmer/field/DCS/DUSS/bank/UCDF screen is first a clickable HTML mock in `prototypes/cattle-induction/` with mock JSON.

### CIA phase track (parallel; reuses ERP adapter, KAVACH, offline sync, `location`)
| CIA phase | Scope | Exit criteria |
|---|---|---|
| **CIA-1 — Application & Capture (MVP)** | Scheme/eligibility publish · EOI · DCS selection + resolution · application + doc upload (ERP pre-fill) · **offline** supervisor field-verify (geo + live photos) · DUSS bulk processing + prescribed-format generation · **bank status via file upload (non-integrated)** · cattle-purchase **document/info capture**. **No money movement.** | Sanction-ready verified application produced digitally end-to-end; supervisor verifies offline & syncs; UCDF sees live status |
| **CIA-2 — Financial & ERP** | Subsidy calc + DUSS→bank transfer record · disbursement record · loan↔milk-account map · EMI schedule ingest · **milk-payment-linked EMI tracking** (due/deducted/remitted/pending/partial/overdue/default) · repayment/default reports | Every rupee reconcilable; deduction↔EMI match rate green |
| **CIA-3 — Advanced Verification** | Full guided purchase: seller reg + penny-drop · vet exam/valuation/e-sign · geo-fence · ear-tag registry uniqueness · duplicate-photo hash · transit + cattle insurance (KAVACH) · **payment-gate + seller-payment recommendation** · fraud exception panel (shadow) | No payment without complete verification; substitution/duplication blocked |
| **CIA-4 — Full Lifecycle & Analytics** | Post-purchase 7/30/90-day inspections · yield/reproduction monitoring · claim workflow (SLA + penal interest) · muzzle re-ID asset verify (shadow→assist) · CIA ML (fraud/price/yield) · bank/gov live dashboards · group enrolment | Inspection completion + claim SLA + asset-existence-verified % |

---

## Farmer App Screen Groups (~50)

auth (3) · onboarding (3, multi-activity + society link) · home (passbook summary + limit card + renewal-due hero + advisory + society/nudge card) · registers (6) · logbook (6, voice-first, persistent mic) · health & breeding (3) · P&L (2) · PoP progress (1) · **kcc-*** (7: calculator, eligibility+TRUST, application, limit dashboard, transactions, **LT drawdown**, renewal pack) · **pashu-*** (10: home, animals, tagging + muzzle burst, quote, enrol, vault, renew ★, report-death, claim, wellness-P2) · **society-*** (5: home, order + 70%-limit meter + voice, orders timeline, receipt, milk passbook; non-members → join-society nudge) · market & advisory (3: milk rates, feed prices, advisory feed) · profile & compliance (2, incl. consent purposes). *(Fishery screens: Phase 4.)* Reuse `voiceInput.ts`, `ocrService.ts`, `biometric.ts`. One app — insurance and co-op are screen groups, not separate apps.

**Field PWA (~8 screens):** role-gated task queues (VO: exams/valuations/e-PM + honorarium ledger · surveyor: SLA queue + field filing · POSP: tasks + escrow card), evidence capture with on-device QC, offline end-to-end.

**CIA screen groups (see PRD Part 6 for the full 52-screen inventory):** **cia-farmer** (scheme, eligibility checker, EOI, application, doc checklist, status tracker, guided-purchase hub + seller/inspection/geo/ear-tag/transport/insurance/acknowledge sub-screens, EMI ledger, default alert, grievance, assisted mode) · **cia-field PWA** (supervisor verification checklist + geo-tag + existing-cattle; vet exam/valuation/fitness e-sign; post-arrival inspection; sync/conflict — offline end-to-end, role-gated, shared shell) · **cia-dcs** (interested members, selection/agenda, board decision + resolution, doc verify, tracker) · **cia-duss** (bulk inbox, scrutiny, subsidy calc, deficiency memo, bank batch + prescribed-format, sanction/subsidy tracking, district dashboard) · **cia-bank** (packet inbox/API log, sanction upload/confirm, loan-a/c + disbursement upload, EMI/default upload, reconciliation) · **cia-ucdf** (command dashboard, reports/exports, audit-log viewer, config, notifications centre). Reuse `voiceInput.ts`, `ocrService.ts`, `biometric.ts`, `geo.ts`, offline queue.

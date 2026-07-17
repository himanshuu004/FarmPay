# FarmerPay Suraksha — Insurance Operating Layer (System Design & Implementation Plan)

**Status:** Design — approved-for-build pending review
**Date:** June 2026
**Owner:** Platform Engineering
**Evidence base:** `FarmerPay_InsurTech_Business_Plan.md` (Jun 2026); Uttarakhand field surveys n=3,623; PMFBY OG 2023; NLM Comprehensive OG (DAHD, Jan 2025); WINDS Manual 2023.
**Companion docs:** `AA-SYSTEM-DESIGN-V2.md`, `DRISHTI-SYSTEM-DESIGN.md`, `ARCHITECTURE.md`, `insurance_survey_dashboard.html`.

> This document is the build specification for the insurance layer. It follows the established platform conventions: MVC + service layer, `snake_case` DB / `camelCase` DTO, lazy-loaded `getDb()`, JWT + MPIN auth, Joi validators, Sequelize models registered in `src/shared/models/index.js`, routes mounted in `src/app.js`. Nothing here invents a new stack — insurance becomes **two new backend modules (KAVACH, CLAIMS)** plus extensions to existing modules, and **one new farmer-app screen group**.

---

## 1. Executive Summary

The platform today has a **thin `INSURANCE` module (Phase-2 POS)**: a product catalog (`insurance_products`), a premium-quote calculator, and referral logging (`insurance_pos_referrals`) that deep-links farmers out to external portals. It does **not** issue policies, track renewals, capture claims, or hold evidence.

The business plan's core finding is that India's farm-insurance failure is **operational, not demand-side**: 80.7% of farmers would insure crops every season if it were easy and timely; 94.1% of livestock owners would renew if reminded; every stakeholder group's #1 ask is the same — **claim settlement in 15–20 days**. FarmerPay already occupies the exact last-mile layer where this breaks.

This design builds the operating layer in **vertical slices** mapped to the plan's phasing:

| Module | What it owns | Plan ref |
|---|---|---|
| **KAVACH** (insurance core) | products, plans, quotes, proposals, policies, policy-assets (link to ROOTS cycle / dairy animal), premium ledger, commission ledger (escrow), renewal journeys | Part 7.2 |
| **CLAIMS** | intimations, hash-chained evidence, SLA clocks, surveyor/VO tasks, settlements, grievances, fraud flags | Part 7.2 |
| **Extensions** | DICE (embedded/financed premium), TRUST (insurance pillar), SENTINEL (uninsured-risk EWS), DRISHTI (parametric sim), CHOICE (POSP commission escrow), ROOTS-Dairy (tag registry), AA (claim-credit detection) | Part 5.2 |

**Hard architectural rule (Part 6I — NCIP Non-Duplication Charter):** For crop (PMFBY), NCIP remains the statutory system of record. FarmerPay **consumes** NCIP master + status data keyed to the NCIP application ID, captures enrolment **once**, and submits through an authorised channel exactly once. FarmerPay is the system of record only where NCIP has no writ: **livestock** (the DAHD portal is "not yet functional", NLM p.55), **renewals, POSP commissions, VO honoraria, field verification, grievance ageing**.

**Two separate farmer workflows.** Crop and livestock fail for opposite reasons (crop fails at *entry* — awareness/land-records/trust; livestock fails at *repeat* — premium/reminders/scheme-continuity) and run under different statutes (PMFBY OG vs NLM OG), different actors (bank/CSC/insurer vs VO/insurer), and different system-of-record rules (NCIP mirror vs FarmerPay-owned). They are therefore designed as **two distinct journeys**, not one merged flow — see §8B (PMFBY Crop) and §8C (Animal Husbandry). They share the KAVACH/CLAIMS backend and the policy-vault/claim-tracker primitives, but never share a screen.

**Desktop-first, then mobile.** The **initial deliverable is a desktop interactive prototype** (clickable HTML, single-file, in the spirit of `insurance_survey_dashboard.html`) so features can be visualised and changed rapidly before any React Native / backend code is committed. The prototype covers both farmer workflows and the role dashboards as navigable mockups wired to mock data. Production then ports the validated screens to the RN super-app (farmer) and Next.js (dashboards). See §8A.

**Build order (recommended):** **P0 Desktop prototype** (two farmer workflows + surveyor / POSP / insurer-analytics dashboards, clickable, mock data) → P1.0 KAVACH foundation → P1.1 Livestock renewal engine (plan's #1 ROI feature) → P1.2 CLAIMS + SLA tracker → P1.3 farmer workflows in RN → P1.4 policy vault + loss/death evidence + field roles → P2 production dashboards & ML.

---

## 2. Design Principles

1. **Build on, not beside.** Two new modules in `src/modules/` (`kavach`, `claims`) following the same folder shape as `aa/`, `dice/`, `trust/`. No new runtime, no new datastore.
2. **Single-entry / NCIP-first for crop.** Never maintain an editable parallel copy of NCIP master data. Display-only mirror keyed by `ncip_application_id`. (§11)
3. **System-of-record for livestock.** Full lifecycle owned in-platform, but every register is **export-compatible** with the future DAHD portal schema and NLM Annexure XX — export-friendliness is itself a government sales feature.
4. **Rules first, ML later, AI only where vision/voice is unavoidable.** Every feature works on deterministic rules at launch; ML/AI are phase-gated (Part 6J / Part 8). P1 ships zero models.
5. **Evidence is immutable.** `claim_events` is an append-only, hash-chained audit log; `evidence_files` preserve device/GPS/timestamp EXIF and content-addressed hashes. Lossless upload kills the WhatsApp-compression failure (36.7% of VOs).
6. **Claims decisions are never automated.** OG 31.1.4 makes adjudication non-outsourceable. All scoring is decision-support routed to a human; no auto-denial. DPDP purpose-limitation on all data.
7. **Reuse existing rails.** OCR (`tesseract.js`), `voiceInput.ts`, AA consent, COMPLIANCE consent records, `notifications` workers, the `roleCheck` middleware, the scheduled-job runner.
8. **Desktop-first prototype before production.** Visualise and iterate every screen as a clickable desktop mockup (mock data, no backend) so feature decisions are cheap to change. Only port to RN/Next.js once the flow is settled.
9. **Two farmer workflows, never merged.** PMFBY crop and NLM animal husbandry are separate end-to-end journeys with separate entry points, separate enrolment/claim logic, and separate system-of-record rules. Shared backend, distinct UX.
10. **Role-separated dashboards.** Each professional persona — surveyor, POSP/POS player, insurer analytics, banker, government — gets its own dashboard surface gated by `roleCheck`, never a shared screen with toggles.

---

## 3. Where It Plugs Into the Existing Platform

| Existing component | Insurance role | Concrete hook |
|---|---|---|
| `modules/insurance` (POS) | Becomes KAVACH's read-only **catalog + quote** sub-surface | `insurance_products` reused as KAVACH product master; quote service reused by enrolment |
| `modules/dice` (`InsuranceEnrollment`, `LoanInsuranceBundled`) | Embedded credit-linked covers; **premium financing on KCC** (K1) | KAVACH policy references `dice` loan account for claim-receivable mapping |
| `modules/roots/dairy` (`dairy_animals` — already has `tag_number`, `animal_identification_number`, `primary_photo_url`) | **Animal registry** for livestock policies | `policy_assets.asset_ref_id` → `dairy_animals.id`; tag/photo reused for enrolment evidence |
| `modules/roots/crop` (cultivation cycles) | **Sowing proof / crop+area pre-fill** | `policy_assets.asset_ref_id` → crop cycle id |
| `modules/aa` | Claim-credit detection, premium affordability | `incomeClassifier` flags claim credits → auto-confirm settlement payment |
| `modules/sage` + `modules/pulse` | 72-hour weather-triggered loss alerts | new trigger consumer fans out "report within 72h" pushes |
| `modules/drishti` | Insurance scenario + parametric design (screen `drishti-insurance` exists) | KAVACH exposes policy/claim aggregates to DRISHTI engines |
| `modules/sentinel` | Uninsured-exposure EWS; claim-delay → repayment-risk | new EWS alert type fed by KAVACH coverage + CLAIMS SLA |
| `modules/sathi` + `modules/choice` | **POSP operating layer** + commission escrow | CLAIMS/KAVACH tasks land in Sathi queue; commission ledger uses CHOICE engine |
| `modules/bank` | KCC↔policy reconciliation | Finacle/CSV import matched to KAVACH policies by account + Aadhaar |
| `modules/compliance` | DPDP consent records | every insurer/state data share writes a consent record |
| `modules/notifications` (SMS/push/WhatsApp workers) | Reminder + receipt rail | renewal/expiry/claim-status fan-out |

---

## 4. Module File Structure

```
src/modules/kavach/
├── index.js                         # exports router(s)
├── routes/
│   ├── kavachRoutes.js              # farmer + sathi (authenticated)
│   └── adminKavachRoutes.js         # insurer_ops / gov_viewer (roleCheck)
├── controllers/
│   ├── productController.js         # (delegates to existing insurance catalog)
│   ├── quoteController.js           # premium/subsidy calculator
│   ├── proposalController.js        # enrolment proposals
│   ├── policyController.js          # policies, vault, endorsements
│   ├── renewalController.js         # renewal journeys, one-tap renew
│   └── commissionController.js      # POSP commission ledger / escrow
├── services/
│   ├── productCatalogService.js     # reuse insurance/productCatalogService
│   ├── premiumQuoteService.js       # reuse + extend (cattle-unit cap, 15% share)
│   ├── proposalService.js
│   ├── policyService.js
│   ├── policyAssetService.js        # links to ROOTS cycle / dairy animal
│   ├── renewalService.js            # core P1.1
│   ├── commissionEscrowService.js   # state machine
│   └── ncipBridgeService.js         # consume/observe NCIP (§11)
├── models/
│   ├── InsurancePlan.js
│   ├── InsuranceProposal.js
│   ├── InsurancePolicy.js
│   ├── PolicyAsset.js
│   ├── PremiumLedger.js
│   ├── CommissionLedger.js
│   └── RenewalJourney.js
├── validators/kavachValidator.js
└── workers/
    └── renewalReminderWorker.js     # RabbitMQ consumer

src/modules/claims/
├── index.js
├── routes/
│   ├── claimsRoutes.js              # farmer + sathi
│   ├── fieldRoutes.js               # vet / surveyor (roleCheck)
│   └── adminClaimsRoutes.js         # insurer_ops / gov_viewer
├── controllers/
│   ├── intimationController.js
│   ├── evidenceController.js
│   ├── claimController.js           # SLA + status
│   ├── taskController.js            # surveyor/VO task allocation
│   └── grievanceController.js
├── services/
│   ├── intimationService.js
│   ├── evidenceService.js           # hash-chain + EXIF preserve
│   ├── slaClockService.js           # per-stage clocks + 12% penal interest
│   ├── claimService.js
│   ├── taskService.js
│   ├── grievanceService.js
│   └── fraudRulesService.js         # P1 deterministic flags only
├── models/
│   ├── ClaimCase.js
│   ├── ClaimEvent.js                # append-only, hash-chained
│   ├── EvidenceFile.js
│   ├── SurveyorTask.js
│   ├── GrievanceTicket.js
│   └── VetHonorariumLedger.js
├── validators/claimsValidator.js
└── workers/
    └── slaBreachWorker.js           # RabbitMQ: detect breaches, fan-out alerts
```

Register every model in `src/shared/models/index.js` (alongside the existing `InsuranceProduct, InsurancePosReferral` block at ~L587) and mount routers in `src/app.js` after the existing `/insurance` mount:

```js
app.use(`${config.apiPrefix}/kavach`, require('./modules/kavach'));
const { claimsRoutes, fieldRoutes, adminClaimsRoutes } = require('./modules/claims');
app.use(`${config.apiPrefix}/claims`, claimsRoutes);
app.use(`${config.apiPrefix}/claims/field`, fieldRoutes);
app.use(`${config.apiPrefix}/admin/claims`, adminClaimsRoutes);
```

---

## 5. Database Schema

All tables: `snake_case`, integer auto-increment internal PK, `*_uuid` STRING(36) external id, `is_active` boolean, `created_at`/`updated_at` via `underscored: true`. Money `DECIMAL(15,2)`, percentages `DECIMAL(6,2)`.

### 5.1 KAVACH tables

**`insurance_plans`** — a sellable variant of a product (term, indemnity, SI basis).

| Column | Type | Notes |
|---|---|---|
| id / plan_uuid | INT / STR(36) | |
| product_id | INT FK → insurance_products | reuse existing catalog |
| plan_code | STR(50) unique | e.g. `NLM-CATTLE-3YR` |
| term_months | INT | 12 / 24 / 36 (NLM prefers 36) |
| farmer_share_pct | DEC(6,2) | 2.0 / 1.5 / 5.0 crop; 15.0 NLM |
| govt_share_pct | DEC(6,2) | 85.0 NLM; centre:state split stored in JSON |
| si_basis | ENUM | `scale_of_finance` / `notional_avg_value` / `market_value` |
| indemnity_level | DEC(6,2) | 70/80/90 (crop) |
| cattle_unit_cap | INT | 10 (5 pig/rabbit) |
| waiting_period_days | INT | 21 (NLM) |
| rules_json | JSON | cut-offs, NER/Himalayan flags, add-ons |

**`insurance_proposals`** — a captured-once enrolment intent before it becomes a policy.

| Column | Type | Notes |
|---|---|---|
| id / proposal_uuid | INT / STR(36) | |
| farmer_id | INT FK → users | |
| plan_id | INT FK | |
| asset_type | ENUM | `crop_cycle` / `dairy_animal` / `pond` / `other` |
| asset_ref_id | INT | id in ROOTS/dairy table (no re-typing) |
| channel | ENUM | `self` / `sathi` / `bank` / `csc` / `intermediary` |
| sathi_id | INT FK nullable | for POSP attribution |
| sum_insured | DEC(15,2) | computed from SI basis |
| premium_farmer | DEC(15,2) | |
| premium_total | DEC(15,2) | |
| consent_record_id | INT FK → compliance | DPDP consent |
| status | ENUM | `draft`/`ready`/`submitted`/`issued`/`rejected` |
| ncip_application_id | STR(64) nullable | crop only — the FK to the statutory record |
| submitted_at | DATETIME | |

**`insurance_policies`** — issued cover (system-of-record for livestock; display-mirror for crop).

| Column | Type | Notes |
|---|---|---|
| id / policy_uuid | INT / STR(36) | |
| proposal_id | INT FK | |
| farmer_id | INT FK | |
| plan_id | INT FK | |
| policy_number | STR(64) | insurer's number (livestock) |
| ncip_application_id | STR(64) nullable | crop key — **never re-numbered locally** |
| insurer_name | STR(150) | |
| sum_insured | DEC(15,2) | |
| premium_farmer / premium_total | DEC(15,2) | |
| start_date / end_date | DATEONLY | |
| status | ENUM | `active`/`lapsed`/`expired`/`claimed`/`cancelled` |
| source_of_record | ENUM | `farmerpay` / `ncip_mirror` |
| policy_doc_url | STR(500) | vault object key (DigiLocker push) |
| premium_debit_confirmed | BOOL | guards "debited but no policy" alarm |
| loan_account_ref | STR(64) nullable | DICE/bank claim-receivable mapping |

**`policy_assets`** — explicit link rows (a master policy can cover many animals).

| Column | Type | Notes |
|---|---|---|
| id | INT | |
| policy_id | INT FK | |
| asset_type | ENUM | `crop_cycle`/`dairy_animal`/`pond` |
| asset_ref_id | INT | |
| tag_uid | STR(20) nullable | 12-digit NDDB UID (livestock) |
| valuation | DEC(15,2) | per-animal SI (NLM floor rules) |
| enrol_photo_owner_url / enrol_photo_tag_url | STR(500) | the 2 NLM-mandated photos |

**`premium_ledger`** — every premium money-event (farmer share, subsidy tranche, financed-on-KCC).

| Column | Type | Notes |
|---|---|---|
| id | INT | |
| policy_id | INT FK | |
| entry_type | ENUM | `farmer_debit`/`subsidy_central`/`subsidy_state`/`financed_kcc`/`refund` |
| amount | DEC(15,2) | |
| status | ENUM | `pending`/`confirmed`/`failed` |
| reference | STR(120) | bank txn / NCIP ack / PFMS ref |
| occurred_at | DATETIME | |

**`commission_ledger`** — POSP/Sathi commission with **escrow state machine** (fixes 75% late-payment).

| Column | Type | Notes |
|---|---|---|
| id | INT | |
| sathi_id | INT FK | |
| policy_id / claim_id | INT FK nullable | enrolment vs claim-assist commission |
| amount | DEC(15,2) | |
| state | ENUM | `accrued`→`escrow_held`→`qc_passed`→`released`→`paid` (or `disputed`) |
| payout_due_date | DATEONLY | T+15 commitment |
| released_at / paid_at | DATETIME | |

**`renewal_journeys`** — the P1.1 engine's state per policy.

| Column | Type | Notes |
|---|---|---|
| id | INT | |
| policy_id | INT FK | |
| farmer_id | INT FK | |
| due_date | DATEONLY | = policy.end_date − lead window |
| reminder_count | INT | |
| last_reminder_at | DATETIME | |
| channel_last | ENUM | `sms`/`whatsapp`/`push`/`ivr` |
| auto_renew_opt_in | BOOL | |
| status | ENUM | `pending`/`reminded`/`renewed`/`lapsed`/`opted_out` |
| renewed_policy_id | INT FK nullable | links to the new term |

### 5.2 CLAIMS tables

**`claim_cases`**

| Column | Type | Notes |
|---|---|---|
| id / claim_uuid | INT / STR(36) | |
| policy_id | INT FK | |
| farmer_id | INT FK | |
| claim_type | ENUM | `crop_localised`/`crop_postharvest`/`crop_yield`/`livestock_death` |
| peril | STR(80) | hail/drought/wild_animal/disease/accident… |
| intimated_at | DATETIME | starts the 72-h compliance check |
| ncip_claim_ref | STR(64) nullable | crop — pulled, not authored |
| sum_claimed | DEC(15,2) | |
| sla_stage | ENUM | `intimated`/`assessor_assigned`/`assessed`/`payment_due`/`settled`/`rejected` |
| stage_deadline_at | DATETIME | next SLA clock target |
| penal_interest_accrued | DEC(15,2) | 12% p.a., auto-computed on breach |
| settled_amount | DEC(15,2) nullable | |
| settled_at | DATETIME nullable | |

**`claim_events`** — append-only, hash-chained immutable audit (the spine of trust).

| Column | Type | Notes |
|---|---|---|
| id | INT | |
| claim_id | INT FK | |
| event_type | STR(60) | `intimated`/`evidence_added`/`assessor_assigned`/`stage_changed`/`note`… |
| actor_role | ENUM | farmer/sathi/vet/surveyor/insurer_ops/system |
| payload_json | JSON | |
| prev_hash | STR(64) | SHA-256 of previous event |
| event_hash | STR(64) | SHA-256(prev_hash + payload + ts) |
| created_at | DATETIME | never updated |

**`evidence_files`** — content-addressed, EXIF-preserved.

| Column | Type | Notes |
|---|---|---|
| id / evidence_uuid | INT / STR(36) | |
| claim_id | INT FK | |
| kind | ENUM | `loss_photo`/`liveness_video`/`tag_closeup`/`carcass`/`pm_report`/`policy_doc` |
| object_key | STR(500) | object storage (lossless) |
| content_hash | STR(64) | dedup + tamper check |
| gps_lat / gps_lng | DEC(10,7) | from EXIF |
| captured_at | DATETIME | device timestamp |
| device_meta_json | JSON | model, app version |
| uploaded_offline | BOOL | offline-first flag |

**`surveyor_tasks`** — field allocation for surveyor/Sathi/VO.

| Column | Type | Notes |
|---|---|---|
| id | INT | |
| claim_id | INT FK | |
| assignee_role | ENUM | surveyor/sathi/vet |
| assignee_id | INT FK | |
| task_type | ENUM | `verify_loss`/`postmortem`/`valuation`/`tag_verify` |
| sla_due_at | DATETIME | same-day-visit clock |
| status | ENUM | `assigned`/`enroute`/`onsite`/`submitted`/`qc_passed` |
| report_json | JSON | structured checklist |

**`grievance_tickets`**

| Column | Type | Notes |
|---|---|---|
| id / ticket_uuid | INT/STR(36) | |
| farmer_id | INT FK | |
| policy_id / claim_id | INT FK nullable | |
| category | STR(60) | premium_no_policy / claim_delay / tag / valuation … |
| priority | ENUM | low/med/high |
| channel_filed | ENUM | app/voice/sathi/bank |
| routed_to | STR(60) | KRPH/SGRC/insurer/bank |
| status | ENUM | open/ack/in_progress/resolved/escalated |
| age_days | INT (derived) | 15-day disposal clock (OG 30.6.5) |

**`vet_honorarium_ledger`** — ₹50 enrolment / ₹125 PM, quarterly tracking (fixes a top VO pain).

| Column | Type | Notes |
|---|---|---|
| id | INT | vet_id, claim_id/policy_id, kind(`enrol_exam`/`postmortem`), amount, status(`accrued`/`claimed`/`paid`), quarter |

---

## 6. API Endpoints

### 6.1 KAVACH — `/api/v1/kavach` (JWT)

```
GET   /products                      # reuse insurance catalog (public passthrough)
GET   /products/grouped
POST  /quote                         # premium/subsidy calc (cattle-unit cap, 15% share)
GET   /assets/me                     # auto-listed fields + animals w/ covered badges (ROOTS+dairy)
POST  /proposals                     # capture-once enrolment proposal (pre-filled)
GET   /proposals/me
POST  /proposals/:id/submit          # submit ONCE via authorised channel (§11)
GET   /policies/me                   # protection snapshot ("3 of 5 covered")
GET   /policies/:id                  # detail + vault doc + premium trail
GET   /policies/:id/vault            # signed URL / DigiLocker push
GET   /renewals/due                  # upcoming + overdue
POST  /renewals/:policyId/renew      # ONE-TAP renew, reuse stored data
POST  /renewals/:policyId/auto       # opt-in / opt-out auto-renew
GET   /commissions/me                # Sathi escrow balance + next payout (POSP trust signal)
```

### 6.2 KAVACH admin — `/api/v1/admin/kavach` (roleCheck: insurer_ops, gov_viewer)

```
GET   /enrolment-pipeline            # channel-wise, error queues (land mismatch/dupes)
POST  /policies/:id/issue            # insurer issues → triggers vault + commission release
GET   /portfolio/coverage            # IU/block/species coverage aggregates
```

### 6.3 CLAIMS — `/api/v1/claims` (JWT)

```
POST  /intimations                   # one-tap geo-tagged loss/death intimation → case #
GET   /intimations/me
POST  /:claimId/evidence             # guided capture upload (hash + EXIF)
GET   /:claimId                      # stage-wise SLA clocks + penal-interest counter
GET   /me                            # farmer's claim list w/ status chips
GET   /:claimId/timeline             # hash-chained event audit (farmer-visible)
POST  /grievances                    # structured capture → routing
GET   /grievances/me
```

### 6.4 CLAIMS field — `/api/v1/claims/field` (roleCheck: surveyor, vet, sathi)

```
GET   /tasks/me                      # assigned queue + same-day SLA timers + route
POST  /tasks/:id/report              # file report from field (kills >5-day lag)
POST  /tasks/:id/postmortem          # VO e-PM form (₹125 honorarium auto-logged)
POST  /tasks/:id/valuation           # joint owner+insurer+VO valuation (NLM p.54)
```

### 6.5 CLAIMS admin — `/api/v1/admin/claims` (roleCheck: insurer_ops, gov_viewer)

```
GET   /queue                         # SLA breaches, fraud flags, exception dashboard
POST  /:claimId/assign               # allocate surveyor/Sathi
POST  /:claimId/settle               # record settlement instruction (human decision only)
GET   /mortality                     # livestock mortality dashboard (geo/breed/season)
GET   /grievances                    # ageing + escalation analytics
```

---

## 7. Core Service Logic

### 7.1 Premium / subsidy calculator (`premiumQuoteService`, rules-only)
- Crop: `farmer_premium = SI × {2.0 Kharif | 1.5 Rabi | 5.0 commercial}%`; subsidy = actuarial − farmer share, Centre:State 50:50 (90:10 Himalayan — Uttarakhand qualifies).
- Livestock (NLM): farmer 15%, govt 85%; **cattle-unit cap checker** (10 units; 5 pig/rabbit; 1 unit = 10 sheep/goat); SI floors ₹3,000/litre cow, ₹4,000/litre buffalo.
- Pure deterministic — stays rules forever (Part 6J #11).

### 7.2 SLA clock engine (`slaClockService`)
Per-stage statutory clocks, driven by `claim_type`:
- **Crop localised/post-harvest:** assessor ≤48h → assessment ≤10d → payment ≤15d. Yield claims: payment ≤21d of NCIP calc.
- **Livestock death:** ≤15d of document submission (NLM), 21-day waiting period from issuance.
- On breach, accrue **12% p.a. penal interest** (auto, farmer-visible) and emit a `sla_breach` event → `slaBreachWorker` fans out alerts to farmer + insurer + banker.

### 7.3 Evidence integrity (`evidenceService`)
- Compute SHA-256 `content_hash` client+server; reject silent re-compression (lossless object store).
- Preserve GPS/timestamp/device EXIF in `device_meta_json`.
- Append a `claim_events` row with `event_hash = SHA256(prev_hash + payload + ts)` — tamper-evident chain.
- P1 fraud is **deterministic rules only**: intimation >72h, missing tag, duplicate `content_hash`, geo mismatch vs policy location. ML/CV deferred to P2 (Part 8 #6).

### 7.4 Renewal engine (`renewalService` + `renewalReminderWorker`) — **P1.1, highest ROI**
- Nightly `renewalSweepJob` finds policies entering the lead window, upserts `renewal_journeys`.
- Worker fans out reminders over `notifications` (SMS/WhatsApp/push; IVR/missed-call for the 19.5% without app phones) on a cadence (e.g. T-30, T-15, T-7, T-1).
- `POST /renewals/:policyId/renew` clones the policy + assets with stored data — **zero re-documentation** (attacks the 68.4% re-paper pain).
- Auto-renew opt-in triggers issuance request automatically on due date.
- Evidence target: reminder alone lifts renewal 31%→54% (+22.6 pts).

### 7.5 Commission escrow (`commissionEscrowService`)
State machine `accrued → escrow_held → qc_passed → released → paid`, with a visible `payout_due_date` (T+15). Uses CHOICE commission infrastructure. This is the single feature the broken POSP layer never had.

### 7.6 NCIP bridge (`ncipBridgeService`) — the §11 charter in code
- **Consume, never recreate:** notified crops/IUs/SI/rates/cut-offs/status pulled and cached (Redis), never editable.
- **One keystroke chain:** proposal validated against land records/ROOTS, then submitted **once** via bank/CSC/AIDE channel (API where available, structured pre-filled sheet where not).
- **`ncip_application_id` is the foreign key** for every crop policy/claim/reconciliation row.
- **Claims: originate & observe** — intimation filed into KRPH 14447 / Crop Insurance App; computation stays in DigiClaim; FarmerPay adds only SLA clocks, evidence custody, penal-interest, farmer-visible status.
- KPI: "minutes of data entry per enrolment" ≤5; "fields typed twice" = 0.

---

## 8. Frontends — Desktop Prototype, Two Farmer Workflows, Role Dashboards

The frontend is built in two stages: **(8A) a desktop interactive prototype** to visualise and iterate features, then production ports to RN (farmer) and Next.js (dashboards). The farmer side splits into **two separate workflows** — **8B PMFBY crop** and **8C animal husbandry** — and the professional side into **role-separated surfaces** for every actor in the process: surveyor (8D), POSP (8E), insurer analytics (8F), banker + government (8G), **Veterinary Officer / AHD doctor (8H)**, and **Agriculture Department official / CSC-VLE (8I)**.

### Persona & Actor Map (the complete process)

Every actor named in PMFBY OG §38 and NLM §2.5, plus the survey personas. "Surface" = where they work in the system; "Line" = which workflow(s) they touch.

| # | Persona | Line | Role in the process | Surface | `roleCheck` |
|---|---|---|---|---|---|
| 1 | **Farmer — crop** | PMFBY | Enrols field, reports loss, tracks claim, renews | §8B farmer app (`crop-*`) | `FARMER` |
| 2 | **Farmer — livestock** | NLM | Tags animal, enrols, reports death, renews | §8C farmer app (`pashu-*`) | `FARMER` |
| 3 | **Sathi / POSP agent** | Both | Assisted enrolment, field verification, claim-assist, renewal visits; earns escrowed commission | §8E dashboard + Sathi app | `POSP` |
| 4 | **Insurance surveyor / loss adjuster** | Both | On-site loss/death verification, fraud check, files report | §8D dashboard / PWA | `SURVEYOR` |
| 5 | **Veterinary Officer (AHD doctor)** | NLM | Enrolment health exam (₹50), joint valuation, post-mortem + e-certificate (₹125); honorarium tracking | **§8H VO surface** | `VET` |
| 6 | **Agriculture Dept official** | PMFBY | Awareness/IEC, CCE conduct + co-observation, enrolment facilitation, grievance first-stop | **§8I official surface** | `AGRI_OFFICIAL` |
| 7 | **CSC e-Gov / VLE** | PMFBY | Mandatory non-loanee enrolment channel (biometric Aadhaar), T+1 premium passthrough | **§8I (CSC mode)** | `CSC_VLE` |
| 8 | **Insurer operations / analytics** | Both | Issuance, exception handling, task allocation, settlement decision, portfolio analytics | §8F dashboard | `INSURER_OPS` |
| 9 | **Banker (branch + HQ)** | PMFBY | KCC↔policy reconciliation, premium remittance, claim-receivable mapping | §8G (extends existing) | `BANKER` |
| 10 | **Government — State AHD / Agri Dept** | Both | Scheme monitoring, coverage KPIs, Annexure-XX returns, subsidy oversight | §8G white-label | `GOV_VIEWER` |
| 11 | **Gram Panchayat / BDO** | NLM | Non-technical adjudicator of valuation disputes (NLM p.54) | §8H (read + dispute view) | `GP_BDO` |
| 12 | **Local administration (DLJC / DLMC)** | PMFBY | Localized-loss survey, invokes prevented-sowing / mid-season covers | §8I (committee view) | `AGRI_OFFICIAL` |
| 13 | **Tech agency (MNCFC / MITR / TIP)** | PMFBY | Smart-sampling, YES-TECH yield models, CCE-Agri data | (integration, not a UI) — §7.6 NCIP bridge | — |
| 14 | **Reinsurer (London JV)** | Both | Burn-cost / exposure analytics consumer (P3) | §8F analytics export | `INSURER_OPS` |

Personas 1–10 get interactive surfaces in the P0 prototype. 11–12 are lighter views attached to the VO / official dashboards. 13–14 are integrations/exports, not screens.

### 8A. Desktop Interactive Prototype (P0 — first deliverable)

**Goal:** a clickable, single-file desktop mockup that lets you change features as you visualise them, *before* any backend or React Native code is committed.

| Aspect | Decision |
|---|---|
| Tech | Self-contained HTML + vanilla JS + a chart lib (Chart.js, as in `insurance_survey_dashboard.html`); no build step, opens in any browser |
| Location | `prototypes/insurance/` in the repo (e.g. `farmer-crop.html`, `farmer-livestock.html`, `dash-surveyor.html`, `dash-posp.html`, `dash-insurer.html`, `dash-vet.html`, `dash-agri-official.html`, `dash-banker-gov.html`, plus an `index.html` launcher) — or a single multi-view file with a top nav, like the survey dashboard |
| Data | **Mock JSON only** — hard-coded sample farmers, policies, claims, tasks. No API calls, no auth. Purely for visual iteration |
| Layout | Desktop viewport (≥1280px). A phone-frame container renders the farmer workflows at mobile width so the eventual RN screens are previewed in context; dashboards use full desktop width |
| Fidelity | Navigable screens with realistic copy, states (empty / active / breached SLA), and the key interactions (one-tap renew, report-loss wizard steps, SLA clock ticking) faked in JS |
| Iteration | Because it's one HTML file per surface, features can be added/removed/reordered in minutes; each settled screen becomes the spec for the RN/Next.js build |
| Not in scope | Real data, real submission, persistence, login. This is a visualisation tool, not a working app |

The prototype is the **canonical reference** the production build follows. Every §8B–8G screen below is first built here.

### 8B. PMFBY Crop Workflow (farmer)

Separate entry point ("**Fasal Suraksha**"). Statute: PMFBY OG. System-of-record: **NCIP mirror** (§11) — pre-fill and submit-once, never a parallel register. Deep-links from `activity-crop.tsx` (pre-fill from the open cultivation cycle).

| Step / screen | Purpose | Key endpoints | Crop-specific logic |
|---|---|---|---|
| `crop-home` | Fasal protection snapshot: covered fields, **enrolment cut-off countdown** (15 Jul / 15 Dec), active claim chip | `GET /kavach/policies/me?line=crop` | Cut-off urgency; loanee opt-out status |
| `crop-assets` | Auto-listed **fields** (ROOTS cycles) with covered/uncovered badges | `GET /kavach/assets/me?type=crop_cycle` | Maps cycle → notified crop/area |
| `crop-eligibility-quote` | Notified-crop check, premium (2%/1.5%/5%), subsidy transparency, SI by Scale-of-Finance | `POST /kavach/quote` | Threshold-yield / indemnity explainer |
| `crop-enrol` | DPDP consent → pre-filled proposal → KYC reuse → premium via **authorised channel** (bank/CSC/AIDE) → Sathi-assist | `POST /kavach/proposals`, `/submit` | **Single-entry to NCIP**; girdawari/land-record assist |
| `crop-vault` | Policy doc keyed to `ncip_application_id`; debit-without-policy alarm | `GET /kavach/policies/:id/vault` | NCIP app-ID is the key |
| `crop-weather-alert` | 72-hour loss-window push ("hailstorm in your block — report now") | (push) `weatherLossTriggerJob` | The 72-h compliance fix (63.4% unaware) |
| `crop-report-loss` | One-tap geo-tagged loss intimation → **into KRPH 14447 / Crop Insurance App** + case # | `POST /claims/intimations` | Originate-and-observe; post-harvest/localised rules |
| `crop-claim` | SLA clocks (assessor 48h → assessment 10d → payment 15d; yield 21d) + 12% penal counter; status **pulled** from NCIP/DigiClaim | `GET /claims/:id`, `/:id/timeline` | Read-only NCIP status pull |
| `crop-grievance` | Structured + voice grievance → KRPH/SGRC routing | `POST /claims/grievances` | 15-day disposal clock |
| `crop-literacy` | Audio-first PMFBY lessons (Hindi/Garhwali/Kumaoni) | `voiceInput.ts` | Wild-animal add-on explainer |

### 8C. Animal Husbandry Workflow (farmer)

Separate entry point ("**Pashu Suraksha**"). Statute: NLM OG. System-of-record: **FarmerPay-owned** (DAHD portal not live), export-compatible with Annexure XX. Deep-links from `activity-dairy.tsx` (and goatery/poultry where NLM-eligible). Renewal-led, because livestock fails at *repeat*.

| Step / screen | Purpose | Key endpoints | Livestock-specific logic |
|---|---|---|---|
| `pashu-home` | Pashu protection snapshot: insured animals, **renewal-due alert** front-and-centre, active claim | `GET /kavach/policies/me?line=livestock`, `/renewals/due` | Renewal is the hero, not enrolment |
| `pashu-animals` | Animal registry from **dairy herd register**: species, breed, tag, photo, value | `GET /kavach/assets/me?type=dairy_animal` | 12-digit NDDB UID + QR; 2 NLM photos |
| `pashu-tagging` | Tag/UID capture + the two mandated photos (owner+animal, tag-visible) | `POST /kavach/proposals` (asset) | Tag-care counselling; fixes 49.2% tagging |
| `pashu-quote` | 15% beneficiary share; **cattle-unit cap checker** (10 units; 5 pig/rabbit); SI floors ₹3k/₹4k per litre | `POST /kavach/quote` | NLM valuation (owner+insurer+VO) |
| `pashu-enrol` | Consent → pre-filled proposal → premium pay → **3-year term default** (K5) | `POST /kavach/proposals`, `/submit` | 21-day waiting period shown |
| `pashu-vault` | Policy delivered **to the farmer** (DigiLocker/SMS) — kills the 9.6% custody scandal | `GET /kavach/policies/:id/vault` | Never stays with VO |
| `pashu-renew` ⭐ | **Renewal engine**: expiry reminders → one-tap renew (reuse stored data) → auto-renew toggle | `POST /kavach/renewals/:id/renew`, `/auto` | The #1 ROI feature (+22.6 pts) |
| `pashu-report-death` | Guided death intimation: geo/time-stamped **liveness video**, tag close-up, carcass; instant case # to insurer + VO + surveyor | `POST /claims/intimations`, `/:id/evidence` | Lossless upload (no WhatsApp compression); no carcass-wait |
| `pashu-claim` | NLM 15-day clock + 12% compound-penalty counter; 4-document checklist (refuses to ask for more) | `GET /claims/:id`, `/:id/timeline` | NLM-only 4 docs |
| `pashu-wellness` | (P2) vet teleconsult / vaccination nudges wrapped around the policy (K6) | — | Answers the 88.6% wanting treatment cover |

### 8D. Surveyor Dashboard (web)

Persona: insurance loss adjuster. `roleCheck: SURVEYOR`. New Next.js app (or PWA). Fixes the >5-day report lag (71.8%) and the fraud-verification gap (97.4%).

- **Assigned claims queue** with same-day-visit SLA timers + route map.
- **Case file**: intimation time, tag history, enrolment photos, P1 rule-based fraud flags (late intimation, geo mismatch, duplicate image hash).
- **On-site verification checklist** → carcass/tag/owner photo match → **file report from the field in one session**.
- **Hash-chained evidence pack** submitted to insurer; payment-stage clock auto-starts.
- **Pre-insurance live-animal survey** capture (94.9% demand it) feeding the animal gallery.
- Surveyor performance score (turnaround, QC pass).
- Endpoints: `GET /claims/field/tasks/me`, `POST /claims/field/tasks/:id/report`.

### 8E. POSP / POS-Player Dashboard (web + Sathi-app extension)

Persona: village POSP agent / Sathi. `roleCheck: POSP`. The absorb-the-broken-layer play — the trust signal the starved POSP layer never had (75% unpaid on time).

- **Task queue + earnings card**: today's enrolments / verifications / claim-assists / renewal visits by distance + deadline; **escrowed-commission balance and next payout date on top**.
- **Assisted enrolment** (crop + livestock): farmer lookup → pre-filled proposal → capture only what's missing → offline queue.
- **Commission ledger** with the escrow state machine (`accrued → escrow_held → qc_passed → released → paid`), T+15 due dates, dispute button.
- **LMS training** progress (15-hr IRDAI POSP cert + refreshers; 55% never trained) with certification gates unlocking product lines.
- **Helpline access** (95% want it).
- Endpoints: `GET /kavach/commissions/me`, `GET /claims/field/tasks/me`.

### 8F. Insurance-Company Analytics Dashboard (web)

Persona: insurer operations + analytics. `roleCheck: INSURER_OPS`. Makes the blame-circle visible and the back-office fast.

- **Exception dashboard**: enrolment error queues (land-record mismatch 52.8%, duplicates 44.4%), claim SLA breaches, fraud flags.
- **Enrolment pipeline** (channel-wise) + policy issuance with T+1 reconciliation.
- **Risk-exposure** by IU/block/species; weather + satellite (WINDS/IMD) risk map.
- **Field-verification task allocation** to Sathis/surveyors with same-day SLAs.
- **Claims audit trail** (every photo geo/time-stamped, hash-chained) + **subsidy-tranche position** (the 80.6% hidden bottleneck made explicit).
- **Livestock mortality dashboard** by geography/breed/season; loss-ratio + **burn-cost / reinsurance packs** (P3, feeds the London JV).
- Endpoints: `GET /admin/claims/queue`, `/mortality`, `GET /admin/kavach/enrolment-pipeline`, `/portfolio/coverage`.

### 8G. Banker + Government Dashboards (extend / white-label)

- **Banker** (extends existing 31-page dashboard, `roleCheck: BANKER`): KCC↔policy coverage per loan account, 15-day remittance-deadline tracker (OG 17.2 liability flag), claim-receivable mapping, insurance-gap alerts, claim-delay → repayment-risk (SENTINEL).
- **Government / AHD** (white-label of the insurer dashboard, `roleCheck: GOV_VIEWER`): district coverage KPIs, tagging coverage vs 49.2% reality, SLA-breach + 12%-penalty exposure, grievance pendency, **auto-generated Annexure-XX-equivalent monthly report** replacing paper returns.

### 8H. Veterinary Officer / Animal Husbandry Doctor Dashboard (web + field PWA)

Persona: AHD veterinary officer — the human the whole livestock chain depends on. `roleCheck: VET`. Survey pain this fixes: "Insurance is liability on VO", 84.1% say the digital system is inadequate, policy stays with the VO in 63.6% of cases, honoraria paid late, 77.2% face photo-upload failure.

- **Today's requests** queue: enrolment health examinations, joint valuations, and post-mortems near me, each a ≤5-minute structured e-form, sorted by distance/deadline.
- **Enrolment health certificate** (₹50 honorarium auto-logged) — animal fitness at policy issuance.
- **Joint valuation capture** (owner + insurer + VO, NLM p.54) with SI-floor helper (₹3,000/litre cow, ₹4,000/litre buffalo); valuation-dispute hand-off to Gram Panchayat/BDO (persona 11).
- **e-Post-mortem certificate** with guided, geo/time-stamped, lossless evidence capture (₹125 honorarium auto-logged) — the mandatory 4th claim document (NLM p.55).
- **Honorarium ledger** (`vet_honorarium_ledger`): quarterly accrual → claimed → paid tracking — the current pain, made visible.
- **Workload view** proving the "liability on VO" burden is shrinking; **policy never lands on the VO again** (digital delivery straight to the farmer).
- Tagging-support tools: NDDB UID/QR verify, tag-care counselling checklist (addresses the 49.2% tagging gap).
- Endpoints: `GET /claims/field/tasks/me`, `POST /claims/field/tasks/:id/postmortem`, `/valuation`; `GET /kavach/.../honorarium` (vet ledger).

### 8I. Agriculture Department Official / CSC-VLE Dashboard (web)

Persona: Agriculture Department officer and CSC e-Governance VLE — the PMFBY frontline. `roleCheck: AGRI_OFFICIAL` (officer) / `CSC_VLE` (VLE mode). Survey pain this fixes: distrust is the officials' #1 barrier (59.6%), 46.6% got no adequate PMFBY training, NCIP connectivity/slow-portal issues (59%/53.9%), CCE weather/equipment/staff failures, banks/officials are untooled grievance desks.

- **District / block coverage view**: enrolment vs target, notified-crop status, cut-off countdowns; penetration league tables to drive the non-loanee ≥10% growth obligation.
- **Awareness / IEC camp planner** (insurer-IEC-funded, OG 26.4.8): schedule village camps, log attendance, hand to Sathi workforce.
- **CCE co-observation module** (CCE-Agri-compatible): geo-tagged, time-stamped, photographed crop-cutting evidence; smart-sampling plot support — supplements the official CCE the OG itself calls unreliable.
- **Assisted / non-loanee enrolment (CSC-VLE mode)**: biometric-Aadhaar capture, T+1 premium passthrough, VLE-error liability guardrails (OG 38.6.10); **VLEs cannot charge farmers** — enforced in UX.
- **Grievance first-stop**: structured intake → KRPH/SGRC routing with 15-day disposal clock (replaces the untooled desk).
- **Localized-loss survey** entry for DLJC/DLMC (persona 12): prevented-sowing / mid-season invocation recommendations.
- **Training (LMS)**: PMFBY modules + certification (fixes the 46.6% under-trained officials).
- Endpoints: `GET /admin/kavach/portfolio/coverage`, `GET /admin/claims/grievances`, CCE co-observation upload via `POST /claims/.../evidence` (typed `cce_observation`).

### Production targets (after prototype sign-off)

- **Farmer:** screens ported to `farmer-app/app/` under two groups (`crop-*`, `pashu-*`), RN 0.81 + Expo Router 6, new lib `farmer-app/lib/suraksha.ts`, reusing `ocrService.ts`, `voiceInput.ts`, `biometric.ts`, AA consent. Entry cards on the home tab and `more.tsx`. **One app — insurance is a screen group inside FarmerPay, not a second app** (the zero-re-entry value prop requires shared data; a second app reintroduces double login/KYC/sync).
- **Dashboards:** Surveyor + POSP + Insurer as new Next.js apps (shadcn/ui + Recharts, same stack as `dashboard/`); Banker extends the existing app; Government is a white-label of the insurer app.

---

## 9. Cross-Module Bridges

| Bridge | Direction | Effect |
|---|---|---|
| KAVACH → CLAIMS/VO (field task) | livestock enrolment proposal submitted | **raises a VO verification ticket** (enrolment health exam, NLM ₹50); policy issues only on VO sign-off, then vault delivery + ₹50 honorarium logged |
| AA → CLAIMS | `incomeClassifier` detects a claim credit in bank statement | auto-confirm settlement payment; SMS "₹xx credited for claim #…" |
| KAVACH → TRUST | policy held + honest claim outcomes | new insurance scoring pillar; insured farmers earn leverage |
| KAVACH+CLAIMS → SENTINEL | uninsured asset + adverse weather; claim delay >90d | EWS alert "borrower's crop uninsured + drought"; repayment-stress signal |
| KAVACH → DRISHTI | policy/claim aggregates | pre-purchase what-if; banker portfolio stress with/without insurance; parametric lab |
| ROOTS-Dairy → KAVACH | `dairy_animals` tag/photo/value | animal registry for livestock policies (no re-entry) |
| ROOTS-Crop → KAVACH | cultivation cycle | sowing proof + crop/area pre-fill |
| DICE → KAVACH | KCC loan account | premium financing (K1); claim-receivable mapping |
| CHOICE ↔ KAVACH | commission engine | escrowed POSP commissions |
| SAGE/PULSE → CLAIMS | WINDS/IMD weather triggers | 72-hour proactive loss-alert pushes |

---

## 10. Infrastructure

**Redis cache keys**
```
kavach:catalog:grouped               TTL 1h
kavach:ncip:notified:<district>      TTL 6h   (consumed NCIP master)
kavach:policy:snapshot:<farmerId>    TTL 10m
claims:sla:<claimId>                 TTL 5m
```
Invalidate on policy issue/renew, claim stage change, evidence add.

**RabbitMQ queues**
```
kavach.renewal.reminders     # fan-out renewal nudges (renewalReminderWorker)
kavach.policy.issued         # vault push + commission release + receipt SMS
claims.evidence.process      # hash/EXIF validation, thumbnailing
claims.sla.breach            # breach detection → alerts (slaBreachWorker)
claims.notify                # status updates to farmer/insurer/banker
```

**Scheduled jobs** (add to existing runner; pattern of `aaConsentExpiryJob`, `rootsStageNotificationJob`)
```
renewalSweepJob              # nightly: populate/advance renewal_journeys
slaClockTickJob              # hourly: advance clocks, accrue penal interest
premiumDebitWatchJob         # daily: flag "debited but no policy" (premium_debit_confirmed=false > N days)
commissionPayoutJob          # daily: release escrow on QC pass + T+15 due
grievanceAgeingJob           # daily: 15-day disposal clock + escalation
weatherLossTriggerJob        # consume WINDS/IMD → 72h alerts (via SAGE/PULSE)
```

**Security / compliance (Part 7.5)**
- New `roleCheck` roles: `POSP`, `SURVEYOR`, `VET`, `INSURER_OPS`, `GOV_VIEWER`, `AGRI_OFFICIAL`, `CSC_VLE`, `GP_BDO` (`FARMER`, `BANKER` already exist).
- JWT + MPIN (no passwords). AES-256 at rest for KYC/Aadhaar vault patterns.
- DPDP consent via existing COMPLIANCE consent records — explicit, purpose-bound, revocable for each insurer/state share; appoint DPO; consent-manager ready.
- Hash-chained `claim_events`; EXIF preserved; `claimsDataPurgeJob` mirrors `aaDataPurgeJob` retention.
- **Governance:** all scoring is decision-support; no auto-denial (OG 31.1.4); bias review so small/marginal farmers are never systematically down-scored.

---

## 11. NCIP Non-Duplication Charter (binding)

1. Consume, never recreate NCIP master data (display-only mirror).
2. One keystroke chain — capture once, submit once via authorised channel.
3. `ncip_application_id` is the foreign key for all crop objects; no parallel numbering.
4. Claims: originate into official channels + observe; computation stays in DigiClaim.
5. Where NCIP has no writ (livestock, renewals, commissions, honoraria, verification, grievance) FarmerPay is system-of-record — built **export-compatible** with the future DAHD portal + NLM Annexure XX.
6. Respect Agri-Stack precedence (validate against it first so submissions never bounce).
7. Track "data-entry minutes/enrolment" and "fields typed twice" as product KPIs.

---

## 12. Phased Build Plan

| Phase | Slice | Deliverable | Notes | Exit criteria |
|---|---|---|---|---|
| **P0** ⭐ | **Desktop interactive prototype** | Clickable HTML mockups (mock data): `farmer-crop.*`, `farmer-livestock.*`, `dash-surveyor`, `dash-posp`, `dash-insurer`, `dash-vet` (AHD doctor), `dash-agri-official` (+CSC), `dash-banker/gov` — all 10 interactive personas (§8 map) | No backend, no auth; desktop viewport + phone-frame for farmer flows; iterate features freely (§8A) | You can navigate both farmer workflows + every persona surface and request changes before any code is committed |
| **P1.0** | KAVACH foundation | plans, proposals, policies, policy_assets, premium_ledger models + migrations + catalog/quote/proposal/policy services + endpoints; register + mount | Backend | quote + assets + protection snapshot return real data |
| **P1.1** | Renewal engine (**#1 ROI**) | renewal_journeys, renewalService, reminderWorker, renewalSweepJob, notifications wiring | Drives the **animal-husbandry** workflow (§8C) | reminder fan-out works; one-tap renew clones policy |
| **P1.2** | CLAIMS + SLA | claim_cases, claim_events (hash-chain), evidence_files, slaClockService, intimation/claim/evidence services; slaClockTickJob, slaBreachWorker | Shared by both workflows; crop = NCIP-observe, livestock = owned | intimation → case #; SLA clocks + penal-interest visible |
| **P1.3** | RN farmer workflows | Port §8B `crop-*` + §8C `pashu-*` screen groups to `farmer-app`; vault (DigiLocker), premiumDebitWatchJob, grievance, commission escrow | **Two separate journeys**, one app | both workflows usable on device; vault + grievance live |
| **P1.4** | Field roles | surveyor_tasks, vet_honorarium_ledger, field routes, taskService; Surveyor, **VO/AHD (§8H)**, Sathi/POSP surfaces; CCE co-observation for Agri officials (§8I) | §8D / §8E / §8H / §8I | VO e-PM + honorarium ledger; surveyor files from field; POSP sees escrow; official logs CCE |
| **P2** | Production dashboards + ML | **Surveyor (§8D), POSP (§8E), Insurer-analytics (§8F), VO/AHD (§8H), Agri-official+CSC (§8I)** as new Next.js apps/PWAs; Banker extend + Gov white-label (§8G); renewal-propensity, fraud scoring, claim-triage, animal re-ID, NDVI | Dashboards port from the P0 prototype | per Part 8 model table; dashboards live on real data |
| **P3** | Parametric / reinsurance | DRISHTI parametric lab, burn-cost packs (London JV) | — | per Part 6G #20–21 |

**Testing:** Jest unit + integration per existing pattern (e.g., AA's 219 tests, DRISHTI's 230). Target: services + SLA arithmetic + hash-chain integrity + renewal cloning have full coverage before each phase ships. A final verification pass (migrations run clean, `npm test` green, lint) gates every slice. (P0 prototype has no automated tests — it is a visual artifact.)

---

## 13. Open Questions for Sign-off

1. **Prototype format** — one multi-view HTML file (top-nav, like `insurance_survey_dashboard.html`) vs one file per surface in `prototypes/insurance/`. Default: **multi-file with a launcher** for easier per-screen iteration.
2. **Insurer partner for P1** — plan assumes Oriental (≈72% livestock share in survey geography). Confirm the first carrier so policy-issuance + commission contracts can be stubbed correctly.
3. **NCIP access level** — API vs structured-sheet submission per State/insurer (Part 7.3 marks this an assumption). Determines `ncipBridgeService` implementation depth in P1.
4. **Object storage** — confirm provider for evidence files (S3-compatible, Indian region for gov dashboards).
5. **Workflow sequencing** — design defaults to livestock/animal-husbandry-led (renewal is #1 ROI). Confirm crop vs livestock first for the *backend* build (the P0 prototype covers both regardless).
6. **DigiLocker / WhatsApp Business** — credentials & onboarding lead time for vault push and reminder rail.

---

*This design is plan-only. The **first build deliverable is the P0 desktop prototype** (§8A) covering the two separate farmer workflows (§8B PMFBY crop, §8C animal husbandry) and the four role dashboards (§8D surveyor, §8E POSP, §8F insurer analytics, §8G banker/gov). Production then proceeds slice-by-slice per §12 — models → migrations → services → controllers → routes → validators → screens → tests — in the platform's existing conventions.*

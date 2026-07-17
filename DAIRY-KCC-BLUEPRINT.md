# Allied KCC — Product & Technical Design Blueprint

**Version 0.6 · July 2026 · Standalone app extracted from FarmerPay — member-first pilot revision**
**Scope: composite KCC for ALL allied activities (dairy-first) + Pashu Suraksha insurance (KAVACH + CLAIMS, livestock line) + COOP module for dairy-society farmers (UCDF/Aanchal) + phase-gated Intelligence Layer (CV · NLP/speech · ML).**

**What changed in v0.6:** a **V1 Scope Declaration** (§1.1) — v1 is member-first; the **COOP milk passbook is the wedge** and the build plan is re-sequenced around it (§11); a v1 cut list — deferred, not deleted (§1.2); three additions: **LT drawdown flow** (§5.4), **offline-first as a hard requirement** (§10), **degraded ERP sync mode** (§7.4). v0.5's AI-native strategy (§8) unchanged.

---

## 1. Product Thesis

```
RECORD (herd/flock/pond + money logbook — voice-first, photo-assisted)
   → PROVE (P&L + evidence → TRUST score → drawing power)
      → UNLOCK (composite KCC-AH limit across activities, renewal auto-prepared)
         → PROTECT (Pashu Suraksha: per-animal NLM insurance, premium via KCC,
                    renewal-led, 4-role workflow, biometric animal identity)
            → GROW (rates + advisories + society input credit + assistant)
```

**Dairy is the anchor activity.** Credit and insurance support every KCC-eligible allied activity from day 1 via the activity catalog; ERP depth rolls out per activity. **AI is a layer, not a module** (§8). **Users:** farmers (main app); VO/surveyor/POSP via one field PWA (§10); co-op approvers act in the Aanchal ERP (§7).

### 1.1 V1 Scope Declaration (member-first)
**V1 is the Aanchal member app that also gets you a KCC.**
- **Primary persona:** UCDF DCS-member dairy farmer, Uttarakhand. The wedge is the **milk passbook** — the only surface with daily pull (milk money), populated from the ERP with **zero farmer data entry**. It kills the cold-start problem that "the logbook is the credit file" otherwise has: manual logging asks for months of effort before value; ERP data arrives on day 1.
- **Sequence of value:** passbook habit → input ordering (70% of payables) → KCC on top of proven milk income → insurance on the herd the register already knows.
- **Secondary persona (supported, not marketed):** non-member dairy farmer — voice/manual logbook, KCC calculator, join-society nudge. The nudge is the acquisition funnel INTO the primary persona.
- **Deferred personas (v2+):** fishery, multi-activity non-dairy, other states. Their *credit* works from day 1 (catalog + SoF), but no deep ERP or GTM until the pilot proves the loop.
- KCC remains a twice-a-year event and insurance a once-a-year event — neither can anchor engagement; both ride the passbook habit.

### 1.2 V1 cut list (deferred, not deleted — everything stays in this blueprint)
| Deferred item | Where it went | Why |
|---|---|---|
| **Fishery ERP module** (ponds/vessels/trips port) | Phase 4 | FISHERY stays in the activity catalog — Limit Engine prices it via SoF × acres (Illustration 2B remains a unit test). No fishery users in a dairy-co-op hill pilot |
| **Scenarios module** (DRISHTI engines) | Phase 4 | "What if I add a buffalo" is calculator arithmetic; Monte Carlo answers questions nobody in the pilot asks |
| **Rate boards beyond milk + feed** | Phase 4 | Egg/broiler/fish price ingestion = sourcing headache; milk rates come free from the ERP, feed prices free from the co-op catalog |
| **Banker live dashboard** | Phase 4 (v1 = **renewal-pack PDF handoff**) | Banks adopt documents before vendor dashboards; the application file + renewal pack IS the banker interface |
| **Gov white-label dashboard** | Phase 4 | Sales artifact, not pilot infrastructure; Annexure XX export ships as a generated report |
| **Standalone POSP dashboard** | Merged into the **one field PWA** (§10) | POSP = task queue + escrow card; doesn't need its own app to start |
| **Assistant (Pashu Mitra)** | AI-2 (unchanged) | Voice *logging* first — narrow, testable, measurable acceptance rate. A RAG assistant before traffic is a demo |

---

## 2. Regulatory Foundation (verified July 2026)

### 2.1 RBI KCC Directions 2026 — the composite facility
Source: `kcc_composite.txt` (RBI/FIDD/2026-27/402, 19-Jun-2026, applicable to sanctions from 01-Jan-2027; earlier sanctions under extant guidelines until renewal).

**Eligible allied activities (¶8(2)) — the app's activity catalog:**

| Category | Activities |
|---|---|
| Animal Husbandry | Dairy animals (cattle, buffalo), poultry birds, small ruminants (goat, sheep), pig, rabbit, camel, yak, mithun |
| Fisheries & Aquaculture | Fish/shrimp/prawn, composite & integrated culture, cage/pen, ornamental, seed rearing, saline/brackish, pearl, crab, seaweed, aquaponics, bio-floc, bivalve |
| Other allied | Sericulture, lac culture, beekeeping, similar production activities |

Rules the app must implement:

| Rule | Ref | Product consequence |
|---|---|---|
| Composite facility, **6-year tenure**: ST (revolving cash credit) + LT (investment) sub-limits | ¶8–10, ¶26 | Limit dashboard: ST + LT sub-accounts under one CMPL |
| Allied WC = **SoF/unit × units + 10% (consumption) + 20% (maintenance & tech) + insurance premium** | ¶16, Illus. 1(B), 2(B) | The Limit Engine formula; SoF is SLTC/DLTC-notified per state |
| No notified SoF → **outside KCC** | ¶16(2) | Catalog flags "KCC-ready" vs "SoF pending" per state |
| **10% consumption once** across activities; each insurance type once | ¶16(3) | Composite dedupe rule |
| **MPL** = yr-1 limit × 1.10/yr; **CMPL** = 6th-yr ST MPL + LT | ¶13(6), ¶10 | Auto-generated 6-year schedule |
| Investment credit: livestock, sheds, equipment; ≤6-yr; **drawdown per nature of investment** | ¶18–20, **¶19(2)** | Per-activity term-loan journeys + **LT drawdown flow (§5.4)** |
| Collateral-free **≤ ₹2 lakh** (₹3 lakh with tie-up) | ¶23, ¶25 | No-collateral fast path |
| Drawing power vs stocks/receivables/cash flows | ¶16(4) | Registers + logbook + **milk payables (ERP)** as evidence |
| Insurance premium **via KCC account**, policy assigned to bank, consent at application | ¶32–33 | KAVACH premium financing (K1) |
| Repayment per activity cash-flow | ¶17 | Dairy ≈ monthly servicing UX |
| UPI / digital channels | ¶34–35 | Digital drawdown & repayment |
| Annual review; activity declaration | ¶28–29 | Auto renewal pack from logbook |
| Flexi-KCC ₹10k–₹50k marginal farmers | ¶13(7) | Smallholder entry product |

Worked examples = unit-test fixtures: dairy (Illus. 1B: 2 CB cows, SoF ₹7,000 → yr-1 ₹18,600; 6th-yr MPL ₹29,956) and fishery (Illus. 2B: 1-acre pond → yr-1 ₹2,64,500; 6th-yr ₹4,25,981).

**Timing:** pre-2027 launch requires current Master Circular math too → Limit Engine is **scheme-versioned** (`KCC_MC_2018` | `KCC_DIR_2026`).

### 2.2 Interest subvention (MISS) — FY 2025-26 verified
7% lending; 1.5% subvention; 3% PRI → **4% effective**; ₹3 lakh overall, **₹2 lakh AH/fisheries sub-limit** (RBI/2025-26/193). ₹5 lakh enhancement announced. → **Config, not code.**

### 2.3 Insurance scheme routing (livestock line only; crop/PMFBY out)
dairy cattle/buffalo · goat/sheep/pig/rabbit · camel/yak/mithun → **NLM** | fishery/aqua → **PMMSY** | poultry → private/state | sericulture/beekeeping/lac → private/state.

### 2.4 NLM livestock insurance — exact rules
Source: `revised_nlm_guidelines.pdf` (pp.42–43, 53–56): beneficiary **15%** / govt 85% (60:40, 90:10 NER-Him — **Uttarakhand qualifies**, 100% UT) · premium caps **4.5/8/11%** (1/2/3-yr; NER-Him 5.5/9/11.5) · **3-yr default** · cap **10 CU/household** (5 pig/rabbit; 1 CU = 10 sheep/goat/pig/rabbit) · SI = market value, floors **₹3,000/L-day cow, ₹4,000 buffalo** (auto from milk log; disputes → GP/BDO) · **12-digit NDDB tag + RFID + 2 photos**, VCI-registered vet · policy on tagging+exam+valuation+15% paid · claims: 21-day wait, **4 documents only**, settle **15 days from docs-complete** (config; p.55 also cites 21–25d) else **12% p.a. compound penalty** · vet honorarium ₹50/₹125 · milk societies as **group channel** · policy transfers on sale · **this platform = system of record** (DAHD portal not live), export-compatible with DAHD + **Annexure XX**.

---

## 3. What Existing Code Gives Us (verified)

Sources: `~/Desktop/farmerpay-platform` (main) and `~/farmer_pay_projects/farmerpay-platform/dairy_cooperative` (co-op).

### 3.1 Reuse as-is
**Platform core:** auth (MPIN+OTP+JWT+Aadhaar) · farmer (profiles, multi-activity subscriptions, KYC) · middleware/shared/jobs/`roleCheck` · location (LGD) · compliance (DPDP) · notifications (SMS/WhatsApp/push/IVR).
**ERP:** dairy v2 (~22 models, 30+ endpoints; `DairyAnimal` has `tag_number` + `primary_photo_url`; hybrid P&L; recurring; tiered entry; formal/informal split) · pop (goatery/poultry) · dairy screens · `voiceInput.ts`, `ocrService.ts`, `biometric.ts` (AI seeds). *(Fishery v2 stays in FarmerPay until Phase 4 — port then.)*
**Insurance:** `INSURANCE-SYSTEM-DESIGN.md` (Suraksha: KAVACH + CLAIMS — authoritative, livestock line) · insurance catalog/quote/referral (NLM-LIVESTOCK, PMMSY-AQUA seeded) · DICE `InsuranceEnrollment` groundwork · banker dashboard patterns · CHOICE Intermediary + commission ledger · SATHI tasks/evidence/consents **+ offline sync (now a v1 pillar)** · 4-role survey research (n=3,623).
**Cooperative (dairy_cooperative):** **ERP adapter** (Adapter → Mock|Live, `INTEGRATION_MODE`; archetypes F1001–F1003) · input order models · org hierarchy · milk services. Web approval surfaces = reference only.
**Credit:** TRUST engine (5 pillars, 1000-pt, 4 bands) · DICE 11-state application machinery · READINESS FOIR.
**AI groundwork:** `EDGE_AI_ARCHITECTURE.md` + OCR/voice libs.

### 3.2 Adapt
DICE products → **KCC_ALLIED_COMPOSITE** + KAVACH premium financing · dairy v2 → generalized **livestock** module (species profiles) · TRUST banks → per-activity + insurance pillar + co-op formality evidence · dairy_cooperative input module → **corrected to PDF** (70% payables; ERP status mirror; no auto-approval) · SATHI task types → vet/surveyor/POSP insurance tasks · SAGE/PULSE → dairy rule packs + milk/feed rates · BANK/Finacle → slim prefill + reconciliation.

### 3.3 Build per approved plans
Suraksha slices P0→P1.4 livestock-scoped (§6) · COOP per PDF (§7) · KCC Limit Engine (§5) incl. **LT drawdown (§5.4)** · renewal pack generator · CU-cap validator · Intelligence Layer per §8.

### 3.4 Explicitly dropped (≠ deferred; see §1.2 for deferrals)
PMFBY/crop line entirely (no NCIP, KRPH/DigiClaim, CCE, AGRI_OFFICIAL/CSC_VLE, 72-h crop triggers, `roots/crop`) · vyapar · sentinel · DRISHTI engines 3–6 · crop mandi stack · admin EJS · agristack · **AA does not exist in FarmerPay code** (Phase-4 net-new if ever) · dairy_cooperative deferred: emi/scheme/leadgen/payments/loanorig/feedback/360° · discarded: instant auto-approval + `avgMilkValue×factor` (PDF supersedes).

---

## 4. Architecture

### 4.1 Stack decisions (v0.5, unchanged in v0.6)

| Layer | Decision | Rationale |
|---|---|---|
| **Database** | **PostgreSQL 16 + pgvector + PostGIS** (changed from MySQL) | Greenfield = zero migration cost; KrishiVerse Part B planned it; pgvector (muzzle/RAG embeddings), PostGIS (evidence geo-checks), JSONB, partitioning. Sequelize dialect swap |
| ORM / Core | KEEP Sequelize 6 · Node 20 + Express 4, MVC + service layer | Extraction economics — the FarmerPay codebase is the asset |
| **AI services** | **Python 3.12 + FastAPI** (`ai-services/`) · ONNX Runtime CPU-first · MLflow · Label Studio | Node owns product; Python owns CV/ASR/ML |
| Cache / Queues | Redis 7 · RabbitMQ 3 + **`domain_events` outbox** (append-only) | Outbox feeds audit + ML training; Kafka/CDC only on proven scale |
| Object storage | S3-compatible, Indian region | Evidence store = data lake (parquet) |
| Mobile | RN 0.81 + Expo 54 + **on-device ONNX/TFLite** + **offline-first local queue** | §10 requirement — hills, cowshed at 5 a.m. |
| Dashboards | Next.js (insurer-ops) + **one field PWA** (VO/surveyor/POSP) | §10 consolidation |
| Speech | **Bhashini first**, AI4Bharat IndicConformer/IndicWhisper fallback | Hindi + Garhwali/Kumaoni; residency-clean |
| LLM | India-region hosted frontier + open-weights fallback | DPDP guardrails (§8.5) |
| Deferred | Kafka/Debezium, ClickHouse, Temporal, GPU serving | Adopt on demonstrated scale only |

### 4.2 Repo structure
```
allied-kcc/
├── backend/src/modules/
│   ├── auth/ farmer/ location/ compliance/ notifications/      # copied
│   ├── livestock/  pop/                                        # ERP (species profiles)  [fishery/: Phase 4]
│   ├── kcc/        # Limit Engine + origination + LT drawdown + renewal pack
│   ├── trust/      # pillars + insurance pillar + co-op evidence
│   ├── kavach/     # Suraksha: plans, proposals, policies, assets, ledgers, renewals ★
│   ├── claims/     # Suraksha: intimations, hash-chained events, evidence, tasks, honoraria
│   ├── coop/       # §7: memberships, orders (ERP mirror), passbook  ← THE WEDGE
│   ├── identity/   # §6.7: animal biometrics — muzzle embeddings, dedupe/match
│   ├── assistant/  # §8.3 (AI-2): RAG + voice-ingest confirm flows
│   ├── stakeholders/ market/ advisory/                         # [scenarios/: Phase 4]
├── backend/src/integrations/   # erp/ (Aanchal: live|webhook|filedrop|mock) · bhashini/ · llm/ · finacle/
├── ai-services/                # Python FastAPI: vision/ speech/ predict/ rag/
├── backend/jobs/               # incl. erpSync, demandWindow, featureSnapshot, modelDrift
├── prototypes/insurance/       # P0 clickable HTML (Suraksha §8A)
├── app/                        # farmer app (offline-first): society-* · kcc-* · pashu-*
├── field-pwa/                  # ONE offline-capable PWA: VO · surveyor · POSP (role-gated views)
├── dashboards/                 # insurer-ops (Next.js). banker = generated PDF pack (v1); gov: Phase 4
└── docs/  ml/
```
Route mounting: `/api/v1/{auth, farmer, livestock, pop, kcc, trust, kavach, claims, coop, identity, assistant, market, advisory, location}` + `claims/field` + `admin/{kavach,claims}`. Queues: kavach.renewal.reminders · kavach.policy.issued · claims.evidence.process · claims.sla.breach · claims.notify · coop.dispatch.alerts · ai.inference.requests.

---

## 5. KCC-Allied Limit Engine (core new IP)

### 5.1–5.2 Data model & computation (unchanged from v0.4/0.5)
`activity_catalog`, `sof_registry`, `scheme_configs`, `kcc_facilities`, `kcc_facility_activities`, `kcc_limit_schedules`, `kcc_sublimit_ledgers`, `kcc_drawing_power_snaps`.
```
WC_activity(yr n) = SoF(activity, yr n) × eligible_units(activity)     # units LIVE from registers
WC_total(yr n)    = Σ WC_activity + 10% consumption (once, ¶16(3)) + 20% maintenance/tech
                  + Σ insurance_premiums (each type once; KAVACH quotes)
MPL(yr n) = round₁₀₀₀(MPL(yr n−1) × 1.10),  MPL(1) = WC_total(1)
CMPL      = MPL(6) + Σ investment_credit_items
```
Unit-tested against BOTH RBI illustrations (fishery math ships v1 even though the fishery ERP doesn't). Milk payables (COOP ERP) strengthen drawing power (¶16(4)); **co-op input credit is never counted inside the KCC limit.**

### 5.3 Farmer surfaces
**KCC Calculator** (Tier-1 hook) · **Limit Dashboard** (CMPL, per-activity components, ST utilization, LT EMIs, subvention saved) · **Renewal Pack** (12-month P&L + receivables + register changes + insurance status → generated dossier, ¶28–29 — **this PDF is the banker interface in v1**).

### 5.4 LT drawdown flow (NEW — closes the ¶19(2) gap)
Without this, the LT half of CMPL is display-only. One screen + one status mirror:
```
kcc_drawdown_requests   facility_id, item(activity-typed: ANIMAL|SHED|EQUIPMENT), description,
                        amount, quotation_doc_url (photo/OCR), seller_ref(nullable),
                        status(DRAFT → SUBMITTED → BANK_APPROVED → DISBURSED → REJECTED),
                        disbursed_at, utilization_evidence_url (post-purchase photo, e.g. new
                        animal enters the register + gets tagged → links the asset to the loan)
```
Farmer: "buy 1 buffalo, ₹80,000" + quotation photo → request → bank decision mirrored → on disbursement, the purchased animal is registered (and nudged into insurance — the asset-loan-policy triangle closes). Repayment schedule per bank terms lands in `kcc_sublimit_ledgers` (LT).

---

## 6. Insurance Layer — "Pashu Suraksha" (KAVACH + CLAIMS, livestock line)

Authoritative spec: `INSURANCE-SYSTEM-DESIGN.md`. System-of-record here; export-compatible with DAHD + Annexure XX (generated report in v1, not a dashboard). Schema, services, `pashu-*` journey, bridges — as v0.4/0.5 §6: renewal engine ★ (one-tap renew, zero re-paper) · SLA clocks with farmer-visible 12% penal accrual · hash-chained `claim_events` · lossless EXIF evidence · commission escrow (T+15) · VO e-PM + honorarium ledger · 4-document checklist · group channel via COOP graph.

**Role surfaces (consolidated per §1.2):** VO, surveyor, and POSP work in **one offline-capable field PWA** with role-gated views — separate task queues and forms per role (never shared screens; shared shell). Insurer-ops remains a Next.js dashboard (exceptions, allocation, human-only settlement, mortality + fraud analytics).

### 6.7 Animal identity & fraud defense (unchanged from v0.5)
Muzzle-print re-ID as the biometric second factor: guided capture burst with on-device QC at `pashu-tagging` → embeddings in pgvector (`animal_biometrics`) → enrolment dedupe (shadow first) → claim-time carcass match as decision support → BCS/weight/breed assists later. Complements, never replaces, the statutory tag + 2 photos.

---

## 7. COOP Module — Society Farmers (Input Services Supply Chain) ← THE WEDGE

**Source of truth: `Input Service App.pdf`** (UCDF/Aanchal). Rules: order limit = **70% × outstanding milk payables** (config `coop_policy`), **1st/3rd-week windows**, **all approvals in the Aanchal ERP** — the app authors only `SUBMITTED★` and `RECEIPT_CONFIRMED★`. Order mirror: `DRAFT → SUBMITTED★ → SECRETARY_APPROVED → SUPERVISOR_APPROVED → DUSS_PROCESSING → DISPATCHED (alert) → RECEIPT_CONFIRMED★` (↘ REJECTED). Data: `coop_memberships`, `coop_input_items`, `coop_input_orders`(+items, limit_snapshot), `coop_milk_snapshots` (passbook), `erp_sync_log`. Screens: `society-*` ×5; non-members → join-society nudge. Synergies: passbook → TRUST + drawing power; delivered orders auto-log as feed cost events; membership graph → NLM group enrolment; society rates → channel advisor. Deferred dairy_cooperative modules: emi/scheme/leadgen/payments/loanorig/feedback.

### 7.4 ERP integration — now with a degraded mode (NEW)
The UCDF contract is the single riskiest dependency in the plan. The adapter therefore supports **four modes**, same interface (`{ erp }`), switchable per capability:
```
INTEGRATION_MODE = live | webhook | filedrop | mock
```
- **live** — request/response API (target state).
- **webhook** — ERP pushes status/passbook deltas.
- **filedrop — the degraded mode that de-risks the pilot:** daily CSV/XLSX batches (member master, milk summary + outstanding, order statuses, dispatches) dropped to SFTP/shared folder → `erpSyncJob` ingests, validates, reconciles idempotently (sequence-tolerant, late-file tolerant). The paper indent system proves UCDF can produce batch files today; "the ERP team will expose webhooks next quarter" must not block launch. Receipt confirmations queue outbound as a return file.
- **mock** — archetypes F1001–F1003 for dev/demo.
Order windows + limit math run identically in every mode; only freshness changes (filedrop = T-1 passbook, which the UX labels honestly: "as of yesterday").

**AI assist:** voice ordering rides AI-0b; DUSS demand forecasting = Phase 4 (`predict/`).

---

## 8. Intelligence Layer — AI · ML · NLP · CV (unchanged from v0.5)

Principles: statutory math is never a model · AI proposes, humans/farmers dispose (voice drafts confirm-only; no auto-denial/auto-reject) · shadow → assist → automate-with-override · every inference logged (`model_inference_log`) · the data flywheel is designed in (DPDP `model_improvement` consent purpose; labels fall out of workflows; datasets registry; Label Studio + honorarium-rail incentives).

Capability map (AI-0 → AI-3): voice logging (Hindi ASR + confirm cards) and on-device capture QC + tag OCR at **AI-0** · muzzle embeddings + shadow dedupe, doc-AI vet certs, IVR twin at **AI-1** · muzzle assist (dedupe + claim match), renewal propensity, fraud scores, yield forecast, Pashu Mitra assistant, grievance triage at **AI-2** · EWS, price/THI, DUSS demand, disease screening (advisory wording only) at **AI-3**. Serving: `ai-services/` FastAPI + ONNX; pgvector embeddings; PostGIS geo-checks; `featureSnapshotJob` → parquet; `modelDriftJob`. Governance & KPIs as v0.5 §8.5 (WER < 15% field target; muzzle top-1 ≥ 98% @ FAR ≤ 0.1% before assist; voice-draft acceptance; minutes-per-enrolment).

---

## 9. Market Intelligence & Advisory (v1 = what comes free)
**V1:** milk rate card (fat/SNF matrix — from the ERP) + feed prices (from the co-op catalog) + channel advisor (society vs vendor — the formality nudge) + dairy advisory rule packs (vaccination FMD/HS/BQ, mastitis, heat stress via IMD-THI, breeding windows, dry-off). **Phase 4:** egg/broiler/fish boards, price forecasting, scenario sandbox.

---

## 10. Frontend Plan

**Offline-first is a v1 REQUIREMENT, not an option** (was open decision #12): the farmer app's logbook, receipt confirmation, and evidence capture write to a local queue and sync opportunistically (SATHI sync pattern); the field PWA (VO/surveyor/POSP) is offline-capable end-to-end — forms, task queues, photo capture with on-device QC. Hills + cowsheds decide this, not preference. Passbook and status screens degrade gracefully to last-synced state with honest timestamps.

**P0 desktop prototype first** (Suraksha §8A): `farmer-society` (passbook + order + 70% meter — the wedge, prototyped first), `farmer-kcc` (incl. **LT drawdown**), `farmer-pashu`, `pwa-field` (three role views), `dash-insurer`, `report-renewal-pack` (the banker PDF), + launcher.

**Farmer app (~50 screens, one app):** auth (3) · onboarding (3, multi-activity + society link) · home (passbook summary + limit card + renewal-due + advisory + society/nudge card) · registers (6) · logbook (6, voice-first, persistent mic) · health & breeding (3) · P&L (2) · PoP progress (1) · **kcc-\* (7: calculator, eligibility+TRUST, application, limit dashboard, transactions, LT drawdown, renewal pack)** · **pashu-\* (10)** · **society-\* (5)** · market & advisory (3: milk rates, feed prices, advisory feed) · profile & compliance (2). *(Fishery screens: Phase 4.)*

**Role surfaces:** ONE field PWA (VO · surveyor · POSP — role-gated views, offline, ~8 screens) + insurer-ops Next.js dashboard. Banker = generated renewal-pack/application PDF (v1) → live dashboard (Phase 4). Gov = generated Annexure XX report (v1) → white-label (Phase 4).

---

## 11. Phased Build Plan (re-sequenced: the wedge leads)

| Phase | Product scope | AI track | Exit criteria |
|---|---|---|---|
| **0 — Extraction & scaffold** | Copy FarmerPay modules (auth, farmer, dairy→livestock, pop, shared, middleware, jobs) + dairy_cooperative ERP adapter/input/org; port screens; **fresh Postgres migrations**; **offline sync foundation** (local queue, SATHI pattern); ERP adapter with **live/webhook/filedrop/mock** modes | **AI-0a:** `domain_events` outbox · consent purpose taxonomy (incl. `model_improvement`) · evidence conventions | Register → log → P&L on PG; app works airplane-mode; filedrop ingest passes reconciliation tests |
| **1 — THE WEDGE: COOP passbook + ordering** | Membership link (ERP pre-link), **milk passbook**, 70% limit engine, windowed ordering, ERP status mirror, dispatch alerts, receipt confirmation — **filedrop mode acceptable for launch**; join-society nudge for non-members | Voice ordering prototype rides AI-0b prep | DCS members check passbook weekly (WAU/MAU target); orders placed + receipts confirmed in-app through a full window cycle |
| **2 — Creditworthy (KCC)** | Activity catalog (ALL allied incl. FISHERY) + SoF registry + scheme configs; Limit Engine + BOTH illustration fixture tests; dairy TRUST bank + co-op evidence; KCC_ALLIED_COMPOSITE origination; **LT drawdown flow (§5.4)**; **renewal-pack PDF = banker interface**; Finacle prefill | **AI-0b:** voice logging v1 (Hindi ASR + confirm cards) · on-device capture QC · tag OCR | Sanction-ready application on real passbook + logbook data; LT drawdown request → disbursement mirrored; voice-entry adoption measured |
| **3 — Protected (Pashu Suraksha)** | Suraksha slices: P0 prototype → KAVACH → renewal engine ★ → CLAIMS + SLA → `pashu-*` → **field roles on the ONE PWA** (VO e-PM + honorarium, surveyor filing, POSP tasks + escrow) | **AI-1:** muzzle capture + embeddings (shadow dedupe) · doc-AI vet certs · IVR twin | Animal insured end-to-end via 4-role flow; claim settled on visible clock; muzzle gallery growing under consent |
| **4 — Market-worthy + scale** | **Deferred list lands here:** fishery ERP module, scenarios, egg/broiler/fish rate boards, banker live dashboard, gov white-label, group enrolment (COOP × KAVACH), deferred coop modules (emi/scheme/leadgen), multi-state SoF, more insurers, FPO channels | **AI-2:** muzzle assist (dedupe + claim match) · renewal propensity · fraud scores · yield forecast · **Pashu Mitra assistant** · grievance triage → **AI-3:** EWS · price/THI · DUSS demand · disease screening | Fraud queue live; assistant grounded; second activity/state onboarded |

**Testing:** Limit-Engine (both illustrations), 70%-limit calc, SLA clocks, hash-chain integrity, renewal cloning, CU-cap math, **filedrop reconciliation idempotency, offline sync conflict resolution** — full Jest coverage before each phase; per-model eval suites gate AI promotion; assistant red-team suite in CI.

---

## 12. Open Decisions

*Resolved:* design-first ✓ standalone repo ✓ all-allied credit catalog ✓ livestock-only insurance ✓ Suraksha adopted ✓ COOP = PDF + passbook ✓ approvals ERP-side ✓ non-member nudge ✓ Postgres ✓ Python AI tier ✓ **member-first v1 ✓ · COOP-wedge sequencing ✓ · v1 cut list ✓ · LT drawdown in scope ✓ · offline-first = requirement ✓ · ERP filedrop fallback ✓ · one field PWA ✓ · banker = PDF-first ✓.**

1. **App name / brand** — "Allied KCC" working; assistant "Pashu Mitra" placeholder.
2. **UCDF/Aanchal ERP contract + sync mode commitment** — even a daily-CSV commitment unblocks launch (filedrop); API/webhook can follow.
3. **Insurer partner** — Oriental assumed (≈72% share in survey geography).
4. **Bank partner & Finacle depth** — prefill day-1 vs application-PDF handoff only.
5. **Muzzle model: build vs partner** — recommend partner-first, own the gallery.
6. **ASR: Bhashini vs self-host** — decide per-dialect after field WER tests.
7. **LLM hosting** — India-region hosted vs open-weights self-host (DPDP + cost).
8. **GPU budget** — CPU-ONNX until muzzle volume proves the case.
9. Prototype format · object storage vendor · DigiLocker/WhatsApp credentials · RFID readers · languages (Hindi + Garhwali/Kumaoni audio) · DPO appointment.

---

## 13. Source Map
- `Dairy_kcc/kcc_composite.txt` — RBI KCC Directions 2026 → §2.1, §5 (incl. ¶19(2) → §5.4).
- `Dairy_kcc/revised_nlm_guidelines.pdf` — NLM OG Jan 2025 → §2.4, §6.
- `Dairy_kcc/INSURANCE-SYSTEM-DESIGN.md` — Suraksha (KAVACH+CLAIMS) → §6, §11. Livestock line only.
- `Dairy_kcc/Input Service App.pdf` — UCDF Input Services → §7 (source of truth; wedge rationale §1.1).
- `~/Desktop/farmerpay-platform` — main extraction source (incl. `EDGE_AI_ARCHITECTURE.md`, voice/OCR libs).
- `~/farmer_pay_projects/farmerpay-platform/dairy_cooperative` — ERP adapter + input/org bases (70% rule + approval chain superseded by PDF).
- MISS FY 2025-26: [NABARD ISS](https://www.nabard.org/content1.aspx?id=602&catid=23&mid=23), [PIB — KCC ₹5 lakh](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2099696), RBI/2025-26/193.

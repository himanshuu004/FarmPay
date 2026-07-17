# Product Design & Requirements Document
# Aanchal Dairy — Cattle Induction Application (CIA)

**For:** Uttarakhand Cooperative Dairy Federation Limited (UCDF), Aanchal Dairy network
**Document type:** Implementation-ready product-design document + PRD
**Version:** 1.0 (draft) · **Date:** 11 July 2026
**Audience:** UCDF officials, DUSS/district offices, participating cooperative bank, DCS bodies, insurers, implementation partners, developers
**Platform basis:** Extends the **Allied KCC / Aanchal platform** (reuses ERP adapter, COOP module, KAVACH insurance, offline-first sync, RBAC). Where the cattle-induction programme requires behaviour that differs from the platform's routine flows, it is flagged explicitly.

---

## How to read this document

The programme is deliberately separated into seven concerns that are specified independently and stitched together by a single application-status spine: **(1) application processing · (2) financial processing · (3) cattle verification · (4) payment processing · (5) insurance · (6) EMI tracking · (7) post-purchase monitoring.** Every cattle purchase in the system is traceable end-to-end to a *farmer → seller → location → animal (ear-tag) → loan account → subsidy → transport record → insurance policy*. No payment is ever recommended by the system until the verification requirements for that stage are complete.

A recurring design principle throughout: **we do not digitise the paper form — we redesign the process to remove steps, remove duplicate data entry, and give UCDF live visibility it does not have today.**

## Contents

Part 1 Executive Summary · Part 2 Current-State Workflow · Part 3 Future-State Workflow · Part 4 User Personas · Part 5 Functional Requirements · Part 6 Screen Inventory · Part 7 Data Dictionary · Part 8 Workflow Status Matrix · Part 9 Role & Permission Matrix · Part 10 Integration Architecture · Part 11 Notification Matrix · Part 12 Reports & Dashboard Design · Part 13 Fraud & Risk Controls · Part 14 Non-Functional Requirements · Part 14A Business Rules · Part 14B Grievance & Exception Management · Part 14C Post-Purchase Monitoring · Part 15 MVP & Product Roadmap · Part 16 Wireframe Descriptions · Part 17 Acceptance Criteria · Part 18 Open Policy & Operational Questions · Appendix A Traceability · Appendix B Concern Separation.

---

# PART 1 — Executive Summary

## 1.1 What this product is

The Cattle Induction Application (CIA) is the single digital system that runs UCDF's cattle-induction (milch-animal loan-cum-subsidy) programme end to end — from a farmer first hearing about the scheme, through beneficiary selection, loan and subsidy processing with the cooperative bank, guided and fraud-resistant cattle purchase, insurance, and finally milk-payment-linked EMI recovery and post-purchase asset monitoring.

Today the programme runs on village meetings, paper applications, physical file movement between the society (DCS), the district union (DUSS) and the district office, and manual back-and-forth with the bank. UCDF has **no real-time line of sight** into where any application is, whether purchased cattle actually exist, whether the animal insured is the animal bought, or whether EMIs are being recovered. CIA closes all of these gaps.

## 1.2 Primary users

The farmer-facing app serves the **UCDF DCS-member dairy farmer** (the same persona the Aanchal member app already targets). Field verification is done by **route/field supervisors** and **veterinary officers** on an offline-capable field interface. **DCS secretaries and DCS boards** run selection; **DUSS and district offices** run bulk processing; the **cooperative bank** appraises, sanctions and disburses; **insurers** issue transit and cattle policies; and **UCDF headquarters** monitors everything through a command dashboard.

## 1.3 Institutional benefits

For **UCDF**: end-to-end visibility from expression-of-interest to loan closure; district/DUSS/DCS/bank performance league tables; fraud-risk surfacing; and a reconcilable financial trail for every rupee of loan and subsidy. For the **bank**: clean, complete, pre-validated application packets (digital or printed in prescribed format) and milk-payment-linked recovery that lowers default risk. For **DUSS/district**: elimination of duplicate data entry and physical file movement. For the **farmer**: a simple, assisted, multilingual path to a loan, a healthy verified animal, insurance, and transparent EMI deductions from milk dues. For **auditors/government**: an immutable, timestamped audit trail and standard exception reports.

## 1.4 Non-negotiable product promises

Every financial event is reconcilable; every purchase is fully traceable; no payment is recommended without completed verification; the system works both with bank-API integration and with manual file-based bank operation; farmer data entry is minimised through pre-fill and assisted capture; offline operation is guaranteed for all field work; and every approval, edit and rejection carries a timestamped, tamper-evident audit record.

---

# PART 2 — Current-State Workflow

## 2.1 Step-by-step (as-is)

1. Scheme-awareness meeting at village level, conducted by supervisors.
2. DCS-level meeting for beneficiary selection.
3. Farmer submits a paper application at the DCS.
4. Application processed at DUSS and district office.
5. Applications submitted physically to the bank.
6. Bank communicates the sanctioned-beneficiary list back to DUSS.
7. DUSS transfers the applicable subsidy amount to the bank.
8. Bank disburses the loan into the beneficiary's loan account.
9. Beneficiary purchases the cattle.
10. Cattle-purchase documents/information are collected (today, largely offline).
11. Purchase documents submitted to the bank.
12. Money transferred from the loan account to the cattle seller, and to DUSS/farmer as applicable under the scheme.

## 2.2 Swimlane (as-is)

| # | Farmer | DCS (Secretary/Board) | Supervisor | DUSS / District | Cooperative Bank | UCDF HQ |
|---|---|---|---|---|---|---|
| 1 | Attends meeting | — | Conducts awareness meeting | — | — | No visibility |
| 2 | Attends | Selects beneficiaries in board meeting | Facilitates | — | — | No visibility |
| 3 | Submits paper application | Receives & holds file | — | — | — | No visibility |
| 4 | Waits | Forwards file | (verifies informally) | Processes files manually | — | No visibility |
| 5 | Waits | — | — | Carries files to bank | Receives files | No visibility |
| 6 | Waits | — | — | Receives sanction list | Sends sanction list | No visibility |
| 7 | Waits | — | — | Transfers subsidy to bank | Receives subsidy | Partial (finance) |
| 8 | Loan credited | — | — | — | Disburses to loan a/c | No visibility |
| 9 | Buys cattle | — | (may accompany) | — | — | No visibility |
| 10 | Gathers docs | — | Collects some evidence | — | — | No visibility |
| 11 | — | — | — | Forwards docs | Receives docs | No visibility |
| 12 | — | — | — | Reconciles manually | Pays seller / DUSS / farmer | No visibility |

## 2.3 Pain points and risks (as-is)

**Manual steps & duplicate entry.** The same farmer, membership and milk-supply data is re-keyed at DCS, DUSS, district and bank. **Documentation gaps.** Missing or inconsistent documents are discovered late, at the bank, causing rework loops. **Approval delays.** File movement is serial and physical; a file can sit for weeks with no owner and no clock. **No real-time status for UCDF.** Neither UCDF nor the farmer can see where an application is. **Reconciliation difficulty.** Loan, subsidy and seller-payment transactions are reconciled by hand across bank statements and DUSS ledgers.

**Fraud and integrity risks** are the most serious: no reliable **seller verification**; **cattle substitution** between inspection, transit and delivery; the **same animal used for multiple loans**; **duplicate/ reused cattle photographs**; **inflated valuations**; **backdated or post-purchase insurance**; **payment to unrelated bank accounts**; **purchase outside the approved geography**; and **fabricated transport documents**. There is **no geo-tag** proving where an animal was bought or delivered, and **no ear-tag registry check** to prevent reuse.

**EMI-monitoring gaps.** Recovery from milk payment is not systematically tracked; partial deductions, seasonal milk drops, farmer migration between societies, and cattle death/sale are not linked to the loan. **Weak audit trails.** Accountability for who approved, edited or rejected what — and when — cannot be reconstructed reliably from paper.

---

# PART 3 — Future-State Workflow

## 3.1 Numbered digital workflow (to-be)

1. **Scheme, eligibility rules and the document checklist are published in the app** and visible to every member. *(Config-driven; UCDF admin can version a scheme.)*
2. **Farmer expresses interest** in-app; the request is routed to the DCS Secretary.
3. **DCS Board reviews and selects** eligible members; the resolution/minutes are recorded and uploaded.
4. **Farmer completes the application** and uploads documents in-app (camera-first, pre-filled from ERP).
5. **Route Supervisor field-verifies** (identity, membership, milk-pouring history, existing cattle, shed/residence geo-tag) and forwards to DUSS.
6. **DUSS receives applications in bulk.**
7. **The app generates/prints forms** in the prescribed bank/government/scheme formats.
8. **DUSS and district office process** (scrutiny, eligibility validation, quota, subsidy computation, deficiency memos).
9. **Applications submitted to the bank** (API where integrated; downloadable bank-wise packet otherwise).
10. **Bank appraises** the applications.
11. **Bank sends the sanctioned-beneficiary list** to DUSS (API or file upload with maker-checker).
12. **Members receive loan-sanction intimation** in-app.
13. **DUSS transfers the subsidy** to the bank; the transfer is recorded and reconciled.
14. **Bank disburses the loan** to the beneficiary loan account.
15. **Beneficiary initiates the cattle purchase** through the guided purchase workflow.
16. **Purchase information and documents are captured** in-app (photos/video, live geo-tag, ear-tag, vet verification, valuation, transport, transit insurance).
17. **Purchase documents submitted to the bank** (digital or physical, per integration mode).
18. **Payment transferred to the seller** and to **DUSS/farmer** as applicable — only after verification is complete.
19. **UCDF monitors the whole process** live through the command dashboard.

## 3.2 Stakeholder swimlane (to-be, condensed)

| Stage | Farmer | DCS | Supervisor | Vet | DUSS/District | Coop Bank | Insurer | UCDF |
|---|---|---|---|---|---|---|---|---|
| Awareness → EOI | Views scheme, submits EOI | Receives EOI | Publishes meeting | — | — | — | — | Sees EOI funnel |
| Selection | — | Board selects, uploads resolution | — | — | — | — | — | Sees selection |
| Application | Fills + uploads | Verifies docs | Field-verifies, geo-tags | — | — | — | — | Live status |
| Processing | — | — | Forwards | — | Scrutiny, subsidy calc, generates bank packet | — | — | Pending-at-level |
| Bank | Gets intimation | — | — | — | Submits packet, receives sanction | Appraises, sanctions, disburses | — | Bank TAT |
| Subsidy | — | — | — | — | Transfers subsidy | Confirms receipt | — | Subsidy tracker |
| Purchase | Runs guided purchase | — | Post-arrival check | Examines, values, certifies fit-for-transport | — | — | Issues transit + cattle policy | Purchase tracker |
| Payment | Acknowledges | — | — | — | Reconciles | Pays seller / DUSS / farmer | — | Payment tracker |
| Repayment | Sees EMI ledger | Sees member dues | — | — | Sees DCS recovery | Provides EMI/overdue file | Adjusts on claim | Default heatmap |

## 3.3 Per-step definition template

For **every** step above, the build must define the following thirteen attributes. These are enumerated in full in **Part 8 (Status Matrix)**; the template is stated here so nothing is left implicit:

> responsible user · action performed · information captured · document required · validations · approval authority · rejection/query process · status generated · notifications fired · turnaround time (TAT) · escalation rule · audit-trail record · next workflow trigger.

## 3.4 Approval and exception paths (principle)

Every approval node supports three outcomes: **approve** (advance to next status + fire next trigger), **return for correction** (bounce to the previous actor with a mandatory reason; clock pauses on the returning party and starts on the farmer/originator), and **reject** (terminal for this cycle, with reason, reversible only by a higher authority). Every stage has an **escalation timer**; on breach the item is escalated one level up and surfaced on the UCDF dashboard's exception panel. Exceptions specific to money, cattle death, and disputes are handled by the workflows in **Part 19**.

---

# PART 4 — User Personas

Each persona below states objective, key challenges, device/context, and permission posture. The full access matrix is in **Part 9**.

**Farmer (beneficiary / member).** *Objective:* get a loan, buy a healthy insured animal, and understand deductions. *Challenges:* limited literacy and English, low-end shared Android phone, intermittent network, dislikes typing. *Device:* React-Native member app (offline-first). *Permissions:* own records only — create EOI/application, upload documents, run guided purchase, view status/EMI/grievances. Cannot see other farmers or any approval control.

**DCS Secretary.** *Objective:* screen interested members and run a clean board meeting. *Challenges:* many members, paper minutes today. *Device:* app/tablet (assisted-capable). *Permissions:* view interested members of own DCS, run eligibility screen, generate agenda, record board decisions, upload resolution, return/verify documents, communicate with supervisor/DUSS. Cannot sanction or disburse.

**DCS Board member.** *Objective:* make a defensible, minuted selection. *Device:* app (view + vote/record). *Permissions:* view shortlisted members and their milk-supply/repayment-capacity summary; record vote/decision. Read-only on financials.

**Route / Field Supervisor.** *Objective:* verify reality on the ground before money moves. *Challenges:* travels villages, poor signal, needs to work offline. *Device:* offline-capable field PWA (role-gated). *Permissions:* assigned applications, verification checklist, identity/membership/milk-pouring checks, existing-cattle check, shed/residence geo-tag + photos, approve/return/reject-with-remarks, forward to DUSS; post-arrival inspection tasks.

**Veterinary Officer (VCI-registered).** *Objective:* certify the animal's health, value and fitness. *Device:* same field PWA, VO-gated views. *Permissions:* cattle examination, valuation input, mastitis/pregnancy screening, fitness-for-transport certificate, digital signature; honorarium ledger. Cannot approve payment.

**DUSS Data-Entry Operator (maker).** *Objective:* accurate bulk processing. *Device:* web portal. *Permissions:* open applications, enter/correct scrutiny data, raise deficiency memos, prepare bank batches. Maker only — cannot approve.

**DUSS Approving Officer (checker).** *Objective:* authorise processed batches. *Permissions:* approve/return maker's work, validate eligibility/quota, compute/approve subsidy, submit to bank, record sanction/subsidy transfer. Checker — segregation of duties enforced.

**District Officer.** *Objective:* district-level approval and oversight. *Permissions:* district dashboards, approvals within limits, exception handling, sign-off on batches where the scheme requires district concurrence.

**Bank Branch Maker.** *Objective:* capture appraisal & disbursement data. *Permissions (non-integrated mode):* upload/enter sanction list, loan account numbers, disbursement statement, EMI/default files; prepare records for checker.

**Bank Branch Checker.** *Objective:* authorise bank actions. *Permissions:* verify and approve maker entries; confirm sanction, disbursement, subsidy receipt, seller payment.

**Bank Regional Officer.** *Objective:* portfolio oversight. *Permissions:* read across branches, TAT and overdue views, escalations.

**Insurance Representative.** *Objective:* issue transit + cattle policies and manage claims. *Permissions:* view assets pending insurance, issue/record policies and premiums, act on claim workflow (KAVACH/CLAIMS reuse). Cannot alter loan/subsidy data.

**Cattle Seller.** *Objective:* register, be verified, get paid. *Device:* lightweight self-registration (assisted by supervisor/vet if needed) or supervisor-registered. *Permissions:* provide identity + bank proof, be inspected; view own payment status only. No access to programme data.

**Transporter.** *Objective:* record transit legitimately. *Permissions:* supply vehicle/driver/bill/challan data; captured mostly by the farmer/supervisor. View own transit records only.

**UCDF Programme Manager.** *Objective:* run the programme. *Permissions:* full read across all data; configure schemes/business rules; view all dashboards; no direct financial-action authority.

**UCDF Finance Officer.** *Objective:* reconcile every rupee. *Permissions:* subsidy/disbursement/seller-payment/EMI reconciliation views and reports; approve subsidy-release records; read-only on operational approvals.

**UCDF Administrator.** *Objective:* configuration and master data. *Permissions:* scheme configs, quotas, business rules, master data, role assignment (within governance). No transaction approval.

**Auditor / Inspection team.** *Objective:* independent assurance. *Permissions:* read-only across everything including immutable audit logs and exception reports; can flag/annotate; cannot edit or approve.

**System Administrator.** *Objective:* keep the platform healthy. *Permissions:* technical administration, integrations, monitoring; **no access to approve transactions or view unmasked personal/financial data beyond what operations requires** (privileged actions logged).

---

# PART 5 — Functional Requirements

Modules map onto the seven separated concerns. Requirements are prioritised **P0 (must-have / MVP), P1 (should-have), P2 (future)**. Each carries a user story and acceptance criteria (fuller criteria for critical flows are in Part 17).

## 5.1 Module: Scheme & Eligibility (config)

- **P0** Publish scheme details, eligibility rules, and document checklist, versioned by UCDF admin.
  - *As a farmer, I want to see the scheme and what documents I need, so that I can prepare before applying.*
  - **AC:** Given a published scheme, when a member opens the scheme screen, then eligibility rules, subsidy %, beneficiary contribution, max cattle, price ceiling and the document checklist render in the member's language; changing the scheme version does not alter in-flight applications (they retain their sanctioned scheme version).
- **P0** Self-serve eligibility checker (pre-screen, non-binding).
  - *As a farmer, I want to check if I likely qualify, so that I don't waste effort.*
  - **AC:** Given membership + milk-supply data from ERP, when the farmer runs the checker, then a plain-language likely-eligible / not-eligible / need-more-info result is shown with reasons; result is advisory and never a sanction.

## 5.2 Module: Enrolment & Selection (DCS)

- **P0** Express interest and route to DCS Secretary.
  - *As a farmer, I want to express interest in one tap, so that my society knows I want to apply.*
- **P0** DCS eligibility screening, agenda generation, board decision recording, resolution upload.
  - *As a DCS Secretary, I want to shortlist interested members and generate a board agenda, so that the meeting is efficient and minuted.*
  - **AC:** Given a list of interested members, when the board records a decision, then each member is marked Selected/Not-Selected with a reason, the resolution document is attached, and selected members transition to *Application Pending*; non-selected members are notified with reason and a re-apply path.
- **P1** Member 360 for the board: milk-supply history, existing deductions, repayment-capacity indicator (from ERP + TRUST pillar).

## 5.3 Module: Application & Documents

- **P0** Guided application form with ERP pre-fill; camera-first document upload; save-and-resume; offline draft.
  - *As a farmer, I want most fields pre-filled and to photograph documents, so that I barely have to type.*
  - **AC:** Given a selected member, when they open the application, then identity/membership/bank/milk fields are pre-filled from ERP and editable-with-flag; documents upload via camera with on-device quality check; the draft persists offline and syncs when online; submission is blocked until the mandatory checklist is complete.
- **P0** Document checklist engine with mandatory/optional/conditional logic and versioning.

## 5.4 Module: Field Verification (Supervisor + Vet)

- **P0** Assigned-task queue, verification checklist, identity/membership/milk-pouring/existing-cattle checks, shed & residence geo-tag with live timestamped photos, approve/return/reject with remarks — **fully offline**.
  - *As a route supervisor, I want to verify a farmer in the field without signal and sync later, so that verification is never blocked by connectivity.*
  - **AC:** Given no network, when the supervisor completes verification, then all data, GPS and photos queue locally and sync idempotently on reconnect; each media item retains EXIF/GPS/device metadata (lossless); a returned application routes back to the farmer with a reason and pauses the supervisor's clock.

## 5.5 Module: DUSS / District Processing

- **P0** Bulk inbox, scrutiny, eligibility validation, scheme-quota management, subsidy calculation, deficiency memo, bank-wise batching, prescribed-format generation/printing, maker-checker.
  - *As a DUSS checker, I want to process applications in bulk and generate the bank's prescribed forms, so that we stop re-keying and stop carrying paper.*
  - **AC:** Given verified applications, when the maker prepares a batch and the checker approves, then subsidy is computed per config, a bank-wise packet (PDF/Excel or API payload) is generated in the prescribed format, and each application moves to *Submitted to Bank*; a deficiency memo returns an application with itemised gaps.

## 5.6 Module: Bank Interface (both models)

- **Decision (resolves open question #2): API integration is the PRIMARY path (P0 target).** The cooperative bank integrates by API. The non-integrated file path is retained as a **degraded fallback** so a bank-API outage never halts the programme.
- **P0 (API, primary)** API submission, digital document exchange, sanction/disbursement/subsidy-receipt/seller-payment confirmation, EMI-schedule retrieval, overdue status, reconciliation.
- **P0 (fallback)** Downloadable bank packet; upload of sanction list, loan account numbers, disbursement statement, EMI/default files; maker-checker on every upload; quarantine of unmatched rows.
  - *As a bank checker, I want to push the sanction list back with one upload (or via API), so that members are intimated automatically.*
  - **AC:** Given a sanction file/API call, when it is validated and checked, then matching applications move to *Loan Sanctioned* (or *Loan Rejected* with reason) and farmers are intimated; unmatched rows are quarantined for manual resolution, never auto-applied.

## 5.7 Module: Subsidy & Disbursement (financial)

- **P0** Record and reconcile DUSS→bank subsidy transfer and bank→loan-account disbursement; every event reconcilable.
  - *As a UCDF finance officer, I want each subsidy and disbursement tied to a beneficiary and reconcilable, so that no rupee is unaccounted.*

## 5.8 Module: Guided Cattle Purchase & Inspection (verification)

- **P0** End-to-end guided purchase: seller registration + identity + bank-account verification; cattle inspection with mandatory photos/video; **live** geo-tag of purchase location; ear-tag capture + photo + registry duplicate-check; vet examination, valuation and fitness-for-transport; transport documentation; transit insurance; destination geo-tag; final cattle insurance; farmer acknowledgment; **payment recommendation only when all gates pass**; post-arrival verification.
  - *As a farmer, I want the app to walk me through buying and documenting the animal, so that my purchase is accepted the first time and I get paid quickly.*
  - **AC:** Given a disbursed loan, when the farmer completes each gated step, then the app enforces sequence, rejects a duplicate ear-tag or reused photo hash, requires live-captured (not gallery) images with GPS inside the approved geo-fence, and only enables *Seller Payment Pending* after vet certification, insurance and acknowledgment exist; any gate failure raises an exception flag rather than blocking silently.

## 5.9 Module: Insurance (KAVACH/CLAIMS reuse)

- **P0** Transit insurance before movement; final cattle insurance on arrival; policy assigned to bank; premium routed appropriately; **no post-dated / backdated policies**.
- **P1** Claims workflow (death/transit loss) with SLA clock and 4-document checklist (reuse platform CLAIMS).
  - **AC:** Given cattle in transit, when no transit policy exists, then movement/payment cannot be marked complete; a cattle policy's effective date cannot precede arrival confirmation.

## 5.10 Module: EMI Tracking & Milk-Payment Integration (financial)

- **P0** Map loan account ↔ milk-payment account; ingest EMI schedule; reconcile due/deducted/remitted/pending/partial/overdue/default from ERP; role-appropriate notifications; consolidated reports.
  - *As a farmer, I want to see how much was deducted from my milk payment against my loan, so that I trust the recovery.*
  - **Decision (resolves open question #1): the app INITIATES deductions.** It sends the deduction instruction to the ERP/bank rather than only observing. This is gated per-loan: initiation is permitted **only** where a recorded legal authorisation + tri-partite (farmer–society–bank) consent exists; a loan without that consent falls back to track-only. Reconciliation runs in both modes.
  - **AC:** Given a mapped loan with consent on file, when an EMI falls due, then the app initiates the milk-payment deduction, and on the ERP/bank response the ledger reconciles due↔deducted↔remitted↔pending, classifies partial/full/overdue/default, and notifies farmer/DCS/DUSS/bank/UCDF per role. Given a loan **without** recorded consent, the app does not initiate and instead tracks ERP-reported deductions only. Deduction priority relative to feed/insurance/other milk-payment debits is config.

## 5.11 Module: UCDF Command & Monitoring

- **P0** Live counts and drill-downs across the entire lifecycle (EOI → closure), performance league tables (district/DUSS/DCS/bank/supervisor), and exception/fraud panels. (Full list in Part 12.)

## 5.12 Module: Grievance & Exceptions

- **P0** Farmer grievance capture with SLA; **P1** structured exception workflows (Part 19).

## 5.13 Module: Post-Purchase Monitoring

- **P1** Arrival + 7/30/90-day inspections, milk-yield monitoring, vaccination/deworming/insurance-renewal reminders, death/sale reporting, asset-existence verification. (First-release vs later split in Part 15/20.)

---

# PART 6 — Screen Inventory

Two surfaces reuse the platform: the **farmer React-Native app** (offline-first) and the **field PWA** (supervisor/vet, offline end-to-end). DUSS/district, bank and UCDF use **responsive web portals**. For every screen the build specifies: name · objective · role · fields · buttons · validations · error & success messages · document-upload controls · progress indicator · offline capability · help content · accessibility. Below is the inventory with the salient attributes; the ten most important are wireframed in Part 16.

## 6.1 Farmer app (mobile)

| # | Screen | Objective | Offline | Notes |
|---|---|---|---|---|
| 1 | Login / registration | MPIN + OTP entry (no passwords) | Cached session | Reuse platform auth; Aadhaar step-up only where legally required |
| 2 | Farmer profile | Show pre-filled profile from ERP | View cached | Edits flagged for verification |
| 3 | Scheme information | Explain scheme, subsidy, contribution | View cached | Audio + icons |
| 4 | Eligibility checker | Non-binding pre-screen | Yes | Plain-language result + reasons |
| 5 | Express interest | One-tap EOI to DCS | Queue offline | Confirmation screen |
| 6 | Application form | Capture application, minimal typing | Draft offline | Save-and-resume, progress bar |
| 7 | Document checklist | Camera-first uploads | Queue offline | On-device quality check, retake prompt |
| 8 | Application status tracker | Show current status + next step | View cached | Timeline with honest "as of" timestamp |
| 9 | Loan-sanction / subsidy status | Show sanction, subsidy, disbursement | View cached | — |
| 10 | Guided cattle purchase (hub) | Step list with gates | Partial | Each gate = sub-screen 11–19 |
| 11 | Seller details capture | Seller identity + bank | Queue offline | Verification badges |
| 12 | Cattle inspection capture | Photos/video + description | Queue offline | Live capture enforced |
| 13 | Geo-tag (purchase & destination) | Capture lat/long live | Needs GPS | Geo-fence check, offline-cache position |
| 14 | Ear-tag capture | 12-digit tag + photo | Queue offline | Regex `^\d{12}$`, duplicate check on sync |
| 15 | Transport & transit insurance | Vehicle/driver/bill/challan + transit policy | Queue offline | — |
| 16 | Final cattle insurance | Policy details/quote | Partial | Effective date ≥ arrival |
| 17 | Farmer acknowledgment | Confirm receipt of animal | Queue offline | Signature/OTP |
| 18 | EMI schedule | Show installments | View cached | — |
| 19 | Milk-payment deduction ledger | Show deductions vs dues | View cached | "As of yesterday" honesty |
| 20 | Default alert | Warn on overdue | View cached | Plain-language + help |
| 21 | Grievance | Raise & track grievance | Queue offline | Category + SLA shown |
| 22 | Help / assisted mode | Audio-visual guidance, call-for-help | Yes | Multilingual |

## 6.2 Field PWA (supervisor / vet)

| # | Screen | Role | Offline |
|---|---|---|---|
| 23 | Task queue | Supervisor / Vet | Full |
| 24 | Field-verification checklist | Supervisor | Full |
| 25 | Geo-tagging (shed/residence) | Supervisor | Full (GPS) |
| 26 | Existing-cattle verification | Supervisor | Full |
| 27 | Vet examination & valuation | Vet | Full |
| 28 | Fitness-for-transport certificate + e-sign | Vet | Full |
| 29 | Post-arrival inspection | Supervisor/Vet | Full |
| 30 | Sync / conflict status | Both | Full |

## 6.3 DCS portal (web/tablet)

| # | Screen | Role |
|---|---|---|
| 31 | Interested-members list | Secretary |
| 32 | Beneficiary-selection / agenda | Secretary + Board |
| 33 | Board decision & resolution upload | Board |
| 34 | Document verification / return | Secretary |
| 35 | Member application tracker | Secretary |

## 6.4 DUSS / District portal (web)

| # | Screen | Role |
|---|---|---|
| 36 | Bulk application inbox | Maker |
| 37 | Scrutiny & eligibility validation | Maker/Checker |
| 38 | Subsidy calculation | Checker/Finance |
| 39 | Deficiency memo | Maker |
| 40 | Bank-wise batch & prescribed-format generation | Checker |
| 41 | Sanction & subsidy-release tracking | Checker/Finance |
| 42 | District dashboard & exception report | District Officer |

## 6.5 Bank portal (web) / integration

| # | Screen | Role |
|---|---|---|
| 43 | Application packet inbox / API log | Maker |
| 44 | Sanction-list upload / confirmation | Maker/Checker |
| 45 | Loan-account & disbursement upload | Maker/Checker |
| 46 | EMI / default file upload | Maker/Checker |
| 47 | Reconciliation view | Checker/Regional |

## 6.6 UCDF & shared

| # | Screen | Role |
|---|---|---|
| 48 | UCDF command dashboard | Programme Manager |
| 49 | Reports & exports | Manager/Finance |
| 50 | Audit-log viewer | Auditor |
| 51 | System configuration (schemes, rules, quotas, roles) | Admin |
| 52 | Notifications centre / templates | Admin |

## 6.7 Universal screen attributes (apply to all)

Progress indicator on every multi-step flow; **large tap targets, icon-led navigation, local-language labels + audio**; camera-first document controls with retake and quality feedback; explicit **error messages in plain language** (e.g. "This ear-tag number is already used for another loan — please check"); **success confirmation screens** before any irreversible submit; offline capability as tabled; contextual help; and accessibility (screen-reader labels, high-contrast, minimum 11px+ text, no colour-only signalling).

---

# PART 7 — Data Dictionary

Selected core entities. Columns: field · description · type · M/O/S/C (Mandatory / Optional / System / Conditional) · source · validation · visibility. (S = system-generated; C = conditionally required.)

## 7.1 Farmer / Beneficiary

| Field | Description | Type | M/O/S/C | Source | Validation | Visibility |
|---|---|---|---|---|---|---|
| farmer_id | Internal UUID | UUID | S | System | unique | All roles (scoped) |
| member_ref | ERP membership id | string | M | ERP | exists in ERP | DCS, DUSS, bank, UCDF |
| name | Full name | string | M | ERP/KYC | non-empty | Scoped |
| mobile | Mobile number | string | M | Farmer | 10-digit, OTP-verified | Scoped |
| aadhaar_ref | Aadhaar reference (tokenised) | string | C | KYC | Verhoeff; stored masked | Restricted |
| dcs_id | Society | UUID | M | ERP | exists | DCS/DUSS/UCDF |
| membership_since | Join date | date | M | ERP | ≥ min-membership rule | DCS/DUSS/bank |
| milk_supply_avg | Avg daily/period milk supplied | number | S | ERP | ≥0 | DCS/DUSS/bank |
| outstanding_payable | Milk dues owed to member | number | S | ERP | ≥0 | DUSS/bank/finance |
| bank_account | Beneficiary loan/payment a/c | string | M | Bank/ERP | penny-drop verified | Bank/finance |
| repayment_capacity | Derived indicator | enum | S | TRUST | band | DCS/DUSS/bank |

## 7.2 Application

| Field | Description | Type | M/O/S/C | Source | Validation | Visibility |
|---|---|---|---|---|---|---|
| application_id | UUID | UUID | S | System | unique | Scoped |
| scheme_version | Scheme config applied | string | S | System | pinned at submit | All |
| status | Current status | enum | S | System | valid transition only | All (scoped) |
| eoi_at | Interest timestamp | datetime | S | System | — | DCS/UCDF |
| selection_decision | Selected / Not / Pending | enum | M | DCS Board | reason if Not | DCS/DUSS/UCDF |
| resolution_doc | Board minutes | file | C | DCS | pdf/img, ≤10MB | DCS/DUSS/auditor |
| supervisor_verify | Verification result | enum | M | Supervisor | geo+photos present | DUSS/UCDF |
| deficiency_memo | Itemised gaps | text | C | DUSS | — | Farmer/DCS |
| bank_batch_id | Bank packet reference | string | S | System | — | DUSS/bank |
| sanction_status | Sanctioned/Rejected | enum | C | Bank | reason if rejected | All |
| sanctioned_amount | Loan amount | number | C | Bank | ≤ ceiling | Bank/DUSS/finance |
| subsidy_amount | Subsidy component | number | S | Config/DUSS | per scheme % | DUSS/finance |
| farmer_contribution | Beneficiary share | number | S | Config | per scheme | Farmer/bank |

## 7.3 Cattle / Livestock-purchase schema

| Field | Type | M/O/S/C | Source | Validation |
|---|---|---|---|---|
| animal_id (UUID) | UUID | S | System | unique |
| ear_tag_no | string | M | Farmer/Vet | `^\d{12}$`, **registry-unique** |
| ear_tag_photo | file | M | Farmer | live capture, hashed |
| species | enum | M | Farmer | catalog |
| breed | enum | M | Vet/Farmer | catalog |
| sex | enum | M | Vet | — |
| age | number/months | M | Vet (dentition) | plausibility |
| parity | int | C | Vet | ≥0 |
| lactation_number | int | C | Vet | ≥0 |
| pregnancy_status | enum | M | Vet | PD result |
| last_calving_date | date | C | Vet | ≤ today |
| daily_milk_yield | number | M | Vet/test | ≥0 |
| test_milking_result | number | M | Vet | ≥0 |
| expected_yield | number | S/O | Model/Vet | advisory |
| body_condition_score | number | M | Vet | 1–5 scale |
| colour_marks | text | M | Vet/Farmer | non-empty |
| horn_characteristics | text | O | Vet | — |
| dentition | text | M | Vet | — |
| vaccination_history | text/struct | M | Vet | dates |
| deworming_history | text/struct | O | Vet | — |
| disease_history | text | O | Vet | — |
| reproductive_history | text | C | Vet | — |
| mastitis_screening | enum | M | Vet | result |
| pregnancy_diagnosis | enum | C | Vet | — |
| fitness_for_transport | file/bool | M | Vet | e-signed |
| estimated_market_value | number | M | Vet | plausibility band |
| approved_purchase_price | number | M | Vet/DUSS | ≤ ceiling; ≤ value+tol |
| photos | file[] | M | Farmer | ≥N live, hashed |
| video | file | M | Farmer | live |

## 7.4 Seller / Transport / Payment / Insurance

**Seller:** seller_id (S), name (M), id_proof (M, verified), bank_account (M, penny-drop), photo (M, live), relationship_to_buyer (M — used for circular-sale check). **Transport:** vehicle_reg_no (M, format-checked), driver_name (M), driver_id (C), transport_bill (M, file), transport_challan (M, file), origin_geo (M), destination_geo (M), transit_time (S). **Payment split:** total_price (M), loan_component (S), subsidy_component (S), farmer_contribution (M), seller_payout (S), duss_farmer_payout (C). **Insurance:** transit_policy_no (M), transit_effective (M, before movement), cattle_policy_no (M), cattle_effective (M, ≥ arrival), sum_insured (M, = market value), premium (S), assigned_to_bank (M/bool).

## 7.5 EMI / Repayment

emi_schedule_id (S), loan_account (M), milk_account_map (M), installment_no (S), emi_due (M), due_date (M), amount_deducted (S, from ERP), amount_remitted (S), pending_amount (S), status (S: due/partial/paid/overdue/default), moratorium_flag (C), restructure_flag (C).

*(Full field-level dictionary for every screen is delivered as an appendix during build; the above covers the reconciliation-critical and fraud-critical entities.)*

---

# PART 8 — Workflow Status Matrix

Standard status taxonomy with owner · entry condition · exit condition · permitted actions · notification recipients · escalation timeline (TAT, configurable) · audit requirement. All transitions write to the append-only `domain_events` outbox; financial and cattle-verification events are the highest-scrutiny.

| Status | Owner | Entry condition | Exit → next | Permitted actions | Notify | Escalation | Audit |
|---|---|---|---|---|---|---|---|
| Draft | Farmer | EOI or app started | Interest Submitted | edit, submit | — | none | create/edit log |
| Interest Submitted | Farmer→DCS | EOI sent | Pending DCS Review | withdraw | DCS Sec | 3d no ack → DCS head | event |
| Pending DCS Review | DCS Sec | EOI received | Selected / Not Selected | screen, agenda | Farmer | 15d → DUSS | event |
| Selected by DCS | DCS Board | Board resolution | Application Pending | record, upload minutes | Farmer | — | resolution stored |
| Not Selected | DCS Board | Board resolution | Application Closed | reason, re-apply path | Farmer | — | reason stored |
| Application Pending | Farmer | Selected | Documents Incomplete / Pending Supervisor | fill, upload | Farmer | 7d reminder | edit log |
| Documents Incomplete | Farmer | Missing docs | Pending Supervisor | complete | Farmer | 7d → DCS | log |
| Pending Supervisor Verification | Supervisor | App complete | Returned / Forwarded to DUSS | verify, geo, photo | Supervisor | 5d → DUSS | verify record |
| Returned for Correction | Farmer | Supervisor return | Pending Supervisor | fix | Farmer | 7d → DCS | reason |
| Forwarded to DUSS | DUSS Maker | Supervisor approved | Under DUSS Scrutiny | receive | DUSS | — | event |
| Under DUSS Scrutiny | DUSS Maker/Checker | In bulk inbox | Pending District / Submitted to Bank | scrutinise, subsidy calc, deficiency | DUSS | 7d → District | maker/checker log |
| Pending District Approval | District Officer | Scheme needs district sign-off | Submitted to Bank | approve/return | District | 5d → UCDF | approval log |
| Submitted to Bank | Bank Maker | Batch generated/API | Under Bank Appraisal | receive | Bank, DUSS | — | packet/API log |
| Under Bank Appraisal | Bank | Received | Bank Query / Sanctioned / Rejected | appraise | Bank | 15d → Regional+UCDF | event |
| Bank Query Raised | DUSS/Farmer | Bank query | Under Bank Appraisal | respond | Farmer/DUSS | 7d → Regional | query log |
| Loan Sanctioned | Bank Checker | Sanction confirmed | Subsidy Pending | confirm | Farmer, DUSS, UCDF | — | sanction record |
| Loan Rejected | Bank Checker | Rejection | Application Closed | reason | Farmer, DUSS | — | reason |
| Subsidy Pending | DUSS/Finance | Sanctioned | Subsidy Transferred | initiate transfer | Finance | 7d → UCDF finance | ledger |
| Subsidy Transferred | Finance/Bank | Transfer recorded | Loan Disbursed | confirm receipt | Bank, UCDF | 5d → UCDF | reconcilable ledger |
| Loan Disbursed | Bank | Credit to loan a/c | Cattle Purchase Pending | confirm | Farmer, DUSS, UCDF | — | disbursement record |
| Cattle Purchase Pending | Farmer | Disbursed | Purchase Initiated | start guided purchase | Farmer | purchase-deadline timer → DUSS | event |
| Purchase Initiated | Farmer | Seller+cattle capture started | Veterinary Verification Pending | capture | Supervisor | — | capture log (hashed media) |
| Veterinary Verification Pending | Vet | Inspection captured | Purchase Approved / Rejected | examine, value, certify | Vet | 3d → DUSS | vet record + e-sign |
| Purchase Approved | Vet/DUSS | All gates pass | Transit in Progress | proceed | Farmer, Insurer | — | gate log |
| Purchase Rejected | Vet/Supervisor | Gate fail | Cattle Purchase Pending | reason, retry | Farmer | — | reason + flag |
| Transit in Progress | Farmer/Transporter | Transit policy + transport docs | Cattle Delivered | move, capture destination | Supervisor | transit-time timer | transit log |
| Cattle Delivered | Farmer | Destination geo confirmed | Insurance Pending | acknowledge | Supervisor, Insurer | 2d → DUSS | arrival record |
| Insurance Pending | Insurer | Delivered | Seller Payment Pending | issue cattle policy | Insurer | 3d → DUSS | policy record |
| Seller Payment Pending | Bank/Finance | Insurance + acknowledgment complete | Seller Paid | recommend & pay | Finance, Seller | 5d → UCDF | payment record |
| Seller Paid | Bank/Finance | Payment done | EMI Active | confirm | Farmer, Seller, DUSS | — | reconcilable |
| EMI Active | System/ERP | Repayment begins | EMI Overdue / Loan Closed | track deductions | Farmer, DCS | schedule | ledger events |
| EMI Overdue | System | Missed/partial | EMI Active / Loan Restructured | dunning, grievance | Farmer, DCS, DUSS, bank | ageing buckets → UCDF | ledger |
| Loan Restructured | Bank | Restructure approved | EMI Active | apply new schedule | Farmer, DUSS | — | restructure record |
| Insurance Claim Initiated | Farmer/Insurer | Death/loss | (CLAIMS flow) | file claim (4 docs) | Insurer, bank, DUSS | SLA clock | claim_events (hash-chained) |
| Loan Closed | Bank | Fully repaid/settled | Application Closed | no-dues cert | Farmer, DUSS | — | closure record |
| Application Closed | System | Terminal | — | archive | — | — | immutable |

---

# PART 9 — Role & Permission Matrix (RBAC)

Principles enforced platform-wide: **least privilege · maker-checker · segregation of duties · approval limits · immutable audit logs · masked access to personal/financial data.** C=Create, R=Read, U=Update, A=Approve, X=none. Read is always scoped (own DCS/DUSS/district/branch).

| Capability | Farmer | DCS Sec | DCS Board | Supervisor | Vet | DUSS Maker | DUSS Checker | District | Bank Maker | Bank Checker | Bank Regional | Insurer | Seller | Transporter | UCDF PM | UCDF Finance | UCDF Admin | Auditor | SysAdmin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Own profile | CRU | R | R | R | R | R | R | R | R | R | R | R | CRU(self) | CRU(self) | R | R | R | R | X |
| Express interest | C | R | R | X | X | R | R | R | X | X | X | X | X | X | R | X | X | R | X |
| Beneficiary selection | X | CRU | A | X | X | X | X | X | X | X | X | X | X | X | R | X | X | R | X |
| Application | CRU | RU | R | R | X | RU | R | R | X | X | X | X | X | X | R | X | X | R | X |
| Field verification | X | R | X | CRU | X | R | R | R | X | X | X | X | X | X | R | X | X | R | X |
| Vet exam/valuation | R(own) | X | X | R | CRU | R | R | R | X | X | X | R | X | X | R | X | X | R | X |
| Scrutiny/subsidy calc | X | X | X | X | X | CRU | A | A | X | X | X | X | X | X | R | R | X | R | X |
| Bank submission | X | X | X | X | X | C | A | R | R | R | R | X | X | X | R | R | X | R | X |
| Sanction/disbursement | R(own) | X | X | X | X | R | R | R | CU | A | R | X | X | X | R | R | X | R | X |
| Subsidy transfer | R(own) | X | X | X | X | R | A | R | R | A | R | X | X | X | R | A | X | R | X |
| Guided purchase | CRU | X | X | R | R | R | R | R | X | X | X | R | X | X | R | X | X | R | X |
| Seller registration/verify | C(assist) | X | X | CRU | R | R | R | R | X | X | X | R | CRU(self) | X | R | X | X | R | X |
| Insurance issue | R(own) | X | X | X | X | R | R | R | R | R | R | CRU | X | X | R | R | X | R | X |
| Seller payment approval | R(own) | X | X | X | X | R | R | R | CU | A | R | X | R(self) | X | R | A | X | R | X |
| EMI ledger | R(own) | R | R | X | X | R | R | R | RU | A | R | X | X | X | R | RA | X | R | X |
| Config (scheme/rules/quota) | X | X | X | X | X | X | X | R | X | X | X | X | X | X | RU | R | CRUA | R | X |
| Role assignment | X | X | X | X | X | X | X | X | X | X | X | X | X | X | R | X | CRUA | R | X |
| Dashboards | own | DCS | DCS | own tasks | own tasks | DUSS | DUSS | district | branch | branch | region | insurer | own | own | ALL | ALL(fin) | ALL(config) | ALL(RO) | tech |
| Audit log | X | X | X | X | X | X | X | R | X | X | X | X | X | X | R | R | R | R(full) | R(tech) |

*(Approval limits — e.g. max sanctionable amount per bank role, subsidy sign-off thresholds — are configured per role in scheme/finance config, not hard-coded.)*

---

# PART 10 — Integration Architecture

All external systems are reached through the platform's `src/integrations/` layer. The **Aanchal ERP adapter** already supports four modes — `live | webhook | filedrop | mock` — and **filedrop (daily SFTP CSV/XLSX batches) is a first-class launch mode**: the programme must run even if no real-time API exists yet. Modules import a clean interface only; connectivity is swappable.

For each integration: purpose · data · direction · frequency · auth · failure handling · retry · reconciliation · data ownership · manual fallback.

| Integration | Purpose | Data exchanged | Direction | Frequency | Auth | Failure / retry | Reconciliation | Owner | Manual fallback |
|---|---|---|---|---|---|---|---|---|---|
| **Aanchal / dairy ERP** | Member master, milk supply + outstanding, DCS mapping | member, milk summary, dues | In (+ receipts out) | live/webhook or **daily filedrop** | mTLS/SFTP keys | idempotent ingest, late/dup-file tolerant, requeue | sequence-numbered batches; "as of" freshness label | UCDF | CSV upload by DUSS |
| **Milk-payment / farmer-payment** | EMI deduction data | deductions, remittances | In | daily/settlement cycle | as ERP | reconcile due↔deducted↔remitted | ledger match, exception queue | UCDF | file upload |
| **Cooperative bank LMS** | Sanction, loan a/c, disbursement, EMI schedule, overdue | app packet out; sanction/disb/EMI in | Both (or file) | per batch / daily | API key + mTLS **or** maker-checker file upload | quarantine unmatched rows; never auto-apply | packet↔sanction↔disbursement↔payment | Bank | **downloadable packet + upload of sanction/disb/EMI files** |
| **Subsidy-payment** | DUSS→bank subsidy transfer record | transfer refs | Both | per batch | as bank | dual-record; confirm receipt | subsidy↔sanction match | UCDF/DUSS | file + manual confirm |
| **Banking / payment rails** | Seller & farmer payouts, penny-drop a/c verify | account verify, payout status | Both | on event | API key | verify before pay; retry payout status | payout↔seller↔animal | Bank | bank-side manual pay + upload proof |
| **Insurance (KAVACH/CLAIMS + insurer)** | Transit + cattle policies, premiums, claims | quotes, policies, claim events | Both | on event | API/OAuth | block movement/payment if policy missing | policy↔animal↔loan | Insurer/UCDF | insurer portal + record entry |
| **Veterinary / e-sign** | Vet identity, digital signature on certificate | vet reg, signature | In | on event | eSign/DSC | fallback to captured signature + reg no. | cert↔vet↔animal | UCDF | manual signed upload |
| **Ear-tag / livestock ID (NDDB/INAPH)** | Tag validity + duplicate registry check | 12-digit tag lookup | Out (query) | on capture | API key | if unavailable, flag for post-verify (don't block wrongly) | tag uniqueness ledger | NDDB/UCDF | internal tag registry + manual check |
| **Identity (Aadhaar/OTP), where legally permissible** | Farmer/seller identity | OTP / tokenised ref | Out | on verify | UIDAI-compliant | OTP fallback | consent-logged | UIDAI/UCDF | member-ID + document proof |
| **DigiLocker (optional)** | Fetch verified documents | issued docs | Out | on demand | OAuth | manual upload fallback | doc hash match | Issuer | camera upload |
| **Maps / geo-location** | Geo-tag, geo-fence, reverse-geocode | lat/long, place | Both | on capture | SDK key | cache offline position; server re-validate | geo↔purchase/destination | UCDF | manual location (flagged) |
| **SMS / IVR gateway** | Notifications, OTP, voice | messages, calls | Out | on event | API key | retry + fallback channel | delivery logs | UCDF | in-app only |
| **WhatsApp provider (approved)** | Rich notifications | templated messages | Out | on event | Business API | fallback to SMS | delivery logs | UCDF | SMS |
| **Object storage (S3, Indian region)** | Evidence/document lake (lossless) | media, docs (content-addressed) | Both | on event | IAM | retry; integrity hash | hash↔evidence | UCDF | — |
| **Analytics platform** | Dashboards/reports | aggregates | Out | batch/stream | internal | recompute | — | UCDF | export |

**Non-integrated bank operation (must be fully supported):** the app generates a bank-wise application packet (prescribed PDF + Excel), the bank returns sanction list / loan-account numbers / disbursement statement / EMI & default files, and DUSS uploads them under maker-checker. This path is a P0 launch requirement precisely because the cooperative bank may not have APIs on day one.

---

# PART 11 — Notification Matrix

Channels: in-app · SMS · WhatsApp (where approved) · automated voice/IVR · email · dashboard alert. Templates are bilingual **plain Hindi + English** with **local-language audio** for farmers. Every notification records delivery status.

| Event | Recipient(s) | Channels | Message intent |
|---|---|---|---|
| Scheme launch | All members | in-app, SMS, IVR | "New cattle scheme open — check eligibility" |
| EOI received | Farmer, DCS Sec | in-app, SMS | "Your interest is received by your society" |
| Selected by DCS | Farmer | in-app, SMS, IVR | "You are selected — complete your application" |
| Not selected | Farmer | in-app, SMS | reason + re-apply guidance |
| Application incomplete | Farmer | in-app, SMS | itemised missing documents |
| Supervisor visit scheduled | Farmer | in-app, SMS | date/expectation |
| Application forwarded | Farmer, DUSS | in-app | status advance |
| Bank query raised | Farmer, DUSS | in-app, SMS | what to provide |
| Loan sanctioned | Farmer, DCS, DUSS, UCDF | in-app, SMS, IVR | amount + next steps |
| Loan rejected | Farmer, DUSS | in-app, SMS | reason |
| Subsidy transferred | DUSS, bank, UCDF finance | in-app, email | reconciliation cue |
| Loan disbursed | Farmer, DUSS, UCDF | in-app, SMS, IVR | "Loan credited — you may purchase" |
| Cattle-purchase deadline | Farmer | in-app, SMS, IVR | countdown + help |
| Missing purchase documents | Farmer | in-app, SMS | what's missing |
| Purchase approved / rejected | Farmer | in-app, SMS | outcome + reason |
| Cattle delivered / arrival confirmed | Farmer, Supervisor | in-app | next: insurance |
| Insurance issued / expiry | Farmer, bank | in-app, SMS | policy + renewal date |
| Seller payment done | Seller, Farmer, DUSS | in-app, SMS | payout confirmation |
| EMI due | Farmer | in-app, SMS, IVR | amount + date |
| Deduction completed | Farmer | in-app, SMS | amount deducted from milk payment |
| Partial deduction | Farmer, DCS | in-app, SMS | shortfall + effect |
| EMI default | Farmer, DCS, DUSS, bank, UCDF | in-app, SMS, IVR, dashboard | dunning + grievance path |
| Grievance update | Farmer | in-app, SMS | status |
| Loan closure / no-dues | Farmer, DUSS, bank | in-app, SMS | congratulations + certificate |

---

# PART 12 — Reports & Dashboard Design

All reports support **filters** (district / DUSS / DCS / bank / scheme / date-range / status), **drill-down** (roll-up figure → underlying rows), **charts + tables**, **export** (PDF/Excel/CSV), and **scheduled delivery** (daily/weekly email or dashboard).

**UCDF command dashboard (live tiles + drill-down):** expressions of interest; selected beneficiaries; applications pending at each level; returned/rejected; bank-wise submissions; bank-wise sanctions; subsidy transferred; loans disbursed; cattle purchased; cattle awaiting verification; seller payments pending; insurance pending; transport completed; cattle arrived; EMI deductions; repayment performance; defaults; district/DUSS/DCS performance league tables; bank-wise turnaround time; supervisor productivity; audit exceptions; suspected-fraud cases.

**Operational reports:** farmer-wise status; DCS-wise applications; DUSS-wise & district-wise performance; turnaround time at each stage; supervisor productivity; grievance pendency. **Financial reports:** subsidy utilisation; loan disbursement; seller payments; reconciliation exceptions. **Repayment reports:** EMI deductions; outstanding loans; overdue accounts; **default ageing** (0–30 / 31–60 / 61–90 / 90+); milk-supply-linked repayment-capacity. **Cattle reports:** cattle purchases; breed-wise induction; average purchase price; **price outliers**; veterinarian activity; insurance coverage; transit losses. **Seller-integrity reports:** seller concentration (one seller across many loans — a fraud signal). **Audit reports:** audit exceptions; fraud-risk indicators; maker-checker exceptions.

Delivery: the UCDF dashboard is the primary live surface; banker and government consumption in the first release is via **generated documents/reports** (prescribed packet, reconciliation statement, exception report) with live dashboards for those parties deferred to a later phase.

---

# PART 13 — Fraud & Risk Controls

Controls are separated into **preventive** (stop it happening), **detective** (surface it after), and **corrective** (respond). Following the platform stance: **the system flags and routes to humans; it never auto-rejects or auto-denies.** Essential vs optional-advanced is marked [E]/[A].

## 13.1 Preventive

Member-ID validation against ERP [E]; mobile OTP [E]; bank-account **penny-drop verification** before any payout [E]; **live timestamped photo/video** capture only — gallery uploads blocked for cattle/ear-tag/geo evidence [E]; **geo-fencing** of purchase and destination to approved geography [E]; **ear-tag registry uniqueness check** at capture (`^\d{12}$` + registry lookup) to stop the same animal on multiple loans [E]; **image perceptual-hash** on capture to block reused photographs [E]; enforced **verification-gate sequencing** so payment cannot be recommended before vet + insurance + acknowledgment [E]; **maker-checker** on all financial and sanction/subsidy actions [E]; segregation of duties [E]; **relationship-to-buyer capture** on the seller to screen circular sales [E]; **policy-date rules** blocking backdated/post-purchase insurance [E]; Aadhaar-based verification where legally permissible [A]; **liveness check** on farmer/seller capture [A]; veterinary **digital signature / DSC** on the certificate [A].

## 13.2 Detective

**Duplicate-application detection** (same farmer/animal/tag/account) [E]; **duplicate-subsidy detection** [E]; **duplicate-image detection** across the evidence lake [E]; **metadata/EXIF checks** for tampering and **location-spoofing detection** (GPS vs network vs EXIF disagreement) [E]; **price-outlier detection** vs breed/region bands (inflated valuation) [E]; **seller-concentration analysis** [E]; **payment-to-unrelated-account** checks (payee ≠ registered seller) [E]; altered-certificate / document-forensics screening [A]; ML **risk scoring** per application/purchase — advisory, reason-coded, shadow-first [A]; substitution check (inspection tag/photo vs arrival tag/photo mismatch) [E].

## 13.3 Corrective

**Exception flags** with mandatory human review and reason codes; **hold on payment** until an exception is cleared; **return/reject with audit trail**; **random post-purchase physical inspection** sampling [E]; **grievance + escalation** hierarchy (Part 19); claim-driven loan adjustment on death/loss; recovery/restructuring workflows on EMI default; and **immutable, tamper-evident logs** (`domain_events` append-only; claim events hash-chained) so any incident is reconstructable.

**Principle:** not every advanced technology is required to launch. Muzzle biometrics, liveness, ML risk scoring and document forensics are **optional/advanced** and phased in (shadow → assist → automate-with-override); the **essential** controls above are enough to make the first release materially fraud-resistant.

---

# PART 14 — Non-Functional Requirements

**Offline-first (requirement, not option):** the farmer logbook/purchase capture and the entire field PWA must work with no signal — local write queue → idempotent sync → **server-wins conflict resolution with farmer notification**. Status/passbook screens always show last-synced state with an honest "as of" timestamp.

**Connectivity & devices:** low-bandwidth tolerant; delayed synchronisation; works on modest Android devices; large photo/video uploads handled with compression-on-device (originals preserved lossless in the evidence lake), resumable/chunked upload, and background retry.

**Security & privacy:** encryption at rest and in transit; role-based access with least privilege and masking of personal/financial data; **DPDP-compliant consent** per data share, purpose-bound and revocable, with a distinct `model_improvement` purpose (no training on unconsented data); biometric/voice data (if used) encrypted, Indian-region, deletable, and never leaving the platform; secure cloud or government-approved hosting in an Indian region.

**Auditability:** every approval/edit/rejection timestamped and attributable; append-only event outbox; hash-chained claim events; evidence content-addressed and lossless (EXIF/GPS preserved, re-compression rejected).

**Scalability & availability:** scale across all Uttarakhand districts and DCS volumes; horizontally scalable services; **target uptime 99.5%** for core services; API monitoring and alerting; graceful degradation to filedrop/manual modes.

**Resilience:** disaster recovery with defined **RPO ≤ 15 minutes** and **RTO ≤ 4 hours** for core transactional data; regular backups (tested restores); data-retention policy aligned to banking/scheme audit needs (e.g. loan lifecycle + statutory retention).

**Performance (targets):** interactive screens respond < 2s on 3G; document upload acknowledged immediately and completed in background; dashboard tiles refresh with clearly-labelled freshness; bulk batch generation for a DUSS handled within minutes.

**Configurability & i18n:** schemes, business rules, quotas, SLA timers, subsidy %, price ceilings, and workflow steps configurable by UCDF admins **without code changes**; multilingual (Hindi + English at minimum, extensible), with audio guidance; responsive web portals; accessibility per Part 6.7.

---

# PART 14A — Business Rules (configurable)

Every rule below is **configuration**, held in scheme/finance/coop config and versioned — never hard-coded. Which are UCDF-admin-editable is marked ⚙.

Farmer eligibility criteria ⚙; **minimum DCS membership period** ⚙; **minimum milk-supply history** (volume + continuity) ⚙; existing-loan-obligation ceiling / debt check ⚙; **maximum cattle per beneficiary** ⚙; eligible breeds ⚙; **purchase-price ceiling** (per breed/region) ⚙; **subsidy percentage** and government share split ⚙; **beneficiary contribution %** ⚙; loan-amount computation ⚙; insurance mandatory (transit + cattle) ⚙; **permitted purchase geography / geo-fence radius** ⚙; authorised-seller policy ⚙; veterinary-approval requirement ⚙; **transport-time limit** ⚙; **cattle-delivery deadline** after disbursement ⚙; post-arrival-inspection schedule (7/30/90-day) ⚙; **EMI deduction priority** relative to feed/insurance/other milk-payment deductions ⚙; **grace period** before overdue ⚙; **default classification** (days-past-due buckets) ⚙; escalation timers per stage ⚙.

**Alignment note (co-op credit vs KCC):** cattle-induction is a **loan-cum-subsidy** origination programme, distinct from the platform's routine co-op input-order credit (70%-of-payables). The two must **never** be double-counted against each other, consistent with the platform rule that co-op input credit is not part of the KCC limit. Milk payables are used here as **repayment-capacity evidence and the EMI recovery source**, not as a credit line.

---

# PART 14B — Grievance & Exception Management

Each exception has an owner, an SLA and an escalation ladder (Farmer → DCS → Supervisor/Vet → DUSS → District → UCDF → Bank/Insurer as relevant). Grievances are farmer-visible with status and are never closed without a recorded resolution.

| Exception | First owner | Typical SLA | Resolution path / escalation |
|---|---|---|---|
| Farmer not selected | DCS Board | 7d | Reason shown; appeal to DCS → DUSS review |
| Application wrongly rejected | DUSS | 7d | Re-open with correction; District review |
| Bank delay | DUSS → Bank Regional | 15d | Escalate branch→regional→UCDF |
| Subsidy delay | UCDF Finance | 7d | Finance reconciliation + escalate |
| Cattle rejected at inspection | Vet/Supervisor | 3d | Re-inspect / choose another animal within deadline |
| Seller-payment delay | Bank/Finance | 5d | Verify gates cleared; escalate to regional |
| Cattle death in transit | Insurer (transit) | per policy | Transit-insurance claim; loan hold; re-induction decision |
| Cattle death after delivery | Insurer (cattle) | 15d from docs (per policy) | CLAIMS flow, 4-document checklist, loan adjustment |
| Insurance claim | Insurer | SLA clock + penal interest on breach | KAVACH/CLAIMS reuse; farmer-visible clock |
| Ear-tag loss | Vet/Supervisor | 7d | Re-tag + registry update, photo re-capture |
| Cattle illness | Vet/Advisory | advisory | Treatment + advisory; monitor |
| Cattle not matching approved details | Supervisor/DUSS | 3d | Flag substitution; hold payment; investigate |
| Transport dispute | DUSS | 7d | Verify bill/challan; adjust |
| Incorrect / excessive EMI deduction | UCDF Finance + Bank | 7d | Reconcile ERP↔bank; correct/refund |
| Loan already repaid but deducted | Finance/Bank | 7d | Reverse; no-dues |
| Farmer migration to another DCS | DUSS | 15d | Re-map milk account; continue recovery |
| Farmer death | DUSS/Bank | per policy/scheme | Settlement/insurance/legal-heir process |
| Duplicate application | System→DUSS | on detect | Merge/void with audit |
| System / data error | SysAdmin | per severity | Incident process; correct with audit |

---

# PART 14C — Post-Purchase Monitoring

Extends the product past purchase to protect the asset and the loan: **arrival verification**; **7-day, 30-day, 90-day inspections**; cattle-health check-ins; **milk-yield monitoring** (does the animal produce as valued?); pregnancy/reproduction tracking; **vaccination and deworming reminders**; **insurance-renewal alerts**; **cattle death reporting**; **sale/transfer restrictions** while the loan is live (asset assigned to bank); loan-repayment-performance linkage; and periodic **asset-existence verification** (re-photograph + ear-tag re-confirm, optionally muzzle re-ID).

**First release vs later:** arrival verification, ear-tag/photo confirmation, insurance-renewal and vaccination reminders, cattle-death reporting, and repayment-performance linkage are **first-release-adjacent** (they protect the money). Milk-yield analytics, muzzle re-ID asset verification, and reproductive tracking are **later-phase** enhancements.

---

# PART 15 — MVP & Product Roadmap

Sequencing mirrors the platform's phase model: prove the workflow and capture first, then wire money/ERP, then advanced verification, then full lifecycle. **Every farmer/field screen is first a clickable HTML mock with mock JSON in `prototypes/` — the settled prototype is the spec.**

## Phase 1 — MVP: Application & Capture (no money movement yet)
**Features:** scheme/eligibility publishing; EOI; DCS selection + resolution; farmer application + document upload (ERP pre-fill); supervisor field verification (offline) with geo-tag + live photos; DUSS bulk processing + prescribed-format generation; **bank-status update via file upload (non-integrated)**; cattle-purchase **document/info capture** (photos, ear-tag, geo-tag). **Dependencies:** ERP filedrop feed (member + milk); object storage; auth. **Risks:** ERP data quality; field connectivity; user adoption. **Complexity:** Medium. **Outcome:** a sanction-ready, verified application produced digitally end-to-end with cattle evidence captured. **Success indicators:** % applications fully digital; supervisor verifications completed offline & synced; reduction in bank rework/deficiency loops; UCDF sees live status for every application.

## Phase 2 — Financial & ERP Integration
**Features:** subsidy calculation + DUSS→bank transfer recording; disbursement recording; **loan-account ↔ milk-account mapping**; EMI-schedule ingest; **milk-payment-linked EMI tracking** (due/deducted/remitted/pending/partial/overdue/default); consolidated repayment/default reports; farmer EMI ledger. **Dependencies:** bank sanction/disbursement/EMI files or API; milk-payment ERP feed. **Risks:** reconciliation accuracy; deduction-authorisation legality (open question); partial-deduction edge cases. **Complexity:** High. **Outcome:** every rupee reconcilable; recovery visible to all roles. **Success indicators:** deduction↔EMI reconciliation match rate; default-ageing accuracy; days-to-reconcile reduced.

## Phase 3 — Advanced Verification
**Features:** full guided purchase with **seller registration + penny-drop verify**, vet examination/valuation/e-sign, **geo-fencing**, ear-tag registry uniqueness, image-hash duplicate detection, transit + cattle insurance (KAVACH), **payment-gate enforcement + seller-payment recommendation**; fraud exception panel + risk flags (shadow). **Dependencies:** insurer + ear-tag registry + payment rails; vet e-sign. **Risks:** registry availability; false-positive fraud flags. **Complexity:** High. **Outcome:** no payment without complete verification; substitution/duplication materially blocked. **Success indicators:** % purchases passing all gates first time; fraud flags raised vs confirmed; seller-payment TAT.

## Phase 4 — Full Lifecycle & Analytics
**Features:** post-purchase 7/30/90-day inspections; milk-yield & reproduction monitoring; insurance-claim workflow with SLA + penal interest; muzzle re-ID asset verification (shadow→assist); ML (renewal propensity, fraud, yield, price/THI); bank/government live dashboards; group enrolment. **Dependencies:** claims volume; model eval suites; muzzle gallery. **Risks:** model quality; scope creep. **Complexity:** High. **Outcome:** asset-and-loan protected across full life; UCDF analytics mature. **Success indicators:** inspection completion rates; claim SLA adherence; model precision in shadow; asset-existence-verified %.

## MVP scope discipline
The MVP deliberately **excludes** money movement, insurance, and advanced fraud tech to de-risk the first launch and prove the workflow + capture. Everything cut from MVP is explicitly parked in Phases 2–4, not dropped.

---

# PART 16 — Wireframe Descriptions (top 10 screens)

Textual wireframes; each is first built as a clickable HTML mock.

**1. Farmer — Guided Cattle Purchase hub.** Top: animal/loan summary card (loan ref, amount, deadline countdown). Body: vertical **stepper** with lock icons — Seller ▸ Inspection ▸ Geo-tag ▸ Ear-tag ▸ Transport+Transit ▸ Arrival ▸ Cattle insurance ▸ Acknowledge. Completed steps green tick, current step highlighted, later steps greyed until prerequisites met. Bottom: big "Continue" button; persistent "Help" (audio) and "Assisted mode" links. Offline banner with "as of" time.

**2. Farmer — Ear-tag capture.** Camera viewfinder (live only, gallery disabled), overlay guide box for the tag; numeric field auto-filled by OCR, editable, masked to 12 digits; inline validation "12 digits required"; on submit, sync-time duplicate-check message. Retake button. Progress dot 4/8.

**3. Farmer — Geo-tag (purchase/destination).** Map pin on current GPS; accuracy indicator; "Inside approved area ✓ / Outside area ✗" chip; capture button disabled until accuracy acceptable; offline caches coordinates with timestamp. Warning if GPS and network location disagree.

**4. Supervisor — Field-verification checklist (offline).** Header: farmer + application id, sync status. Checklist rows with toggle/scan: identity ✓, membership ✓, milk-pouring history (pulled) ✓, existing cattle (photo), shed geo-tag, residence geo-tag. Remarks box. Footer: Approve / Return / Reject (reason mandatory on last two). All actions queue locally.

**5. Vet — Examination & valuation.** Tabbed: Health (BCS slider 1–5, mastitis, dentition/age, vaccination), Reproduction (pregnancy status/PD, parity, last calving), Production (test-milking, daily yield), Valuation (estimated market value, then approved price with ceiling check). "Fitness-for-transport" toggle + e-sign. Save = certificate generated.

**6. DCS — Beneficiary selection / agenda.** Left: interested-members list with milk-supply and repayment-capacity chips. Select checkboxes → "Generate agenda". Right: decision panel per member (Select/Not-select + reason), attach resolution file, "Record board decision". Confirmation summary before commit.

**7. DUSS — Bulk processing dashboard.** Filterable table (status, DCS, date). Bulk-select → actions: Scrutinise, Compute subsidy, Raise deficiency, Generate bank batch. Right drawer shows a single application's docs + validation flags. Maker prepares, checker approves (two-person control visible).

**8. Bank — Sanction-list upload / confirmation.** Download packet button; upload sanction file (drag-drop) → validation preview table (matched / unmatched rows highlighted); maker submits, checker approves; unmatched rows quarantined with resolve action. Success = farmers intimated.

**9. Farmer — Milk-payment deduction ledger.** Summary: loan outstanding, next EMI, "as of yesterday" tag. Table: month, EMI due, deducted from milk, remitted, status (paid/partial/overdue) with colour + text label. Plain-language note on any partial deduction. Grievance shortcut.

**10. UCDF — Command dashboard.** KPI tile row (EOI, selected, pending-by-level, sanctioned, disbursed, purchased, awaiting-verification, seller-pending, insurance-pending, EMI-overdue). Middle: funnel chart EOI→closure + district/DUSS/DCS/bank league table. Right: **exception & fraud panel** (price outliers, duplicate tags, geo-fence breaches, SLA breaches). Every tile drills to underlying rows; export + schedule buttons.

---

# PART 17 — Acceptance Criteria (critical workflows)

**Beneficiary selection.** Given interested members, when the board records decisions, then every member is Selected (→ Application Pending) or Not-Selected (reason mandatory, notified, re-apply path), a resolution file is attached, and the decision is immutably logged with board-member attribution.

**Offline field verification.** Given no connectivity, when a supervisor completes verification with geo-tag and live photos, then all data + media + GPS queue locally, retain EXIF/GPS losslessly, and sync idempotently on reconnect with server-wins conflict resolution and farmer notification; a Return routes to the farmer with a reason and re-starts the farmer's clock.

**Bank submission & sanction (non-integrated).** Given a checked DUSS batch, when the prescribed packet is generated and later a sanction file is uploaded, then matched applications move to Loan Sanctioned/Rejected (reason) and farmers are intimated, while unmatched rows are quarantined and never auto-applied; both maker and checker are recorded.

**Guided purchase gating.** Given a disbursed loan, when the farmer progresses through purchase, then the app enforces step order; rejects a duplicate ear-tag (registry) or a reused-photo hash; requires live-captured media with GPS inside the geo-fence; and enables Seller Payment Pending **only** after vet certification, transit + cattle insurance, and farmer acknowledgment all exist. Any gate failure raises a human-review exception, not a silent block.

**Seller payment.** Given all purchase gates cleared, when payment is recommended, then payout goes only to the penny-drop-verified seller account matching the registered seller; any payee mismatch blocks payment and flags an exception; the payment is reconcilable to farmer↔seller↔animal↔loan.

**Insurance date integrity.** Given cattle movement, when a transit policy is absent, then Transit-in-Progress/payment cannot complete; and a cattle policy's effective date cannot precede arrival confirmation (no backdated/post-purchase insurance).

**EMI reconciliation.** Given a mapped loan and an ERP deduction, when the deduction is ingested, then it reconciles against the due EMI, classifies full/partial/overdue/default per config, notifies the correct roles, and appears on the farmer's ledger with honest freshness; the system only **initiates** (vs tracks) deductions where legal authorisation + consent are recorded.

**Auditability.** Given any approval/edit/rejection anywhere, when it occurs, then an append-only, timestamped, attributable event is written (claim events hash-chained), reconstructable by an auditor read-only.

---

# PART 18 — Open Policy & Operational Questions

These must be resolved by UCDF, the cooperative bank, and government before/at build kickoff. Tagged by owner and whether **blocking**.

1. **Deduction authority — RESOLVED: INITIATE.** The app initiates milk-payment EMI deductions (not just tracks). *Remaining work (Bank + UCDF + Legal):* execute the tri-partite (farmer–society–bank) authorisation + per-loan consent artefact so initiation is legally sound; until a loan's consent is on file it runs track-only. This consent instrument is now the blocking dependency, not the mode decision.
2. **Bank integration mode — RESOLVED: API (primary).** The cooperative bank integrates by API; filedrop/manual is retained as fallback. *Remaining work (Bank):* API contract/specs, auth (mTLS/OAuth), sandbox, and reconciliation fields.
3. **DCS/supervisor acting in-app (blocking, UCDF).** The platform's routine co-op approvals are ERP-side; this programme requires DCS Secretary/Board and Route Supervisor to act **in-app**. Confirm this is an approved programme-specific exception and how it reconciles with the ERP.
4. **Prescribed formats (blocking, Bank + Govt).** Exact bank/government/scheme form templates for packet generation and printing.
5. **Subsidy parameters (blocking, Govt + UCDF).** Subsidy %, government-share split, beneficiary contribution %, price ceilings by breed/region, max cattle per beneficiary.
6. **Aadhaar usage (blocking, Legal).** Is Aadhaar-based verification legally permissible for this programme, and under what mode (OTP/offline/tokenised)? Fallback is member-ID + document proof.
7. **Ear-tag registry authority (non-blocking, UCDF + NDDB).** Which registry (NDDB/INAPH/state) is authoritative for tag uniqueness, and is a lookup API available? Interim: internal registry.
8. **Insurer selection & claim SLA (non-blocking, UCDF + Insurer).** Which insurer(s) for transit + cattle; confirm SLA days and penal-interest terms to encode.
9. **Payment rails for seller/farmer payout (blocking, Bank).** Which rail/API executes seller and DUSS/farmer payouts, and who initiates?
10. **Approved purchase geography (non-blocking, UCDF).** Geo-fence definition — within district/state, radius, or approved-market list.
11. **Delivery & transport deadlines (non-blocking, UCDF).** Cattle-delivery deadline after disbursement and permitted transit time.
12. **Default classification & recovery policy (non-blocking, Bank + UCDF).** Days-past-due buckets, grace period, restructuring rules, and action on cattle death/sale/migration.
13. **Data retention & DPDP consent scope (blocking, Legal + UCDF).** Retention periods for financial/evidence data and the exact consent purposes (incl. `model_improvement`).
14. **Hosting (blocking, UCDF).** Government-approved vs commercial Indian-region cloud.
15. **Assisted-mode operator liability (non-blocking, UCDF).** When a supervisor/secretary operates the app on a farmer's behalf, how is consent and accountability recorded?

---

## Appendix A — Traceability guarantee

Every purchase record links, by foreign key, a single chain: `farmer_id → application_id → sanction/subsidy → animal_id (ear_tag) → seller_id (verified account) → origin_geo + destination_geo → transport record → transit_policy + cattle_policy → seller payout → emi_schedule`. Any missing link blocks the next financial step and appears as an exception. This is the structural embodiment of Product Principle 4.

## Appendix B — Concern separation (Principle 11)

| Concern | Modules | Money-touching? |
|---|---|---|
| Application processing | Scheme, Enrolment, Application, Field verification, DUSS processing | No |
| Financial processing | Subsidy, Disbursement | Yes |
| Cattle verification | Guided purchase, Vet, Geo, Ear-tag | No (gates money) |
| Payment processing | Seller payment, payout rails | Yes |
| Insurance | KAVACH transit + cattle, CLAIMS | Premium/claim |
| EMI tracking | EMI ledger, ERP milk-payment | Yes (recovery) |
| Post-purchase monitoring | Inspections, health, asset-existence | No |

*End of document.*


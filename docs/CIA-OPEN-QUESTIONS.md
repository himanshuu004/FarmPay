# CIA — Open Policy & Operational Questions (decision tracker)

Travels with the repo. Mirrors PRD Part 18. Update the **Status** and **Decided** columns as UCDF / the cooperative bank / government resolve each item. Blocking = must be settled before the dependent CIA phase can ship.

| # | Question | Owner(s) | Blocks | Status | Decision / remaining work |
|---|---|---|---|---|---|
| 1 | Does the app *track* or *initiate* milk-payment EMI deductions? | Bank + UCDF + Legal | CIA-2 | **DECIDED — INITIATE** (2026-07-11) | App initiates deductions. Gated per-loan by a recorded legal authorisation + tri-partite (farmer–society–bank) consent artefact; falls back to track-only without it. **Remaining:** draft & execute the consent instrument; this is now the blocking dependency. |
| 2 | Bank integration mode — API or file/manual? | Bank | CIA-2 | **DECIDED — API primary** (2026-07-11) | Cooperative bank integrates by API; filedrop/manual retained as degraded fallback. **Remaining:** API contract/specs, auth (mTLS/OAuth), sandbox, reconciliation field mapping; build `src/integrations/coopbank/`. |
| 3 | DCS/supervisor acting in-app (vs ERP-side) | UCDF | CIA-1 | **DECIDED — in-app for CIA only** (2026-07-11) | Convention 30 carve-out; input orders stay ERP-side. |
| 4 | Prescribed bank/government/scheme form templates | Bank + Govt | CIA-1 | Open (blocking) | Needed for packet generation + printing. |
| 5 | Subsidy parameters (%, govt split, contribution %, ceilings, max cattle) | Govt + UCDF | CIA-2 | Open (blocking) | Populate `cia_scheme_configs.rules_json`. |
| 6 | Aadhaar usage — legally permissible? mode? | Legal | CIA-1/3 | Open (blocking) | Fallback: member-ID + document proof. |
| 7 | Authoritative ear-tag registry + lookup API (NDDB/INAPH/state) | UCDF + NDDB | CIA-3 | Open | Interim: internal registry uniqueness. |
| 8 | Insurer selection + claim SLA / penal-interest terms | UCDF + Insurer | CIA-3/4 | Open | Encode via KAVACH config. |
| 9 | Payment rails for seller/farmer payout; who initiates | Bank | CIA-3 | Open (blocking) | Penny-drop verify before payout. |
| 10 | Approved purchase geography / geo-fence definition | UCDF | CIA-3 | Open | Radius vs district/state vs approved-market list. |
| 11 | Cattle-delivery + transit deadlines | UCDF | CIA-3 | Open | Config timers. |
| 12 | Default classification + recovery policy | Bank + UCDF | CIA-2 | Open | Ageing buckets, grace, restructuring, death/sale/migration. |
| 13 | Data retention + DPDP consent scope (incl. model_improvement) | Legal + UCDF | CIA-1 | Open (blocking) | Retention periods + consent purposes. |
| 14 | Hosting — govt-approved vs commercial Indian-region cloud | UCDF | CIA-1 | Open (blocking) | — |
| 15 | Assisted-mode operator consent & accountability | UCDF | CIA-1 | Open | When staff operate the app for a farmer. |

_Last updated: 2026-07-11._

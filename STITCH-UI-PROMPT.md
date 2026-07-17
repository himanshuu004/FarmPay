# Google Stitch UI Prompt — Allied KCC Farmer App

Paste the sections below into Stitch as separate generation prompts (one per screen group), reusing the "Design language" block as shared context each time so the screens stay visually consistent. Generate the shell + one screen from each group first to lock the design language, then batch the rest.

## Design language (paste first, keep pinned as context for every subsequent screen)

Design a mobile app UI for Indian dairy farmers in rural Uttarakhand using a smartphone, many on mid-range Android devices, with mixed literacy and Hindi as the primary language. The app is a farm-finance tool: a milk-cooperative passbook, a government agricultural credit-card (KCC) tracker, livestock insurance, and a cattle-purchase loan tracker.

Style direction:
- Warm, trustworthy, "government scheme meets modern fintech" — clean and credible, not flashy or startup-generic. Think: the trust of a bank passbook app, the clarity of a UPI payments app.
- Large, high-contrast tap targets. Icon + label together on every primary action — never icon-only buttons for anything important.
- A calm earthy/green primary palette evoking agriculture and dairy (avoid harsh neon), with a small, consistent set of status colors: green = active/good/paid, amber = pending/due-soon, red = overdue/rejected/action-needed, blue = informational/in-progress. Use these status colors consistently across every screen — a user should recognize "trouble" or "good" at a glance without reading text.
- Card-based layout for financial summaries (limit amounts, milk passbook balance, EMI due) — big legible numbers, small supporting labels, avoid dense tables on the farmer-facing screens.
- Persistent, obvious microphone/voice-input affordance on any data-entry screen (this app is voice-first for logging farm records).
- Bottom tab navigation with 5 tabs: Home, Farm (logbook), KCC (credit), Society (cooperative/passbook), Suraksha (insurance).
- Every screen that shows a status (application, claim, order, EMI) should render as a horizontal step-tracker/timeline, not just a text label — these users trust "where am I in the process" visuals.
- Support both Hindi (Devanagari) and English text rendering cleanly — don't design layouts that break with longer Hindi strings.
- Rounded corners, generous whitespace, minimal shadows — one consistent elevation style throughout, not per-screen improvisation.

---

## Screen-by-screen prompts

### 1. Home (tab shell landing screen)
A farmer home dashboard with, top to bottom: a greeting header with the farmer's name and village; a large "milk passbook" summary card showing this month's milk supplied and payment due, with a "last updated X ago" freshness note; a KCC credit-limit card showing sanctioned limit and a renewal-due badge if applicable; an insurance status card (number of animals insured, next premium due); an advisory tip-of-the-day card (farming/animal-health tip); and, if the farmer is not yet a cooperative-society member, a prominent "Join your society" nudge card. Bottom tab bar with 5 tabs as described in the design language.

### 2. Milk Passbook (Society tab)
A ledger-style screen showing a running list of milk-supply entries by date (quantity, fat%, SNF%, rate, amount), a prominent running-balance/payable total at the top, and a clear "synced as of [timestamp]" indicator since this data comes from an external system on a delay. Include a subtle empty/first-time state for a farmer with no history yet.

### 3. Cooperative Input Order
A form screen for ordering farm inputs (feed, supplements) against a credit meter: show a large circular or bar "70% of your milk payables" limit-used meter at the top, an item picker below (grid of input items with icons, quantity steppers), a running order total that visibly compares against the remaining limit, a note about the ordering window (only open 1st and 3rd week of the month) if currently closed, and a voice-input affordance to add items by speaking.

### 4. Order Status Timeline
A single order's detail screen showing a horizontal step-tracker: Submitted → Secretary Approved → Supervisor Approved → Processing → Dispatched → Received, with the current step highlighted and a "confirm receipt" button that only appears once dispatched.

### 5. KCC Calculator
A friendly, wizard-style calculator: pick your farm activity (dairy/goatery/poultry/fishery icons), enter unit counts (e.g. number of cows), and see a results card with the computed year-1 working-capital limit and a 6-year projection shown as a simple ascending bar/step chart, plus a clear "this is an estimate — apply to get your real sanctioned limit" disclaimer.

### 6. KCC Limit Dashboard
A credit-card-style hero visual showing sanctioned limit, drawn amount, available balance, and renewal-due date, with a transaction/drawdown history list below and a prominent "Apply for drawdown" button for buying animals/equipment against the long-term limit.

### 7. Pashu Suraksha Home (Insurance)
An overview screen listing the farmer's insured animals as cards (photo, ear-tag number, policy status badge, premium due date), a "add new animal" call to action, and a claims-in-progress section if any claim is active, using the step-tracker pattern.

### 8. Animal Enrolment / Tagging flow
A guided multi-step flow: camera-only capture screen (explicitly no gallery-upload option, with a friendly explanation why), ear-tag number entry with OCR-assist, two required photo slots clearly marked, and a review-and-confirm screen before submission.

### 9. Insurance Claim Filing
A step-tracker claim screen: Intimated → Survey Done → Documents Submitted → Under Review → Settled, a document checklist showing exactly 4 required documents with checkmarks as they're uploaded, and a visible SLA countdown ("settlement expected within X days") card.

### 10. Cattle Induction (CIA) — Scheme Browser
A card-list of available cattle-purchase loan-cum-subsidy schemes (subsidy %, max amount, eligibility summary), each tappable into a detail/eligibility-check screen.

### 11. CIA Application Status Tracker
A long step-tracker (this journey has many stages — collapse into a clean vertical stepper, not horizontal, to fit them all) from "Interest Submitted" through selection, verification, bank sanction, disbursement, cattle purchase, to "EMI Active," with the current stage expanded and past/future stages collapsed to single lines.

### 12. CIA EMI Ledger
A passbook-style list of EMI installments with due date, amount, and a status pill (Paid / Due / Overdue / Partial), a running "next EMI due" hero card at top, and a gentle but clear overdue-warning state design (amber → red escalation, never alarming/aggressive).

### 13. CIA EMI Consent screen
A clear, trust-building consent screen explaining that EMI will be automatically deducted from milk payments, requiring explicit farmer acknowledgment (checkbox + signature/confirm action) — this is a legally significant screen, so design it to feel transparent and unhurried, not like a buried terms-and-conditions checkbox.

### 14. Voice Logbook Entry (Farm tab)
A large, friendly microphone-first entry screen for logging a farm/money record by speaking, showing a live waveform or listening animation while recording, then a "here's what we understood" confirm card with editable fields before saving — never auto-save from voice alone.

### 15. Login / MPIN entry
A simple, large-numeral MPIN keypad entry screen (4 digits) with app branding, no password field anywhere, and a "forgot MPIN" path that leads to OTP verification.

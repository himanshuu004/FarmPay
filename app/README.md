# Allied KCC — Farmer App (Expo / React Native)

Ported from the FarmerPay **ROOTS** app (`~/Desktop/farmerpay-platform/farmer-app`,
read-only reference), trimmed to this project's scope. Same stack as the target:
**Expo 54 · Expo Router 6 · React Native 0.81 · expo-secure-store**.

## What's ported (this slice)

- **Auth** — MPIN + OTP + Aadhaar step-up (`login`, `register`, `forgot-password`,
  `aadhaar-verify`). No passwords.
- **Dairy logbook (RECORD)** — the "logbook is the credit file" loop:
  `activity-dairy` (hub) → `dairy-animals` (herd register) →
  `dairy-log-cost` / `dairy-log-revenue` (voice-first) → `dairy-pnl` →
  `dairy-breeding` / `dairy-treatment`; `setup-dairy` / `dairy-onboarding`.
- `lib/` — `api.ts` (generic client), `aadhaarAuth`, `biometric`, `ocrService`,
  `voiceInput`, `offlineQueue`; `components/VoiceInputButton`, `ActivityMoneySection`.

## Wired to the backend

`lib/api.ts` → `API_BASE = http://localhost:3000/api/v1` (our backend's default
port). Every endpoint the app calls is mounted and verified:
`/auth/*`, `/farmer/onboarding/*`, `/location/states`, `/livestock/*`
(the dairyV2 module — same extracted code the ROOTS app was built against; only
the mount prefix changed from `/roots/dairy/v2` → `/livestock`).

## Run it

```bash
cd app
npm install --legacy-peer-deps   # RN 0.81 vs react-native-screens peer drift
# start the backend first:  (repo root) DB_NAME=allied_kcc_dev npm run dev  (or node backend/src/app.js)
npx expo start                   # press i / a / w for iOS / Android / web
```

On a physical device, set `API_BASE` in `lib/api.ts` to your machine's LAN IP
(not `localhost`).

## Verified / not yet verified

- ✅ `npx tsc --noEmit` is clean across the ported app.
- ✅ Every endpoint the app calls exists on the backend (route-mount smoke).
- ⚠️ **Not runtime-verified on a device/simulator** — needs `expo start` + a
  simulator, which can't run in the build sandbox. Drive the login → dairy
  logbook flow against the running backend to confirm.

## Known gaps / follow-ups

- `setup-dairy` calls `GET /livestock/herd/summary` (onboarding prefill) which our
  dairyV2 module doesn't expose — it's `.catch(()=>null)`, so **non-breaking**
  (no prefill). Add the endpoint or drop the call when polishing onboarding.
- Society-wedge, KCC, and Pashu Suraksha screens are **not** ported (no ROOTS
  equivalent) — build them from `prototypes/` next.
- Goatery / poultry / piggery / sheep register+logbook screens: next port batch.
- The full persona tab shell (`(tabs)`) + multi-activity routing was trimmed;
  `index` routes straight to the dairy hub for this slice.

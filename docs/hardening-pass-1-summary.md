# Hardening Pass 1 Summary

Date: 2026-05-21
Branch: `hardening-foundation-pass-1`

## Commits Made

| Commit | Message |
| --- | --- |
| `8267671` | `chore: add baseline hardening notes` |
| `2fee3e6` | `chore: add shared safety and date utilities` |
| `160ddab` | `fix: escape user-controlled rendered content` |
| `e8d07aa` | `fix: standardise local date keys` |
| `deab69e` | `fix: include quantities in usual meal fingerprints` |
| `3b4943a` | `fix: add basic API abuse protection` |
| `c231086` | `fix: make AI entitlement explicit` |
| `6e4d27b` | `fix: align PWA cache versioning` |
| `f656f07` | `chore: add consolidated test scripts` |
| This commit | `docs: summarize hardening pass` |

## Changed Files

- `docs/hardening-baseline.md`
- `docs/hardening-pass-1-summary.md`
- `index.html`
- `js/ai-interpreter.js`
- `js/app.js`
- `js/history.js`
- `js/recipes.js`
- `js/speech.js`
- `js/storage.js`
- `js/utils/safety.js`
- `package-lock.json`
- `package.json`
- `server.js`
- `sw.js`
- `tests/ai-entitlement.spec.cjs`
- `tests/date-utils.spec.cjs`
- `tests/render-safety.spec.cjs`
- `tests/usual-meals.spec.cjs`

## Tests Run

| Command | Status | Notes |
| --- | --- | --- |
| `npm run test:voice` | Pass | Re-run after multiple checkpoints; 8 passed |
| `npm run test:onboarding` | Pass | 6 passed |
| `npm run test:bug-report` | Pass | 7 passed |
| `npm run test:voice:mishearing` | Pass | 28 passed |
| `npm run test:voice:fake-mic` | Pass | 50 passed |
| `npx playwright test tests/render-safety.spec.cjs` | Pass | Confirms malicious-looking rendered values stay inert |
| `npx playwright test tests/date-utils.spec.cjs` | Pass | Confirms local date key behavior around timezone-sensitive dates |
| `npx playwright test tests/usual-meals.spec.cjs` | Pass | Confirms different quantities do not collapse and exact repeats increment use count |
| `node --check server.js` | Pass | Syntax check after API hardening |
| `node --check sw.js` | Pass | Syntax check after PWA cache changes |
| `PORT=3011 NODE_ENV=production node server.js` plus local `/api/interpret` request | Pass | Returned `200 OK` with rate limit headers |
| Initial `npm test` after adding scripts | Fail, then fixed | Parallel browser setup timed out in one bug-report test after 17/18 e2e tests had passed; `test:e2e` now runs with `--workers=1` |
| `npm test` | Pass | Consolidated e2e suite passed, then voice suite passed |
| `npm run test:voice:mass` | Not run | Heavier regression suite left for a dedicated run |
| `npm run test:voice:real-audio` | Not run | Requires real-audio browser/device setup |

## Current Status

- App opens under the existing Playwright harness.
- Existing onboarding, bug-report, voice, mishearing, and fake-mic suites pass.
- Consolidated commands now exist: `npm test`, `npm run test:e2e`, and `npm run test:voice`.
- The fixed-port Playwright suites are kept serial in `npm run test:e2e` to avoid local server contention.

## Risks Fixed

- Added shared safety/date helpers and loaded them before dependent global scripts.
- Escaped obvious user-controlled HTML in profile, meal, ingredient, usual meal, photo estimate, recipe, and history rendering surfaces.
- Standardised local day keys with `localDateKey()` while keeping existing saved localStorage data compatible.
- Updated usual meal fingerprints to include normalized food identity, quantity, serving unit, and macro values instead of ingredient names only.
- Added basic API rate limiting, stricter limits for expensive AI/photo routes, and production-safe upstream error responses.
- Made client-side AI interpretation entitlement explicit instead of treating missing `userPlan` as Pro.
- Aligned app/service-worker cache versioning around `sous-v7` and made install/update failures visible in development.

## Risks Remaining

- Entitlement is still client-side convenience logic only; production-grade AI access control needs server-side identity, subscription state, and quota enforcement.
- Rate limits are in-memory process limits, so multi-instance deployment would need shared storage or provider-level protection.
- There are still many global scripts and localStorage data shapes; future changes should keep test coverage close to storage migrations.
- The full voice mass regression and real-audio suites were not run in this pass.
- Service worker cache coverage remains manually curated; new assets can still be missed if added without updating the cache list.

## Suggested Next Project

Personal meal memory / correct once, remember forever.

# Hardening Baseline

Date: 2026-05-21
Branch: `hardening-foundation-pass-1`

## Current Scripts

| Script | Command |
| --- | --- |
| `start` | `node server.js` |
| `test:onboarding` | `playwright test tests/onboarding.spec.cjs` |
| `test:bug-report` | `playwright test tests/bug-report.spec.cjs` |
| `test:voice` | `playwright test tests/voice-simulation.spec.cjs` |
| `test:voice:mishearing` | `playwright test tests/voice-mishearing-matrix.spec.cjs` |
| `test:voice:mass` | `playwright test tests/voice-mass-regression.spec.js` |
| `test:voice:fake-mic` | `playwright test tests/voice-fake-mic.spec.js` |
| `test:voice:real-audio` | `playwright test --project=real-audio-chrome tests/voice-real-audio.spec.cjs` |

`npm test` and `npm run test:e2e` are not currently defined.

## Tests Run

| Command | Status | Notes |
| --- | --- | --- |
| `npm run test:voice` | Pass | 8 passed |
| `npm run test:onboarding` | Pass | 6 passed |
| `npm run test:bug-report` | Pass | 7 passed |
| `npm run test:voice:mishearing` | Pass | 28 passed |
| `npm run test:voice:fake-mic` | Pass | 50 passed |
| Parallel run of onboarding, bug-report, and voice suites | Invocation failure | Onboarding and bug-report attempted to start the fixed `8732` dev server at the same time and failed with `Address already in use`; rerunning sequentially passed |
| `npm run test:voice:mass` | Not run | Heavier regression suite left for later/final verification |
| `npm run test:voice:real-audio` | Not run | Requires the real-audio Playwright project and device/audio setup |

## Obvious Risks Found

- Some user-controlled fields are inserted through `innerHTML` or generated HTML strings, including the profile name in `renderHome`, meal names in home rows, and ingredient/food names in several rendered review/history surfaces.
- Date keys are mixed between local date formatting and `new Date().toISOString().slice(0, 10)`, which can shift a user's logged day around local midnight.
- Usual meal fingerprints currently use sorted ingredient names only, so the same ingredients with different quantities can collapse into one usual meal.
- API routes do not have explicit rate limiting, and upstream error detail can be returned to clients.
- AI interpretation entitlement defaults a missing `userPlan` to `pro`, which is too permissive for production behavior.
- Service worker cache versioning is split between `sw.js` and app script query versions, and install cache failures are swallowed.
- There are no consolidated `npm test` or `npm run test:e2e` scripts yet.
- Playwright suites share a fixed local dev server port, so running multiple suites in parallel can cause port contention.

## Assumptions Made

- Preserve the vanilla global-script architecture.
- Keep existing localStorage shapes compatible with saved user data.
- Keep voice logging, AI fallback, barcode lookup, photo estimates, usual meals, repeat meals, profile, history, and PWA behavior intact.
- Do not build authentication, subscriptions, or Stripe in this pass.
- Treat the existing Playwright voice harness as the main regression signal for voice behavior.

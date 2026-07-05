# Rightmove Companion — project context for AI assistants

Use this file when discussing, planning, or implementing changes to this codebase in Claude (or any other assistant). It is a handoff brief, not user-facing documentation.

---

## What this is

**Rightmove Companion** is a **Chrome Manifest V3 extension** that overlays a buy-to-let investment analyser on **Rightmove for-sale property pages** (`rightmove.co.uk/properties/*` and `property-for-sale/*`).

It is **local-first**: settings, per-page drafts, and saved deals live in `chrome.storage.local`. No backend, no accounts, no telemetry.

**Repo:** https://github.com/jzhen648-creator/rightmove-companion  
**License:** MIT  
**Version:** 1.0.0 (also in `public/manifest.json`)

---

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 18 + TypeScript, mounted in **Shadow DOM** (style isolation from Rightmove) |
| Build | Vite 5 — content script as IIFE bundle; service worker built in a post-plugin |
| Extension | Manifest V3, `storage` permission, host permissions for Rightmove / Zoopla / PrimeLocation |
| Tests | Vitest (node environment), 67+ unit tests in `src/lib/__tests__/` |
| Lint | ESLint 9 flat config |
| Typecheck | `tsc --noEmit -p tsconfig.check.json` (scoped to `src/` only) |

---

## Commands

```powershell
npm.cmd install
npm.cmd run dev          # watch build → reload extension + refresh tab
npm.cmd run build        # local dev build (may include localhost + optional LLM proxy)
npm.cmd run build:store  # Chrome Web Store build (strips localhost, no LLM URL)
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

Load unpacked from the `dist/` folder in `chrome://extensions`.

---

## Architecture (high level)

```
Rightmove page
    │
    ▼
content script (src/content/main.tsx)
    │  Shadow DOM host #rmia-extension-host
    ▼
App.tsx — tabs: Calculator | Rent | Saved
    │
    ├── parseRightmovePage()        ← DOM / PAGE_MODEL on current tab
    ├── extractListingRentProfile() ← structured listing for rent matching
    ├── calculateInvestmentMetrics()← pure math in lib/
    └── fetchRentalsViaBackground() ← chrome.runtime.sendMessage
                │
                ▼
        service worker (src/background/service-worker.ts)
                │
                ├── fetch Rightmove to-rent search HTML
                ├── fetch Zoopla to-rent search HTML (town slug inferred from listing)
                ├── fetch PrimeLocation to-rent search HTML (outward postcode)
                ├── parse → merge → filter room-shares → filter wrong postcode area
                ├── deriveMarketRentalBand() — percentile band from comps
                └── optional callLlmProxy() — dev-only, baked URL via VITE_RMIA_LLM_PROXY_URL
```

**Key design choice:** listing parsing runs in the **content script** (same-origin DOM access). Cross-site rent comparables run in the **background service worker** (needs `host_permissions`).

---

## Directory map

```
public/manifest.json          MV3 manifest (content_scripts, background, permissions)
src/content/
  main.tsx                    Shadow DOM mount
  App.tsx                     Main UI (~1400 lines): tabs, state, wiring
  fieldMeta.ts                Form field definitions
  stateHelpers.ts             Merge parsed page data + user inputs + drafts
  components/AnalyzerWidgets.tsx
  hooks/useRightmoveParseRefresh.ts   Re-parse after async Rightmove widgets load
src/background/
  service-worker.ts           fetchRentals message handler, multi-portal HTML fetch
src/lib/                      Pure logic — no React, mostly unit-tested
  types.ts                    Shared types (start here for data shapes)
  pageParser.ts               Asking price, service charge, ground rent, lease hints
  listingProfile.ts           ListingRentProfile extraction from page
  rentEstimate.ts             On-page rent widget + location hints for background search
  rentalSearchHtmlParser.ts   JSON-in-script parsing, room-share filter, comp normalisation
  rentalLettingsSearchParse.ts Rightmove lettings search HTML parser
  portalLettingsHtmlParse.ts  Zoopla + PrimeLocation parsers
  mergeRentComparables.ts     Dedupe/merge comps from multiple sources
  rentComparableLocality.ts   Drop comps in wrong UK postcode area
  marketRentalBand.ts         Percentile rental band + yield floor adjustment
  calculations.ts             Yield, mortgage, cash flow, cash-on-cash
  investorScore.ts            Score + verdict band (skip → exceptional)
  stampDuty.ts                England/NI SDLT bands
  deposit.ts                  Deposit amount ↔ percent sync
  storage.ts                  chrome.storage.local wrapper
  savedDealsCodec.ts          JSON import/export validation
  defaults.ts                 DEFAULT_INPUTS
vite.config.ts                Content bundle + post-build SW bundle + store manifest strip
```

---

## Core types (`src/lib/types.ts`)

- **`InvestmentInputs`** — user-editable calculator fields (price, rent, deposit, mortgage, SDLT structure, operating costs).
- **`InvestmentResults`** — computed metrics + `investorScore`, `verdict`, stress tests.
- **`RightmovePageInfo`** — parsed listing snapshot (price, address, postcode, beds, parsed fields with notes).
- **`ListingRentProfile`** — structured listing used for rent benchmarking (headline, postcode, beds, type, floor area, etc.).
- **`RentComparable`** — parsed letting card (price, description, url, beds, propertyType, floorAreaSqFt, source).
- **`RentalAssessment`** — min/max/best monthly rent + rationale; source `market-data` or `llm`.
- **`DealRecord`** — saved deal with inputs, results, notes, savedAt.

---

## Rent comparable pipeline (important)

When the user opens the **Rent** tab (or rent is needed), the content script calls `fetchRentalsViaBackground` with postcode, beds, `ListingRentProfile`, and optional `LettingsSearchLocationHint`.

The service worker:

1. Builds search URLs for **Rightmove**, **Zoopla** (if town slug inferred), **PrimeLocation** (if outward postcode known).
2. `fetch()` public search HTML (no credentials).
3. Parses each source with source-specific parsers (limits in `rentComparableLimits.ts`).
4. **`mergeRentComparablesFromSources`** — dedupe by URL/price/description.
5. **`filterWholePropertyLettingComparables`** — exclude room/house-share ads (`isLikelyRoomOrHouseShareLetting`).
6. **`filterComparablesToListingPostcodeArea`** — drop comps whose visible postcode is a different UK postcode **area** than the listing.
7. **`deriveMarketRentalBand`** — percentile band; may apply yield floor from asking price.
8. Optionally **`callLlmProxy`** if `VITE_RMIA_LLM_PROXY_URL` is set (local builds only; store build omits this).

On-page rent (no background fetch): `rentEstimate.ts` reads Rightmove's own rental estimate widget / `PAGE_MODEL` JSON when present.

---

## Storage keys (`src/lib/storage.ts`)

| Key | Purpose |
|-----|---------|
| `rmia_default_settings` | User default calculator inputs |
| `rmia_page_drafts` | Per-URL draft inputs |
| `rmia_saved_deals` | Up to 50 saved deals |
| `rmia_panel_open` | Panel collapsed state |

Writes for user actions throw on failure; draft/panel writes fail silently on extension context invalidation.

---

## UI tabs (`App.tsx`)

1. **Calculator** — finance inputs, SDLT, operating costs, live metrics, investor score verdict.
2. **Rent** — on-page estimate, background comparables, market band, optional LLM assessment (dev).
3. **Saved** — save/load deals, notes, search, sort, JSON export/import.

Property goals: `buy-to-let` vs `standard-purchase` (affects mortgage type defaults via `propertyGoals.ts`).

---

## Build modes

| Mode | Command | Notes |
|------|---------|-------|
| Local | `npm run build` | May include `localhost` host permission + `__RMIA_LLM_PROXY_URL__` in SW |
| Store | `npm run build:store` | Strips localhost from `dist/manifest.json`; no LLM proxy URL |

`.env.example` documents optional `VITE_RMIA_LLM_PROXY_URL` for local LLM proxy experiments.

---

## Testing philosophy

- Tests live beside logic in `src/lib/__tests__/`.
- Prefer testing **pure functions** (parsers, calculations, filters, codecs).
- No browser/E2E tests yet — DOM parsing tested via HTML fixture strings.
- Run `npm test` before suggesting changes; CI runs lint + typecheck + test + both builds.

---

## Coding conventions (follow these)

1. **Keep investment math and parsing out of React** — `src/lib/` is the place for logic.
2. **Fail gracefully** — parsers return null/empty; UI always allows manual override.
3. **Minimise diff scope** — match existing naming, import style, and comment density.
4. **No over-engineering** — no new abstractions for one-off helpers.
5. **Chrome extension realities** — handle `extension context invalidated` after reload; Shadow DOM for CSS isolation.
6. **UK-specific** — postcodes (`ukPostcodeOutward.ts`), SDLT England/NI only, £ formatting.

---

## Chrome Web Store status

Prepared but not necessarily published:

- Privacy policy: `docs/privacy.html` (host via GitHub Pages `/docs`) + `PRIVACY_POLICY.md`
- Store build: `npm run build:store` → zip contents of `dist/`
- Permission justifications documented in README
- **Risk:** background fetches of Zoopla/PrimeLocation/Rightmove search HTML may face store review scrutiny (scraping / single-purpose policy)

Missing for polish: toolbar `action`/popup, automated version sync between `package.json` and manifest.

---

## CI

`.github/workflows/ci.yml` on push/PR to `main`/`master`:

`npm ci` → lint → typecheck → test → build → build:store

---

## Current work in progress (local, may be uncommitted)

Recent feature work on **rent comparable quality**:

- `rentComparableLocality.ts` — postcode-area filtering for comps
- `roomShareFilter` tests — whole-property vs room-share filtering
- Updates across `marketRentalBand`, `mergeRentComparables`, `portalLettingsHtmlParse`, `rentalSearchHtmlParser`, `listingProfile`, `types`, `ukPostcodeOutward`
- Infra added: GitHub Actions CI, `typecheck` script, `tsconfig.check.json`, package metadata, privacy policy contact links
- Removed ineffective `User-Agent` header from service worker fetches (forbidden header in extension `fetch`)

**Ensure `rentComparableLocality.ts` and its tests are committed** — the service worker imports them; a clean clone breaks without them.

---

## Common tasks for assistants

| Task | Where to look |
|------|----------------|
| Fix price not parsing | `pageParser.ts`, `useRightmoveParseRefresh.ts` |
| Rent comps empty/wrong area | `service-worker.ts`, `rentComparableLocality.ts`, `rentalSearchHtmlParser.ts` |
| Wrong yield/score | `calculations.ts`, `investorScore.ts` |
| SDLT wrong | `stampDuty.ts`, `fieldMeta.ts` residence options |
| Storage/import issues | `storage.ts`, `savedDealsCodec.ts` |
| New form field | `types.ts` → `defaults.ts` → `fieldMeta.ts` → `stateHelpers.ts` → `App.tsx` |
| Portal HTML layout changed | relevant parser in `portalLettingsHtmlParse.ts` or `rentalLettingsSearchParse.ts`; add/extend fixture test |

---

## What not to do

- Do not add a backend or phone-home telemetry without explicit user request.
- Do not commit `.env` or API keys.
- Do not use `vite build` as a substitute for `tsc` — type errors can exist in `dist` otherwise.
- Do not assume `User-Agent` can be set on extension `fetch()` — it is stripped by the browser.
- Do not break the Shadow DOM pattern — Rightmove's CSS will break the overlay.
- Do not remove graceful fallbacks — Rightmove DOM changes frequently.

---

## Suggested opening prompt for Claude

> I'm working on **Rightmove Companion**, a Chrome MV3 extension (React + TypeScript + Vite) that overlays buy-to-let analysis on Rightmove for-sale pages. Read the attached `PROJECT_CONTEXT.md` for architecture and conventions. [Describe your specific question or task here.]

Attach this file plus any specific source files relevant to the task.

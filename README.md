# Rightmove Companion

This is a local Chrome extension prototype built with React, TypeScript, and Manifest V3.

## What it does

- shows an overlay on Rightmove for-sale property pages
- parses **asking price**, **rent estimates** (listing widget and same-origin fallback search), **service charge**, **ground rent**, **floor area**, and **lease hints** where the page exposes them
- lets you adjust finance, SDLT (England / Northern Ireland bands in code), and recurring costs
- calculates yield, mortgage payment, cash flow, cash invested, and cash-on-cash return
- scores buy-to-let deals with a simple verdict band
- saves **defaults**, **per-page drafts**, and **saved deals** (with optional **notes**) in `chrome.storage.local`
- **export / import** saved deals as JSON for backup or moving machines
- **search and sort** on the Saved tab

## First terminal command

On Windows, PowerShell may treat `npm` as a script; if so, call it explicitly:

```powershell
npm.cmd install
```

## Local run steps

1. Install dependencies:

```powershell
npm.cmd install
```

2. Build the extension:

```powershell
npm.cmd run build
```

For **Chrome Web Store** uploads, use the store build (drops `localhost` from `manifest.json` and omits a baked-in LLM proxy URL):

```powershell
npm.cmd run build:store
```

3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the `dist` folder inside this project.
7. Open a Rightmove property page such as a sale listing page.
8. The overlay should appear on the right side of the page.

## While developing

If you want the build to keep updating while you edit code, run:

```powershell
npm.cmd run dev
```

Then, after each rebuild:

1. Go back to `chrome://extensions`
2. Click the extension's **Reload** button
3. Refresh the Rightmove tab

## Chrome Web Store (publish)

1. **Privacy policy URL** — Use `docs/privacy.html` (static HTML). Push the repo to GitHub, then **Settings → Pages → Build and deployment → Branch**, choose **`main`** (or default branch) and **`/docs`**, Save. After a minute your policy URL is:

   `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/privacy.html`

   Replace `YOUR_GITHUB_USERNAME` and `YOUR_REPO_NAME`. Paste that full **HTTPS** link into the store **Privacy practices** field. Edit `docs/privacy.html` **Contact** if you want a specific email or issues link before enabling Pages.

2. **Build the upload zip** — Run `npm.cmd run build:store`. Zip **everything inside** the `dist` folder (so `manifest.json` is at the root of the zip, not inside a nested `dist` folder).

3. **Developer account** — Register in [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and pay Google’s one-time developer fee.

4. **New item** — Upload the zip, set name/description/screenshots, and complete **permission justifications**:
   - **storage** — local defaults, per-page drafts, saved listings, notes, and import/export.
   - **rightmove.co.uk** — inject the overlay and read listing fields on matched for-sale URLs.
   - **zoopla.co.uk** / **primelocation.com** — background fetches of **public** lettings search pages for rent comparable estimates.

5. **Listing copy** — State clearly that figures are **indicative** and **not financial or legal advice**.

## Project files

- `public/manifest.json`: the Chrome extension manifest
- `src/content/main.tsx`: mounts the React app into the Rightmove page (Shadow DOM)
- `src/content/App.tsx`: panel shell, tabs, and wiring
- `src/content/fieldMeta.ts`: finance / cost field definitions
- `src/content/stateHelpers.ts`: merging page data with inputs and drafts
- `src/content/components/AnalyzerWidgets.tsx`: reusable form and result widgets
- `src/content/hooks/useRightmoveParseRefresh.ts`: re-parses after async Rightmove content loads
- `src/lib/calculations.ts`: investment math
- `src/lib/pageParser.ts`: price and listing parsing (scoped text scan before full-page fallback)
- `src/lib/rentEstimate.ts`: rent widget and nearby-rent fallback
- `src/lib/storage.ts`: Chrome storage with explicit write failures for user actions
- `src/lib/savedDealsCodec.ts`: JSON import validation and export serialisation
- `src/lib/defaults.ts`: sensible starting values
- `src/lib/types.ts`: shared TypeScript types

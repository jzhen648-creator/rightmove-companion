# Privacy policy — Rightmove Companion

**Published HTML copy:** `docs/privacy.html` — host with GitHub Pages (see README **Privacy policy URL**) and paste that **HTTPS** link under Chrome Web Store **Privacy practices**.

**Effective date:** May 2026

## Summary

Rightmove Companion runs **inside your browser**. It stores your settings and saved data **locally** on your device. It reads property listing pages you open and may **fetch public listing pages** on other property sites to estimate rent comparables. It does **not** sell your data.

## Data stored on your device

The extension uses `chrome.storage.local` to keep:

- default calculator inputs  
- drafts for the listing page you are viewing  
- saved properties and optional notes  
- simple UI preferences (for example whether the panel was open)  

This data **stays on your computer** unless you use **export** yourself (for example to save a JSON backup file).

## Data the extension accesses

- **Rightmove** pages you visit that match the extension’s content script (for-sale property URLs). The extension reads the visible page to fill in price, address, and similar fields where the page exposes them.
- **Zoopla** and **PrimeLocation** (only as **network requests** from the extension’s background service worker) to gather **public** lettings search HTML used for rent comparable ranges. The extension does not read your accounts on those sites.

## Optional developer feature (not in store builds)

If you build the extension yourself with a local **LLM proxy** URL, that proxy is **your** server. The store build (`npm run build:store`) does **not** include localhost access or a baked-in proxy URL.

## Contact

Questions about this policy: use the contact option listed on the Rightmove Companion Chrome Web Store page, or open an issue at [github.com/jzhen648-creator/rightmove-companion/issues](https://github.com/jzhen648-creator/rightmove-companion/issues).

## Changes

Material updates to what the extension collects or sends will be noted here.

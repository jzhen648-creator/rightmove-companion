/**
 * HM Land Registry Price Paid data — pure logic.
 *
 * Fetching happens in the background service worker (needs host permission
 * for https://landregistry.data.gov.uk/*). Everything in this file is a pure
 * function so it can be unit-tested with JSON fixtures, matching the pattern
 * used by the rental HTML parsers.
 *
 * Endpoint (no auth, JSON):
 *   https://landregistry.data.gov.uk/data/ppi/transaction-record.json
 *     ?propertyAddress.postcode={POSTCODE}&_pageSize=200
 *
 * Coverage: England & Wales only, sales since 1995, updated monthly.
 * Scotland / NI postcodes return an empty result — treat as "no data".
 */

import type {
  ListingAddressHint,
  PostcodeSalesSummary,
  SoldPriceHistory,
  SoldPropertyType,
  SoldTransaction,
} from "./types";

const PRICE_PAID_ENDPOINT =
  "https://landregistry.data.gov.uk/data/ppi/transaction-record.json";

export const PRICE_PAID_DEFAULT_PAGE_SIZE = 200;

export function buildPricePaidUrl(
  postcode: string,
  pageSize: number = PRICE_PAID_DEFAULT_PAGE_SIZE,
): string | null {
  const normalised = normalisePostcode(postcode);
  if (!normalised) return null;
  const params = new URLSearchParams({
    "propertyAddress.postcode": normalised,
    _pageSize: String(pageSize),
  });
  return `${PRICE_PAID_ENDPOINT}?${params.toString()}`;
}

/** Uppercase, single internal space ("de23  8pl" → "DE23 8PL"). */
export function normalisePostcode(postcode: string | null | undefined): string | null {
  if (!postcode) return null;
  const compact = postcode.replace(/\s+/g, "").toUpperCase();
  // Outward (2-4 chars) + inward (digit + 2 letters). Loose on purpose —
  // the API is the source of truth; we only guard against garbage.
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/**
 * Land Registry returns dates like "Fri, 14 Jun 2024". Parse explicitly
 * rather than trusting Date() across runtimes/locales. Returns null on
 * anything unrecognised.
 */
export function parseLandRegistryDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = MONTHS[match[2].toLowerCase()];
  const year = match[3];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

/** Pull the trailing slug from a Land Registry URI, e.g. ".../def/common/terraced" → "terraced". */
function uriSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const idx = value.lastIndexOf("/");
  return idx >= 0 ? value.slice(idx + 1).toLowerCase() : value.toLowerCase();
}

const PROPERTY_TYPE_BY_SLUG: Record<string, SoldPropertyType> = {
  detached: "detached",
  "semi-detached": "semi-detached",
  terraced: "terraced",
  "flat-maisonette": "flat-maisonette",
  otherpropertytype: "other",
};

function parsePropertyType(item: Record<string, unknown>): SoldPropertyType | null {
  const about = (item.propertyType as Record<string, unknown> | undefined)?._about;
  const slug = uriSlug(about);
  return slug ? (PROPERTY_TYPE_BY_SLUG[slug] ?? null) : null;
}

function parseEstateType(item: Record<string, unknown>): "freehold" | "leasehold" | null {
  const about = (item.estateType as Record<string, unknown> | undefined)?._about;
  const slug = uriSlug(about);
  if (slug === "freehold" || slug === "leasehold") return slug;
  return null;
}

function parseTransactionCategory(item: Record<string, unknown>): boolean {
  const about = (item.transactionCategory as Record<string, unknown> | undefined)?._about;
  const slug = uriSlug(about);
  // "standardPricePaidTransaction" (category A) vs
  // "additionalPricePaidTransaction" (category B). Unknown → assume standard
  // so genuinely new categories don't silently vanish from comps.
  if (!slug) return true;
  return slug === "standardpricepaidtransaction";
}

/**
 * Parse the raw JSON body from the Price Paid endpoint into SoldTransactions,
 * newest first. Returns [] for anything malformed — never throws.
 */
export function parsePricePaidResponse(raw: unknown): SoldTransaction[] {
  try {
    const items = (raw as { result?: { items?: unknown[] } })?.result?.items;
    if (!Array.isArray(items)) return [];

    const transactions: SoldTransaction[] = [];
    for (const entry of items) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;

      const pricePaid = item.pricePaid;
      const date = parseLandRegistryDate(item.transactionDate);
      if (typeof pricePaid !== "number" || !Number.isFinite(pricePaid) || pricePaid <= 0)
        continue;
      if (!date) continue;

      const address = (item.propertyAddress ?? {}) as Record<string, unknown>;
      const postcode = normalisePostcode(
        typeof address.postcode === "string" ? address.postcode : null,
      );
      if (!postcode) continue;

      transactions.push({
        pricePaid,
        date,
        propertyType: parsePropertyType(item),
        estateType: parseEstateType(item),
        newBuild: item.newBuild === true,
        isStandardTransaction: parseTransactionCategory(item),
        paon: typeof address.paon === "string" ? address.paon : null,
        saon: typeof address.saon === "string" ? address.saon : null,
        street: typeof address.street === "string" ? address.street : null,
        postcode,
      });
    }

    transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return transactions;
  } catch {
    return [];
  }
}

function normaliseAddressToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Conservative exact-address matching. A false match (showing the wrong
 * property's sale history) is worse than no match, so the rules are strict:
 *  - hint PAON must be present and equal the transaction PAON, and
 *  - if the hint has a SAON (flat), the transaction SAON must equal it;
 *    if the hint has no SAON but the transaction does, it is a different
 *    unit in the same building → no match.
 */
export function matchListingTransactions(
  transactions: SoldTransaction[],
  hint: ListingAddressHint | null | undefined,
): SoldTransaction[] {
  const hintPaon = normaliseAddressToken(hint?.paon);
  if (!hintPaon) return [];
  const hintSaon = normaliseAddressToken(hint?.saon);

  return transactions.filter((t) => {
    const paon = normaliseAddressToken(t.paon);
    if (paon !== hintPaon) return false;
    const saon = normaliseAddressToken(t.saon);
    if (hintSaon) return saon === hintSaon;
    return saon === null;
  });
}

export interface SummariseOptions {
  /** Listing's property type; when set and matching sales exist, the median is type-filtered. */
  propertyType?: SoldPropertyType | null;
  /** Recency window for the median. Default 5. */
  recencyYears?: number;
  /** Injectable clock for tests. Default Date.now(). */
  now?: number;
}

export function summarisePostcodeSales(
  transactions: SoldTransaction[],
  options: SummariseOptions = {},
): PostcodeSalesSummary | null {
  const standard = transactions.filter((t) => t.isStandardTransaction);
  if (standard.length === 0) return null;

  const recencyYears = options.recencyYears ?? 5;
  const now = options.now ?? Date.now();
  const cutoff = isoDateYearsBefore(now, recencyYears);

  let pool = standard.filter((t) => t.date >= cutoff);

  let filteredByPropertyType = false;
  if (options.propertyType) {
    const typed = pool.filter((t) => t.propertyType === options.propertyType);
    if (typed.length > 0) {
      pool = typed;
      filteredByPropertyType = true;
    }
  }

  return {
    sampleSize: pool.length,
    medianPrice: median(pool.map((t) => t.pricePaid)),
    latestSaleDate: standard.length > 0 ? standard[0].date : null,
    periodYears: recencyYears,
    totalSince1995: standard.length,
    filteredByPropertyType,
  };
}

function isoDateYearsBefore(nowMs: number, years: number): string {
  const d = new Date(nowMs);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Annualised growth implied by asking price vs a past sale:
 *   (asking / sold)^(1 / years) - 1
 * Returns null when the holding period is under 1 year (annualising short
 * periods produces misleading numbers) or inputs are invalid.
 */
export function deriveImpliedAnnualGrowth(
  askingPrice: number,
  soldPrice: number,
  soldDateIso: string,
  now: number = Date.now(),
): number | null {
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) return null;
  if (!Number.isFinite(soldPrice) || soldPrice <= 0) return null;
  const soldMs = Date.parse(`${soldDateIso}T00:00:00Z`);
  if (Number.isNaN(soldMs)) return null;
  const years = (now - soldMs) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) return null;
  return Math.pow(askingPrice / soldPrice, 1 / years) - 1;
}

export interface DerivePricePaidInsightsArgs {
  rawResponse: unknown;
  addressHint?: ListingAddressHint | null;
  propertyType?: SoldPropertyType | null;
  askingPrice?: number | null;
  now?: number;
}

/**
 * Top-level composition used by the service worker: raw endpoint JSON in,
 * SoldPriceHistory out. Never throws; a malformed response yields an empty
 * history the UI can simply not render.
 */
export function derivePricePaidInsights(args: DerivePricePaidInsightsArgs): SoldPriceHistory {
  const now = args.now ?? Date.now();
  const transactions = parsePricePaidResponse(args.rawResponse);
  const propertyTransactions = matchListingTransactions(transactions, args.addressHint);
  const postcodeSummary = summarisePostcodeSales(transactions, {
    propertyType: args.propertyType,
    now,
  });

  let impliedAnnualGrowthVsAsking: number | null = null;
  const latest = propertyTransactions[0];
  if (latest && args.askingPrice) {
    impliedAnnualGrowthVsAsking = deriveImpliedAnnualGrowth(
      args.askingPrice,
      latest.pricePaid,
      latest.date,
      now,
    );
  }

  return {
    propertyTransactions,
    postcodeSummary,
    impliedAnnualGrowthVsAsking,
    fetchedAt: now,
    source: "hm-land-registry",
  };
}

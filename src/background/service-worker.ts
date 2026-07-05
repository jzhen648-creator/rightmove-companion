/// <reference types="chrome" />

import { inferZooplaTownSlug } from "../lib/inferZooplaTownSlug";
import { mergeRentComparablesFromSources } from "../lib/mergeRentComparables";
import { deriveMarketRentalBand } from "../lib/marketRentalBand";
import {
  parsePrimeLocationToRentSearchHtml,
  parseZooplaToRentSearchHtml,
} from "../lib/portalLettingsHtmlParse";
import { parseLettingsSearchResultHtml } from "../lib/rentalLettingsSearchParse";
import { filterComparablesToListingPostcodeArea } from "../lib/rentComparableLocality";
import { filterWholePropertyLettingComparables } from "../lib/rentalSearchHtmlParser";
import { buildPricePaidUrl, derivePricePaidInsights } from "../lib/pricePaid";
import type { LettingsSearchLocationHint } from "../lib/rentEstimate";
import type {
  ListingAddressHint,
  ListingRentProfile,
  RentalAssessment,
  RentComparable,
  SoldPriceHistory,
  SoldPropertyType,
} from "../lib/types";
import {
  RENT_COMP_MERGED_MAX,
  RENT_COMP_PRIMELOCATION_PARSE_MAX,
  RENT_COMP_RM_PARSE_MAX,
  RENT_COMP_ZOOPLA_PARSE_MAX,
} from "../lib/rentComparableLimits";
import { outwardPostcodeDistrict } from "../lib/ukPostcodeOutward";

declare const __RMIA_LLM_PROXY_URL__: string;

type FetchRentalsMessage = {
  action: "fetchRentals";
  postcode: string;
  beds: number;
  listing: ListingRentProfile;
  lettingsLocationHint?: LettingsSearchLocationHint | null;
};

type FetchSoldPricesMessage = {
  action: "fetchSoldPrices";
  postcode: string;
  addressHint?: ListingAddressHint | null;
  propertyType?: SoldPropertyType | null;
  askingPrice?: number | null;
};

function buildToLetSearchUrl(
  postcode: string,
  beds: number,
  hint: LettingsSearchLocationHint | null | undefined,
): string {
  const base = "https://www.rightmove.co.uk/property-to-rent/find.html";
  const params = new URLSearchParams();

  params.set("searchType", "RENT");
  params.set("includeLetAgreed", "false");
  params.set("sortType", "6");
  params.set("index", "0");

  if (hint?.kind === "identifier") {
    params.set("locationIdentifier", hint.value);
    params.set("searchLocation", "");
    params.set("radius", "2.0");
  } else {
    const searchLocation = (hint?.kind === "text" ? hint.value : postcode).trim();
    params.set("searchLocation", searchLocation);
  }

  if (beds > 0) {
    params.set("minBedrooms", String(beds));
    params.set("maxBedrooms", String(beds));
  }

  return `${base}?${params.toString()}`;
}

function buildZooplaToRentSearchUrl(slug: string, beds: number): string {
  const path = `https://www.zoopla.co.uk/to-rent/property/${encodeURIComponent(slug)}/`;
  if (beds <= 0) {
    return path;
  }
  const q = new URLSearchParams({
    beds_min: String(beds),
    beds_max: String(beds),
  });
  return `${path}?${q.toString()}`;
}

function buildPrimeLocationToRentSearchUrl(outward: string, beds: number): string {
  const o = outward.toLowerCase();
  if (beds > 0 && beds <= 10) {
    return `https://www.primelocation.com/to-rent/property/${beds}-bedrooms/${o}/`;
  }
  return `https://www.primelocation.com/to-rent/property/${o}/`;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      console.debug("[RMIA] fetch", url, "HTTP", response.status);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.debug("[RMIA] fetch failed", url, error);
    return null;
  }
}

function tagRightmoveComparables(items: RentComparable[]): RentComparable[] {
  return items.map((row) => ({
    ...row,
    source:
      row.source && !row.source.includes("embedded")
        ? `Rightmove (${row.source})`
        : "Rightmove",
  }));
}

function parseLlmAssessmentPayload(raw: unknown): RentalAssessment | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const minMonthly = Number(record.minMonthly);
  const maxMonthly = Number(record.maxMonthly);
  const bestEstimateMonthly = Number(record.bestEstimateMonthly);
  const rationaleRaw = record.rationale;
  const rationale = Array.isArray(rationaleRaw)
    ? rationaleRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  if (
    !Number.isFinite(minMonthly) ||
    !Number.isFinite(maxMonthly) ||
    !Number.isFinite(bestEstimateMonthly)
  ) {
    return null;
  }

  return {
    minMonthly,
    maxMonthly,
    bestEstimateMonthly,
    rationale: rationale.length ? rationale : ["AI proxy returned no rationale."],
    source: "llm" as const,
    usedComparablesCount: Number(record.usedComparablesCount) || 0,
  };
}

async function callLlmProxy(
  listing: ListingRentProfile,
  comparables: RentComparable[],
  market: RentalAssessment | null,
): Promise<RentalAssessment | null> {
  const proxyUrl = (typeof __RMIA_LLM_PROXY_URL__ === "string" ? __RMIA_LLM_PROXY_URL__ : "").trim();
  if (!proxyUrl || comparables.length === 0) {
    return null;
  }

  try {
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing, comparables, market }),
    });

    if (!response.ok) {
      console.debug("[RMIA] LLM proxy HTTP", response.status);
      return null;
    }

    const body = (await response.json()) as unknown;
    if (body && typeof body === "object" && "assessment" in (body as object)) {
      return parseLlmAssessmentPayload((body as { assessment: unknown }).assessment);
    }
    return parseLlmAssessmentPayload(body);
  } catch (error) {
    console.debug("[RMIA] LLM proxy error", error);
    return null;
  }
}

async function fetchPricePaidJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      console.debug("[RMIA] price paid fetch HTTP", response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.debug("[RMIA] price paid fetch failed", error);
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function handleFetchSoldPrices(
  message: FetchSoldPricesMessage,
): Promise<SoldPriceHistory | null> {
  const url = buildPricePaidUrl(message.postcode.trim());
  if (!url) {
    return null;
  }

  const raw = await fetchPricePaidJson(url);
  if (raw === null) {
    return null;
  }

  try {
    return derivePricePaidInsights({
      rawResponse: raw,
      addressHint: message.addressHint ?? null,
      propertyType: message.propertyType ?? null,
      askingPrice: message.askingPrice ?? null,
    });
  } catch (error) {
    console.debug("[RMIA] price paid parse error", error);
    return null;
  }
}

async function handleFetchRentals(
  message: FetchRentalsMessage,
): Promise<{
  comparables: RentComparable[];
  locationUsed: string;
  market: RentalAssessment | null;
  llm: RentalAssessment | null;
  error?: string;
}> {
  const postcode = message.postcode.trim();
  const beds = Math.max(0, Math.floor(message.beds));
  const listing = message.listing;
  const hint = message.lettingsLocationHint ?? null;

  if (!postcode) {
    return {
      comparables: [],
      locationUsed: "",
      market: null,
      llm: null,
      error: "Missing postcode.",
    };
  }

  const rmUrl = buildToLetSearchUrl(postcode, beds, hint);
  const outward = outwardPostcodeDistrict(postcode);
  const zooplaSlug = inferZooplaTownSlug(listing);
  const zooplaUrl = zooplaSlug ? buildZooplaToRentSearchUrl(zooplaSlug, beds) : null;
  const primeUrl = outward ? buildPrimeLocationToRentSearchUrl(outward, beds) : null;

  const [rmHtml, zoHtml, plHtml] = await Promise.all([
    fetchHtml(rmUrl),
    zooplaUrl ? fetchHtml(zooplaUrl) : Promise.resolve(null),
    primeUrl ? fetchHtml(primeUrl) : Promise.resolve(null),
  ]);

  let rmComparables: RentComparable[] = [];
  if (rmHtml) {
    try {
      rmComparables = tagRightmoveComparables(
        parseLettingsSearchResultHtml(rmHtml, RENT_COMP_RM_PARSE_MAX),
      );
    } catch (error) {
      console.debug("[RMIA] Rightmove parse error", error);
    }
  }

  let zoComparables: RentComparable[] = [];
  if (zoHtml) {
    try {
      zoComparables = parseZooplaToRentSearchHtml(zoHtml, RENT_COMP_ZOOPLA_PARSE_MAX);
    } catch (error) {
      console.debug("[RMIA] Zoopla parse error", error);
    }
  }

  let plComparables: RentComparable[] = [];
  if (plHtml) {
    try {
      plComparables = parsePrimeLocationToRentSearchHtml(
        plHtml,
        RENT_COMP_PRIMELOCATION_PARSE_MAX,
      );
    } catch (error) {
      console.debug("[RMIA] PrimeLocation parse error", error);
    }
  }

  const merged = mergeRentComparablesFromSources(
    [
      { source: "Rightmove", items: rmComparables },
      { source: "Zoopla", items: zoComparables },
      { source: "PrimeLocation", items: plComparables },
    ],
    RENT_COMP_MERGED_MAX,
  );

  const afterShareFilter = filterWholePropertyLettingComparables(merged);
  const comparables = filterComparablesToListingPostcodeArea(listing, afterShareFilter);

  if (comparables.length === 0) {
    let error: string;
    if (merged.length === 0) {
      error =
        "No lettings could be parsed from Rightmove, Zoopla, or PrimeLocation. Try refreshing the page, or check that the postcode and address look correct.";
    } else if (afterShareFilter.length === 0) {
      error =
        "Every nearby listing looked like a room or house-share advert, not a whole property, so they were excluded. Try widening the search or checking the postcode.";
    } else {
      error =
        "Lettings were parsed but none matched this property’s postcode area — results looked like a different region. Try refreshing the page.";
    }
    return {
      comparables: [],
      locationUsed: postcode,
      market: null,
      llm: null,
      error,
    };
  }

  const market = deriveMarketRentalBand(listing, comparables);
  const llm = await callLlmProxy(listing, comparables, market);

  return {
    comparables,
    locationUsed: postcode,
    market,
    llm,
  };
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (value: unknown) => void) => {
    if (!message || typeof message !== "object") {
      return;
    }

    const record = message as Record<string, unknown>;
    if (record.action === "fetchRentals") {
      void handleFetchRentals(message as FetchRentalsMessage).then(sendResponse);
      return true;
    }

    if (record.action === "fetchSoldPrices") {
      void handleFetchSoldPrices(message as FetchSoldPricesMessage).then(sendResponse);
      return true;
    }

    return;
  },
);

// Attempts to parse Rightmove's rent estimate and comparable lettings from the current page.
//
// Rightmove shows a "Rental Estimate" widget on for-sale property pages, loaded async.
// The data may appear in the window.PAGE_MODEL script tag and/or rendered into the DOM.
//
// All parsing is best-effort and fails gracefully — the user can always type rent manually.

import type { RentComparable, RentEstimate } from "./types";
import {
  deepFind,
  extractBedroomsFromComparableText,
  extractJsonObject,
  extractJsonObjectsFromScriptContent,
  parseComparablesFromJson,
  safeJsonParse,
  toPositiveNumber,
} from "./rentalSearchHtmlParser";

const POUND = "\u00A3";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function findPostcode(text: string): string | null {
  const fullMatch = text.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s+(\d[A-Z]{2})\b/i);
  if (fullMatch) {
    return `${fullMatch[1].toUpperCase()} ${fullMatch[2].toUpperCase()}`;
  }

  // Outward code only (e.g. "SW6", "EC1A") — many listings omit the inward segment.
  // Prefer the last match so titles like "… Lodge, SW6" resolve correctly.
  const outwardMatches = [...text.matchAll(/\b([A-Z]{1,2}\d[A-Z0-9]?)\b/gi)];
  for (let index = outwardMatches.length - 1; index >= 0; index -= 1) {
    const raw = outwardMatches[index][1].toUpperCase();
    if (raw.length < 2 || raw.length > 4) {
      continue;
    }
    if (!/\d/.test(raw)) {
      continue;
    }
    if (!/^[A-Z]{1,2}\d/.test(raw)) {
      continue;
    }
    return raw;
  }

  return null;
}

function normalizeSearchLocation(value: string): string {
  return value
    .replace(/£[\d,]+(?:\.\d+)?/g, "")
    .replace(/\b\d+\s*(?:bed|studio|flat|apartment|house|room)s?\b/gi, "")
    .replace(/\b\d+\s*(?:sq\.?\s*ft|sqm|m2|m\u00B2)\b/gi, "")
    .replace(/[|•–—]/g, ",")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .slice(0, 60);
}

type RentSearchCandidate = {
  value: string;
  isIdentifier: boolean;
  source?: string;
};

function isLikelyLocation(candidate: string): boolean {
  if (candidate.length < 4 || candidate.length > 120) {
    return false;
  }

  if (!/[A-Za-z]/.test(candidate)) {
    return false;
  }

  if (
    /\b(?:flat|house|studio|apartment|room|bed|bedroom|sale|for|rent|to|bathroom)\b/i.test(
      candidate,
    )
  ) {
    return false;
  }

  return true;
}

function isLocationIdentifier(value: string): boolean {
  return /^(?:REGION|POSTCODE|OUTCODE|WARD|DISTRICT|TOWN)\^[A-Za-z0-9_-]+$/i.test(
    value,
  );
}

function isCoordinatePair(value: string): boolean {
  return /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(value);
}

function extractCoordinatesFromJson(
  root: unknown,
): { lat: number; lon: number } | null {
  const latValue = deepFind(root, [
    "latitude",
    "lat",
    "propertyLatitude",
    "mapLatitude",
    "geoLatitude",
  ]);
  const lonValue = deepFind(root, [
    "longitude",
    "lon",
    "lng",
    "longitudeValue",
    "mapLongitude",
    "geoLongitude",
  ]);

  const lat = typeof latValue === "number" ? latValue : Number(latValue);
  const lon = typeof lonValue === "number" ? lonValue : Number(lonValue);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }

  return { lat, lon };
}

function extractCoordinatesFromScripts(): { lat: number; lon: number } | null {
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>("script:not([src])"),
  );

  for (const script of scripts) {
    const content = script.textContent ?? "";
    const jsonObjects = extractJsonObjectsFromScriptContent(content);

    for (const object of jsonObjects) {
      const coords = extractCoordinatesFromJson(object);
      if (coords) {
        return coords;
      }
    }
  }

  return null;
}

function extractNearestStationsFromText(text: string): string[] {
  const candidates = new Set<string>();
  const stationPattern =
    /([A-Z][a-z0-9' -]+(?:\s+[A-Z][a-z0-9' -]+){0,3})\s+station\b/gi;
  let match: RegExpExecArray | null;

  while ((match = stationPattern.exec(text))) {
    const station = match[1].trim();
    if (station.length > 2 && station.length < 40) {
      candidates.add(`${station} station`);
    }
  }

  return Array.from(candidates);
}

function extractJsonStrings(root: unknown): string[] {
  if (root === null || root === undefined) {
    return [];
  }

  if (typeof root === "string") {
    return [root];
  }

  if (typeof root === "object") {
    const record = root as Record<string, unknown>;
    return Object.values(record).flatMap(extractJsonStrings);
  }

  return [];
}

function extractNearestStationsFromScripts(): string[] {
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>("script:not([src])"),
  );

  const stationNames = new Set<string>();
  for (const script of scripts) {
    const content = script.textContent ?? "";
    for (const line of extractNearestStationsFromText(content)) {
      stationNames.add(line);
    }

    const jsonObjects = extractJsonObjectsFromScriptContent(content);
    for (const object of jsonObjects) {
      for (const stringValue of extractJsonStrings(object)) {
        for (const station of extractNearestStationsFromText(stringValue)) {
          stationNames.add(station);
        }
      }
    }
  }

  return Array.from(stationNames);
}

function normalizeLocationCandidate(value: string): string | null {
  const normalized = normalizeSearchLocation(value).trim();
  if (!normalized || !isLikelyLocation(normalized)) {
    return null;
  }
  return normalized;
}

function splitLocationFragments(location: string): string[] {
  const fragments = new Set<string>();
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (let i = parts.length; i > 0; i--) {
    const fragment = parts.slice(parts.length - i).join(", ");
    if (fragment.length >= 4 && fragment.length <= 120) {
      fragments.add(fragment);
    }
  }

  if (parts.length >= 2) {
    fragments.add(`${parts[parts.length - 2]}, ${parts[parts.length - 1]}`);
  }

  return Array.from(fragments);
}

function getSearchLocationCandidates(): RentSearchCandidate[] {
  const candidates = new Map<string, RentSearchCandidate>();
  const elementSelectors = [
    "h1",
    '[data-testid*="address"]',
    '[itemprop*="address"]',
    '[class*="address"]',
    '[id*="address"]',
  ];

  const metaSelectors = [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'meta[property="og:description"]',
    'meta[name="description"]',
  ];

  const values: string[] = [];

  for (const selector of elementSelectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element?.textContent?.trim()) {
      values.push(element.textContent.trim());
    }
  }

  for (const selector of metaSelectors) {
    const meta = document.querySelector<HTMLMetaElement>(selector);
    if (meta?.content?.trim()) {
      values.push(meta.content.trim());
    }
  }

  const title = document.title?.trim();
  if (title) {
    values.push(title);
  }

  const pageText = values.concat(document.body?.innerText ?? "").join(" \n ");
  const postcode = findPostcode(pageText);
  if (postcode) {
    candidates.set(postcode, { value: postcode, isIdentifier: false });
  }

  for (const value of values) {
    const candidate = normalizeLocationCandidate(value);
    if (candidate) {
      candidates.set(candidate, { value: candidate, isIdentifier: false });
      for (const fragment of splitLocationFragments(candidate)) {
        const fragmentCandidate = normalizeLocationCandidate(fragment);
        if (fragmentCandidate) {
          candidates.set(fragmentCandidate, {
            value: fragmentCandidate,
            isIdentifier: false,
          });
        }
      }
    }
  }

  const inlineScripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>("script:not([src])"),
  );

  for (const script of inlineScripts) {
    const content = script.textContent ?? "";
    const jsonObjects = extractJsonObjectsFromScriptContent(content);

    for (const object of jsonObjects) {
      const identifier = deepFind(object, [
        "locationIdentifier",
        "locationId",
        "locationCode",
        "propertyLocationId",
      ]);

      if (typeof identifier === "string" && isLocationIdentifier(identifier)) {
        candidates.set(identifier, {
          value: identifier,
          isIdentifier: true,
        });
      }

      const stringValue = String(
        deepFind(object, [
          "displayAddress",
          "streetAddress",
          "address",
          "addressLocality",
          "addressRegion",
          "postalCode",
          "town",
          "city",
          "county",
        ]) ?? "",
      ).trim();

      const candidate = normalizeLocationCandidate(stringValue);
      if (candidate) {
        candidates.set(candidate, { value: candidate, isIdentifier: false });
      }
    }
  }

  const bodyLines = (document.body?.innerText ?? "")
    .split(/\r?\n/)
    .map((line) => normalizeLocationCandidate(line))
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

  for (const line of bodyLines) {
    candidates.set(line, { value: line, isIdentifier: false });
  }

  const stationCandidates = extractNearestStationsFromScripts();
  for (const station of stationCandidates) {
    candidates.set(station, {
      value: station,
      isIdentifier: false,
      source: "nearest station",
    });
  }

  const coordinates = extractCoordinatesFromScripts();
  if (coordinates) {
    const coordValue = `${coordinates.lat},${coordinates.lon}`;
    candidates.set(coordValue, {
      value: coordValue,
      isIdentifier: false,
      source: "map coordinates",
    });
  }

  return Array.from(candidates.values());
}

function buildRightmoveRentalSearchUrl(location: string): string {
  const baseUrl = window.location.origin || "https://www.rightmove.co.uk";
  if (isLocationIdentifier(location)) {
    return `${baseUrl}/property-to-rent/find.html?locationIdentifier=${encodeURIComponent(
      location,
    )}&searchLocation=&radius=2.0&sortType=1&index=0&includeSSTC=false`;
  }

  if (isCoordinatePair(location)) {
    return `${baseUrl}/property-to-rent/find.html?searchLocation=${encodeURIComponent(
      location,
    )}&locationIdentifier=&radius=2.0&sortType=1&index=0&includeSSTC=false`;
  }

  return `${baseUrl}/property-to-rent/find.html?searchLocation=${encodeURIComponent(
    location,
  )}&locationIdentifier=&radius=2.0&sortType=1&index=0&includeSSTC=false`;
}

// ---------------------------------------------------------------------------
// 1. PAGE_MODEL / embedded JSON parsing
// ---------------------------------------------------------------------------

function parseFromJsonObject(data: unknown): RentEstimate | null {
  const estimateValue = deepFind(data, [
    "monthlyRent",
    "estimatedMonthlyRent",
    "rentEstimate",
    "rentalEstimate",
    "valuationRent",
    "rentalValuation",
    "estimatedRent",
    "rentalValue",
    "monthlyRentEstimate",
    "estimatedValue",
  ]);

  const estimate = toPositiveNumber(estimateValue);
  if (!estimate) return null;

  const minValue = deepFind(data, [
    "minMonthlyRent",
    "minRent",
    "rentMin",
    "low",
    "lowerEstimate",
    "lowerBound",
    "min",
  ]);
  const maxValue = deepFind(data, [
    "maxMonthlyRent",
    "maxRent",
    "rentMax",
    "high",
    "upperEstimate",
    "upperBound",
    "max",
  ]);

  const min = toPositiveNumber(minValue) ?? estimate;
  const max = toPositiveNumber(maxValue) ?? estimate;

  return {
    estimate,
    min,
    max,
    comparables: parseComparablesFromJson(data),
    source: "page data",
  };
}

function parseFromScripts(): RentEstimate | null {
  const scripts = Array.from(
    document.querySelectorAll<HTMLScriptElement>("script:not([src])"),
  );

  for (const script of scripts) {
    const content = script.textContent ?? "";

    // Quick pre-filter: skip scripts with no rental-related keywords
    if (
      !content.includes("monthlyRent") &&
      !content.includes("rentEstimate") &&
      !content.includes("rentalEstimate") &&
      !content.includes("rentalValuation") &&
      !content.includes("PAGE_MODEL") &&
      !content.includes("estimatedRent")
    ) {
      continue;
    }

    // Try parsing the whole script as plain JSON first
    const asJson = safeJsonParse(content);
    if (asJson) {
      const result = parseFromJsonObject(asJson);
      if (result) return result;
    }

    // Try extracting PAGE_MODEL assignment using brace-counter (handles large nested JSON)
    const pageModelIdx = content.indexOf("PAGE_MODEL");
    if (pageModelIdx !== -1) {
      const jsonStr = extractJsonObject(content, pageModelIdx);
      if (jsonStr) {
        const data = safeJsonParse(jsonStr);
        if (data) {
          const result = parseFromJsonObject(data);
          if (result) return result;
        }
      }
    }

    // Also try __NEXT_DATA__ which some Rightmove pages use
    const nextDataIdx = content.indexOf("__NEXT_DATA__");
    if (nextDataIdx !== -1) {
      const jsonStr = extractJsonObject(content, nextDataIdx);
      if (jsonStr) {
        const data = safeJsonParse(jsonStr);
        if (data) {
          const result = parseFromJsonObject(data);
          if (result) return result;
        }
      }
    }

    // Generic fallback: find any large JSON object in the script
    const jsonStr = extractJsonObject(content);
    if (jsonStr && jsonStr.length > 200) {
      const data = safeJsonParse(jsonStr);
      if (data) {
        const result = parseFromJsonObject(data);
        if (result) return result;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. DOM parsing — for data rendered after async API calls
// ---------------------------------------------------------------------------

function parsePriceFromText(text: string): number | null {
  const match = text.match(new RegExp(`${POUND}\\s*([\\d,]+)`));
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(/,/g, ""));
  return toPositiveNumber(value);
}

function parseComparablesFromDom(container: Element): RentComparable[] {
  const comparables: RentComparable[] = [];

  // Each comparable is typically a card / list item inside the container
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      '[class*="comparable"], [class*="Comparable"], [class*="similar"], ' +
        '[class*="Similar"], li, article, [class*="card"], [class*="Card"], ' +
        '[class*="property"], [class*="Property"]',
    ),
  );

  for (const el of candidates) {
    // Skip the container itself if it matches
    if (el === container) continue;

    const text = (el.innerText || el.textContent || "").trim();
    const price = parsePriceFromText(text);
    if (!price) continue;

    // Extract description — take the first meaningful sentence
    const descMatch = text.match(/[A-Z][^.\n]{10,120}/);
    const description = descMatch ? descMatch[0].trim() : text.slice(0, 120);

    // Extract available-from date
    const dateMatch = text.match(
      /(?:available from|from)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    const availableFrom = dateMatch?.[1];

    // Extract link
    const anchor = el.querySelector<HTMLAnchorElement>("a[href]");
    const rawHref = anchor?.getAttribute("href") ?? undefined;
    const url = rawHref
      ? rawHref.startsWith("http")
        ? rawHref
        : `https://www.rightmove.co.uk${rawHref}`
      : undefined;

    if (comparables.length < 6) {
      comparables.push({
        price,
        description,
        url,
        availableFrom,
        source: "DOM rental section",
        bedrooms: extractBedroomsFromComparableText(text),
      });
    }
  }

  return comparables;
}

function parseFromDom(): RentEstimate | null {
  // Rightmove-specific: look for the rental estimate section by data attributes / known classes
  const rmSelectors = [
    '[data-test="rental-estimate"]',
    '[class*="rentalEstimate"]',
    '[class*="RentalEstimate"]',
    '[class*="rental-estimate"]',
    '[class*="rentEstimate"]',
    '[class*="RentEstimate"]',
    '[class*="valuationWidget"]',
    '[class*="ValuationWidget"]',
    '[class*="rentalValuation"]',
    '[class*="RentalValuation"]',
  ];

  for (const selector of rmSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;

    const text = (el.innerText || el.textContent || "").trim();
    const estimate = parsePriceFromText(text);
    if (!estimate) continue;

    const rangeMatch = text.match(
      new RegExp(`${POUND}\\s*([\\d,]+)\\s*[-–—]\\s*${POUND}\\s*([\\d,]+)`),
    );
    const min = rangeMatch
      ? (toPositiveNumber(Number(rangeMatch[1].replace(/,/g, ""))) ?? estimate)
      : estimate;
    const max = rangeMatch
      ? (toPositiveNumber(Number(rangeMatch[2].replace(/,/g, ""))) ?? estimate)
      : estimate;

    return {
      estimate,
      min,
      max,
      comparables: parseComparablesFromDom(el),
      source: "page element",
    };
  }

  // Generic fallback: look for heading text matching rental estimate keywords
  const allElements = Array.from(
    document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,p,span,div,section"),
  );

  for (const el of allElements) {
    const text = (el.innerText || el.textContent || "").trim();

    if (
      !/rent\s*estimate|rental\s*estimate|rental\s*valuation|estimated\s*rent|how much.*rent/i.test(
        text,
      )
    ) {
      continue;
    }
    // Skip if this element contains most of the page (too broad)
    if (text.length > 1000) continue;

    // Look for the price in this element and nearby siblings / parent
    const container =
      el.closest<HTMLElement>(
        '[class*="valuation"], [class*="Valuation"], [class*="estimate"], ' +
          '[class*="Estimate"], section, [class*="rental"], [class*="Rental"]',
      ) ??
      el.parentElement ??
      el;

    const containerText = (
      container.innerText ||
      container.textContent ||
      ""
    ).trim();
    const estimate = parsePriceFromText(containerText);
    if (!estimate) continue;

    const rangeMatch = containerText.match(
      new RegExp(`${POUND}\\s*([\\d,]+)\\s*[-–—]\\s*${POUND}\\s*([\\d,]+)`),
    );
    const min = rangeMatch
      ? (toPositiveNumber(Number(rangeMatch[1].replace(/,/g, ""))) ?? estimate)
      : estimate;
    const max = rangeMatch
      ? (toPositiveNumber(Number(rangeMatch[2].replace(/,/g, ""))) ?? estimate)
      : estimate;

    return {
      estimate,
      min,
      max,
      comparables: parseComparablesFromDom(container),
      source: "page element",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function parseRentEstimate(): RentEstimate | null {
  const result = parseFromScripts() ?? parseFromDom();

  if (!result) {
    // Log what keys were found in script tags to help diagnose future failures
    const scripts = Array.from(
      document.querySelectorAll<HTMLScriptElement>("script:not([src])"),
    );
    const hasPageModel = scripts.some((s) =>
      s.textContent?.includes("PAGE_MODEL"),
    );
    console.debug(
      "[RMIA] rent estimate: not found.",
      hasPageModel ? "PAGE_MODEL present." : "No PAGE_MODEL.",
      `${scripts.length} inline scripts scanned.`,
    );
  }

  return result;
}

const MAX_NEARBY_RENT_FETCH_ATTEMPTS = 10;

/** Best-effort Rightmove location for a to-let search (postcode text or POSTCODE^id from embedded JSON). */
export type LettingsSearchLocationHint =
  | { kind: "identifier"; value: string }
  | { kind: "text"; value: string };

export function getPreferredLettingsSearchLocation(): LettingsSearchLocationHint | null {
  const ranked = rankRentSearchCandidates(getSearchLocationCandidates());
  if (ranked.length === 0) {
    return null;
  }

  const top = ranked[0];
  if (top.isIdentifier) {
    return { kind: "identifier", value: top.value };
  }

  return { kind: "text", value: top.value };
}

function rankRentSearchCandidates(
  candidates: RentSearchCandidate[],
): RentSearchCandidate[] {
  const fullPostcode = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s+\d[A-Z]{2}$/i;

  const scored = candidates.map((candidate) => {
    const value = candidate.value.trim();
    let score = 50;
    if (candidate.isIdentifier) {
      score = 0;
    } else if (fullPostcode.test(value)) {
      score = 2;
    } else if (/^[A-Z]{1,2}\d[A-Z0-9]?$/i.test(value) && value.length <= 4) {
      score = 4;
    } else if (value.length <= 28) {
      score = 8;
    } else if (value.length <= 55) {
      score = 20;
    }

    return { candidate, score, value };
  });

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.value.length - b.value.length;
  });

  const seen = new Set<string>();
  const ranked: RentSearchCandidate[] = [];
  for (const { candidate, value } of scored) {
    const key = value.slice(0, 96).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ranked.push(candidate);
    if (ranked.length >= MAX_NEARBY_RENT_FETCH_ATTEMPTS) {
      break;
    }
  }

  return ranked;
}

/**
 * Builds a Rightmove "property to rent" search URL for the current for-sale page.
 * Opens the same style of results the extension uses internally, without fetching HTML here.
 */
export function getSuggestedLettingsSearchUrl(): string | null {
  const ranked = rankRentSearchCandidates(getSearchLocationCandidates());
  if (ranked.length > 0) {
    return buildRightmoveRentalSearchUrl(ranked[0].value);
  }

  const text = [
    document.querySelector("h1")?.textContent?.trim(),
    document
      .querySelector<HTMLMetaElement>('meta[property="og:title"]')
      ?.content?.trim(),
    document.title?.trim(),
    document.body?.innerText,
  ]
    .filter(Boolean)
    .join("\n");

  const postcode = findPostcode(text);
  if (postcode) {
    return buildRightmoveRentalSearchUrl(postcode);
  }

  return null;
}

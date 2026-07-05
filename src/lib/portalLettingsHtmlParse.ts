// Parse Zoopla / PrimeLocation to-rent search HTML in the extension service worker (linkedom Document).
import { parseHTML } from "linkedom";
import { tidyComparableSummaryLine } from "./comparableDisplayTidy";
import {
  extractBedroomsFromComparableText,
  extractFloorAreaSqFtFromComparableText,
  inferComparablePropertyType,
  isLikelyRoomOrHouseShareLetting,
  parseRentPriceFromText,
} from "./rentalSearchHtmlParser";
import type { RentComparable } from "./types";
import { roundToTwoDecimals } from "./utils";

function absolutiseZoopla(href: string): string {
  const h = href.trim();
  if (h.startsWith("http")) {
    return h;
  }
  return `https://www.zoopla.co.uk${h.startsWith("/") ? "" : "/"}${h}`;
}

function absolutisePrimeLocation(href: string): string {
  const h = href.trim();
  if (h.startsWith("http")) {
    return h;
  }
  return `https://www.primelocation.com${h.startsWith("/") ? "" : "/"}${h}`;
}

function collectCardText(anchor: Element): string {
  const containerSelectors = [
    "article",
    '[class*="PropertyCard"]',
    '[class*="propertyCard"]',
    '[class*="ListingCard"]',
    '[class*="listing-card"]',
    '[class*="SearchResult"]',
    '[class*="search-result"]',
    '[class*="listing"]',
    '[class*="Listing"]',
    "li",
  ];

  let best = "";
  for (const selector of containerSelectors) {
    const el = anchor.closest(selector);
    if (!el) {
      continue;
    }
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t.length > best.length && t.length < 12000) {
      best = t;
    }
  }

  let walk: Element | null = anchor;
  for (let depth = 0; depth < 6 && walk; depth += 1, walk = walk.parentElement) {
    const t = (walk.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t.length > best.length && t.length < 12000) {
      best = t;
    }
  }

  return best || (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Use the richest card text so houseshare disclaimers are not dropped before filtering. */
function pickDescriptionSnippet(anchor: Element): string {
  const card = collectCardText(anchor);
  const direct = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
  const merged = card.length >= direct.length ? card : direct;
  return merged.slice(0, 900);
}

export function parseZooplaToRentSearchHtml(html: string, maximum: number): RentComparable[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const out: RentComparable[] = [];

  document.querySelectorAll('a[href*="/to-rent/details/"]').forEach((anchor) => {
    if (out.length >= maximum) {
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href) {
      return;
    }
    const url = absolutiseZoopla(href);
    const textForPrice = collectCardText(anchor);
    const rawSnippet = pickDescriptionSnippet(anchor);
    const filterText = `${textForPrice}\n${rawSnippet}\n${url}`;
    if (isLikelyRoomOrHouseShareLetting(filterText)) {
      return;
    }
    const price = parseRentPriceFromText(textForPrice);
    if (!price) {
      return;
    }
    const key = `${Math.round(price)}|${url}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const snippet = tidyComparableSummaryLine(rawSnippet);
    out.push({
      price: roundToTwoDecimals(price),
      description: snippet || "Zoopla listing",
      url,
      source: "Zoopla",
      bedrooms: extractBedroomsFromComparableText(textForPrice),
      propertyType: inferComparablePropertyType(textForPrice),
      floorAreaSqFt: extractFloorAreaSqFtFromComparableText(textForPrice),
    });
  });

  return out;
}

export function parsePrimeLocationToRentSearchHtml(html: string, maximum: number): RentComparable[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const out: RentComparable[] = [];

  document.querySelectorAll('a[href*="/to-rent/details/"]').forEach((anchor) => {
    if (out.length >= maximum) {
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href) {
      return;
    }
    const url = absolutisePrimeLocation(href);
    const textForPrice = collectCardText(anchor);
    const rawSnippet = pickDescriptionSnippet(anchor);
    const filterText = `${textForPrice}\n${rawSnippet}\n${url}`;
    if (isLikelyRoomOrHouseShareLetting(filterText)) {
      return;
    }
    const price = parseRentPriceFromText(textForPrice);
    if (!price) {
      return;
    }
    const key = `${Math.round(price)}|${url}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const snippet = tidyComparableSummaryLine(rawSnippet);
    out.push({
      price: roundToTwoDecimals(price),
      description: snippet || "PrimeLocation listing",
      url,
      source: "PrimeLocation",
      bedrooms: extractBedroomsFromComparableText(textForPrice),
      propertyType: inferComparablePropertyType(textForPrice),
      floorAreaSqFt: extractFloorAreaSqFtFromComparableText(textForPrice),
    });
  });

  return out;
}

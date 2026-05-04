// Parse Zoopla / PrimeLocation to-rent search HTML in the extension service worker (linkedom Document).
import { parseHTML } from "linkedom";
import { tidyComparableSummaryLine } from "./comparableDisplayTidy";
import {
  extractBedroomsFromComparableText,
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
  const card =
    anchor.closest("article") ??
    anchor.closest("li") ??
    anchor.closest('[class*="listing"]') ??
    anchor.closest('[class*="Listing"]') ??
    anchor.parentElement?.parentElement ??
    anchor.parentElement;
  const raw = (card?.textContent ?? anchor.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw;
}

/** Prefer the listing link’s own text; fall back to the wider card for price parsing only. */
function pickDescriptionSnippet(anchor: Element): string {
  const direct = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
  if (direct.length >= 14 && direct.length <= 220) {
    return direct;
  }
  return collectCardText(anchor);
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
    const price = parseRentPriceFromText(textForPrice);
    if (!price) {
      return;
    }
    const key = `${Math.round(price)}|${url}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const snippet = tidyComparableSummaryLine(pickDescriptionSnippet(anchor));
    out.push({
      price: roundToTwoDecimals(price),
      description: snippet || "Zoopla listing",
      url,
      source: "Zoopla",
      bedrooms: extractBedroomsFromComparableText(textForPrice),
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
    const price = parseRentPriceFromText(textForPrice);
    if (!price) {
      return;
    }
    const key = `${Math.round(price)}|${url}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const snippet = tidyComparableSummaryLine(pickDescriptionSnippet(anchor));
    out.push({
      price: roundToTwoDecimals(price),
      description: snippet || "PrimeLocation listing",
      url,
      source: "PrimeLocation",
      bedrooms: extractBedroomsFromComparableText(textForPrice),
    });
  });

  return out;
}

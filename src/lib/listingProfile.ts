// Structured for-sale listing fields for rental benchmarking (best-effort DOM scrape).
import { findPostcode } from "./ukPostcodeOutward";
import type { ListingRentProfile, RightmovePageInfo } from "./types";

const DESCRIPTION_SELECTORS = [
  '[data-test*="description"]',
  '[data-testid*="description"]',
  '[class*="description"]',
  '[class*="Description"]',
] as const;

function firstMatchInt(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value >= 0 && value <= 30 ? value : null;
}

function normalizePropertyTypeToken(value: string): string | null {
  const token = value.trim().toLowerCase();
  if (!token) {
    return null;
  }
  if (/\b(flat|apartment|maisonette|penthouse|studio|duplex)\b/i.test(token)) {
    return "Flat";
  }
  if (
    /\b(house|bungalow|cottage|mews|townhouse|semi-detached|detached|terraced)\b/i.test(
      token,
    )
  ) {
    return "House";
  }
  return null;
}

function extractPropertyType(primaryCorpus: string, pageText: string): string | null {
  const scoped = primaryCorpus.match(
    /\b(flat|apartment|house|bungalow|maisonette|penthouse|studio|duplex|mews|townhouse|cottage|semi-detached|detached|terraced)\b/i,
  );
  if (scoped) {
    return normalizePropertyTypeToken(scoped[1]);
  }

  const propertyTypeLine = pageText.match(
    /\bproperty\s*type\b[\s:|-]*([A-Za-z][A-Za-z\s-]{2,40})/i,
  );
  if (propertyTypeLine) {
    const normalized = normalizePropertyTypeToken(propertyTypeLine[1]);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractTenure(corpus: string): string | null {
  if (/\bleasehold\b/i.test(corpus)) {
    return "Leasehold";
  }
  if (/\bfreehold\b/i.test(corpus)) {
    return "Freehold";
  }
  return null;
}

function collectKeyFeatures(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const roots = [
    document.querySelector('[data-test="readMoreFeatures"]')?.parentElement,
    document.querySelector('[class*="keyFeature"]'),
    document.querySelector('[class*="KeyFeature"]'),
    document.querySelector('[data-test*="key-feature"]'),
  ];

  for (const root of roots) {
    if (!root) {
      continue;
    }
    root.querySelectorAll("li").forEach((li) => {
      const text = li.textContent?.replace(/\s+/g, " ").trim();
      if (!text || text.length < 6 || text.length > 200) {
        return;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      out.push(text);
    });
    if (out.length >= 12) {
      break;
    }
  }

  return out.slice(0, 12);
}

function collectDescriptionExcerpt(): string {
  const chunks: string[] = [];

  for (const selector of DESCRIPTION_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const text = element.innerText?.replace(/\s+/g, " ").trim();
      if (text && text.length > 50) {
        chunks.push(text);
      }
    });
  }

  return chunks.join("\n\n").slice(0, 2800);
}

export function extractListingRentProfile(
  pageInfo: RightmovePageInfo,
): ListingRentProfile {
  const headline =
    document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ||
    pageInfo.address;

  const scopedCorpus = [
    headline,
    pageInfo.title,
    pageInfo.address,
    document.title,
  ].join("\n");
  const pageText = document.body?.innerText ?? "";
  const corpus = `${scopedCorpus}\n${pageText}`;

  const postcode = findPostcode(corpus);

  return {
    headline,
    address: pageInfo.address,
    postcode,
    beds: firstMatchInt(corpus, /\b(\d+)\s*(?:bed|bedroom)s?\b/i),
    baths: firstMatchInt(corpus, /\b(\d+)\s*(?:bath|bathroom)s?\b/i),
    propertyType: extractPropertyType(scopedCorpus, pageText),
    tenure: extractTenure(corpus),
    floorAreaSqFt: pageInfo.floorAreaSqFt,
    keyFeatures: collectKeyFeatures(),
    descriptionExcerpt: collectDescriptionExcerpt(),
    askingPrice: pageInfo.askingPrice,
  };
}

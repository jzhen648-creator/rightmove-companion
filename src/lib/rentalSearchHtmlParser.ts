// Parses Rightmove *to-let search result* markup via a `Document` (browser or linkedom).
// For MV3 service workers (no `DOMParser`), use `parseLettingsSearchResultHtml` from
// `rentalLettingsSearchParse.ts`. Shared helpers are also used by `rentEstimate.ts`.
import type { RentComparable } from "./types";
import { roundToTwoDecimals } from "./utils";

const POUND = "\u00A3";

export function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 50 ? n : null;
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function extractJsonObject(text: string, offset = 0): string | null {
  const start = text.indexOf("{", offset);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function extractJsonObjectsFromScriptContent(text: string): unknown[] {
  const objects: unknown[] = [];
  let offset = 0;

  while (offset < text.length) {
    const jsonText = extractJsonObject(text, offset);
    if (!jsonText) break;

    const parsed = safeJsonParse(jsonText);
    if (parsed !== null) {
      objects.push(parsed);
    }

    const nextOffset = text.indexOf(jsonText, offset);
    if (nextOffset === -1) break;
    offset = nextOffset + jsonText.length;
  }

  return objects;
}

export function deepFind(
  obj: unknown,
  keys: string[],
  maxDepth = 10,
  depth = 0,
): unknown {
  if (depth > maxDepth || obj === null || typeof obj !== "object") {
    return undefined;
  }

  const record = obj as Record<string, unknown>;

  for (const key of keys) {
    if (key in record && record[key] !== null && record[key] !== undefined) {
      return record[key];
    }
  }

  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      const found = deepFind(value, keys, maxDepth, depth + 1);
      if (found !== undefined) return found;
    }
  }

  return undefined;
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

export function parseRentPriceFromText(text: string): number | null {
  const pcmMatch = text.match(
    new RegExp(
      `${POUND}\\s*([\\d,]+)\\s*(?:pcm|per month|per calendar month)`,
      "i",
    ),
  );
  if (pcmMatch) {
    return toPositiveNumber(Number.parseFloat(pcmMatch[1].replace(/,/g, "")));
  }

  const pwMatch = text.match(
    new RegExp(`${POUND}\\s*([\\d,]+)\\s*(?:pw|per week)`, "i"),
  );
  if (pwMatch) {
    const weekly = Number.parseFloat(pwMatch[1].replace(/,/g, ""));
    return toPositiveNumber((weekly * 52) / 12);
  }

  return null;
}

export function extractBedroomsFromComparableText(text: string): number | null {
  const match = text.match(/\b(\d+)\s*(?:bed|bedroom)s?\b/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value >= 0 && value <= 30 ? value : null;
}

export function extractFloorAreaSqFtFromComparableText(text: string): number | null {
  const sqFtMatch = text.match(/\b([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|ft²|ft2)\b/i);
  if (sqFtMatch) {
    const value = Number.parseFloat(sqFtMatch[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 100 && value <= 20000) {
      return Math.round(value);
    }
  }

  const sqmMatch = text.match(/\b([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*m|sqm|m²|m2)\b/i);
  if (sqmMatch) {
    const sqm = Number.parseFloat(sqmMatch[1].replace(/,/g, ""));
    if (Number.isFinite(sqm) && sqm >= 10 && sqm <= 2000) {
      return Math.round(sqm * 10.7639);
    }
  }

  return null;
}

export function inferComparablePropertyType(text: string): "house" | "flat" | "other" | null {
  const raw = text.trim();
  if (!raw) {
    return null;
  }
  if (
    /\b(flat|apartment|maisonette|penthouse|studio|duplex)\b/i.test(raw)
  ) {
    return "flat";
  }
  if (
    /\b(house|bungalow|cottage|mews|townhouse|semi-detached|detached|terraced)\b/i.test(raw)
  ) {
    return "house";
  }
  return "other";
}

/**
 * True when text looks like a single-room / house-share / HMO let rather than a whole property.
 * Whole-property rent estimates must exclude these or medians collapse toward room rates.
 */
export function isLikelyRoomOrHouseShareLetting(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) {
    return false;
  }

  if (/\bhouse\s*share\b/.test(t)) return true;
  if (/\bhouse[-\s]+share\b/.test(t)) return true;
  if (/\bflat\s*share\b/.test(t)) return true;
  if (/\broom\s*share\b/.test(t)) return true;
  if (/\b(?:pleased|delighted)\s+to\s+offer\b[\s\S]{0,220}\brooms?\s+within\b/i.test(t)) {
    return true;
  }
  if (/\bto\s+offer\s+\d+\s+delightful\s+rooms?\b/i.test(t)) return true;
  // Truncated UI copy often ends at "shared hou…" — still a house-share signal.
  if (/\bshared\s+hou(?:se)?\b/.test(t)) return true;
  if (/\bshared\s+(?:house|flat|accommodation|property|home)\b/.test(t)) return true;
  if (/\b(?:single|double|twin)\s+room\b/.test(t)) return true;
  if (/\broom\s+to\s+let\b/.test(t)) return true;
  if (/\brooms?\s+within\b/.test(t)) return true;
  if (/\bdelightful\s+rooms?\b/.test(t)) return true;
  if (/\bco-?living\b/.test(t)) return true;
  if (
    /\broom\s+in\s+(?:a|an|the)\s+(?:shared\s+)?(?:house|flat|property|hmo)\b/.test(t)
  ) {
    return true;
  }
  if (/\bhmo\b/.test(t)) return true;
  if (/\bhouse\s+in\s+multiple\s+occupation\b/.test(t)) return true;
  if (/\blodger\b/.test(t)) return true;
  if (/\bper\s+room\b/.test(t)) return true;
  if (/\bbed\s*space\b/.test(t)) return true;
  if (/\bensuite\s+room\b/.test(t)) return true;
  if (/\b(?:offer|offering|available)\s+\d+\s+(?:delightful\s+)?rooms?\b/.test(t)) {
    return true;
  }
  if (/\bspare\s+room\s+available\b/.test(t)) return true;
  if (/\b(?:inclusive\s+)?bills\s+included\b/.test(t) && /\broom\b/.test(t)) {
    return true;
  }

  if (/\/(?:house|flat|room)[_-]?share\b/i.test(t)) return true;

  return false;
}

/** Signals for filtering (description is often truncated in the UI). */
function comparableTextForShareFilter(row: RentComparable): string {
  return [row.description, row.url ?? ""].filter(Boolean).join("\n");
}

export function filterWholePropertyLettingComparables(
  items: RentComparable[],
): RentComparable[] {
  return items.filter(
    (row) => !isLikelyRoomOrHouseShareLetting(comparableTextForShareFilter(row)),
  );
}

function coerceBedroomCountFromJson(
  value: unknown,
  description: string,
): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 30) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 30) {
      return parsed;
    }
  }
  return extractBedroomsFromComparableText(description);
}

function coerceFloorAreaSqFtFromJson(value: unknown, description: string): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 100 && value <= 20000) {
      return Math.round(value);
    }
    // Common metric input in sqm.
    if (value >= 10 && value <= 2000) {
      return Math.round(value * 10.7639);
    }
  }
  if (typeof value === "string") {
    const fromText = extractFloorAreaSqFtFromComparableText(value);
    if (fromText !== null) {
      return fromText;
    }
    const numeric = Number.parseFloat(value.replace(/,/g, ""));
    if (Number.isFinite(numeric)) {
      if (numeric >= 100 && numeric <= 20000) {
        return Math.round(numeric);
      }
      if (numeric >= 10 && numeric <= 2000) {
        return Math.round(numeric * 10.7639);
      }
    }
  }
  return extractFloorAreaSqFtFromComparableText(description);
}

export function parseComparablesFromJson(root: unknown): RentComparable[] {
  const arr = deepFind(root, [
    "comparables",
    "comparableProperties",
    "rentalComparables",
    "nearbyRentals",
    "similarProperties",
    "lettings",
    "rentalProperties",
  ]);

  if (!Array.isArray(arr)) return [];

  return arr.slice(0, 12).flatMap((item: unknown): RentComparable[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;

    const price =
      toPositiveNumber(record.monthlyRent) ??
      toPositiveNumber(record.price) ??
      toPositiveNumber(record.rent) ??
      toPositiveNumber(record.amount);

    if (!price) return [];

    const description = String(
      record.displayAddress ?? record.address ?? record.description ?? "",
    ).trim();

    const signalText = [
      description,
      typeof record.summary === "string" ? record.summary : "",
      typeof record.title === "string" ? record.title : "",
      typeof record.displayTitle === "string" ? record.displayTitle : "",
      typeof record.teaser === "string" ? record.teaser : "",
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
    if (isLikelyRoomOrHouseShareLetting(signalText)) {
      return [];
    }

    const bedrooms = coerceBedroomCountFromJson(
      record.bedrooms ??
        record.beds ??
        record.numberOfBedrooms ??
        record.bedroomCount,
      description,
    );
    const floorAreaSqFt = coerceFloorAreaSqFtFromJson(
      record.floorAreaSqFt ??
        record.floorArea ??
        record.floorAreaValue ??
        record.sizeSqFt ??
        record.size,
      description,
    );

    const rawUrl = record.propertyUrl ?? record.url;
    const url =
      typeof rawUrl === "string"
        ? rawUrl.startsWith("http")
          ? rawUrl
          : `https://www.rightmove.co.uk${rawUrl}`
        : undefined;

    const availableFrom =
      typeof record.letAvailableDate === "string"
        ? record.letAvailableDate
        : typeof record.availableFrom === "string"
          ? record.availableFrom
          : undefined;

    return [
      {
        price,
        description,
        url,
        availableFrom,
        source: "embedded JSON",
        bedrooms,
        propertyType: inferComparablePropertyType(
          String(
            record.propertyType ??
              record.propertySubType ??
              record.type ??
              record.propertyStyle ??
              description,
          ),
        ),
        floorAreaSqFt,
      },
    ];
  });
}

function parseNearbyRentalComparablesFromScript(
  doc: Document,
  maximum = 10,
): RentComparable[] {
  const seen = new Set<string>();
  const comparables: RentComparable[] = [];

  const scripts = Array.from(
    doc.querySelectorAll<HTMLScriptElement>("script:not([src])"),
  );
  for (const script of scripts) {
    const content = script.textContent?.trim();
    if (!content) continue;

    const json =
      safeJsonParse(content) ??
      (() => {
        const jsonStr = extractJsonObject(content);
        return jsonStr ? safeJsonParse(jsonStr) : null;
      })();

    if (!json) continue;

    const items = parseComparablesFromJson(json);
    for (const item of items) {
      if (comparables.length >= maximum) break;
      const key = `${item.price}-${item.description}`;
      if (seen.has(key)) continue;
      seen.add(key);
      comparables.push({ ...item, source: item.source ?? "embedded JSON" });
    }

    if (comparables.length >= maximum) break;
  }

  return comparables;
}

function getNodeVisibleText(node: HTMLElement): string {
  const maybe = node as HTMLElement & { innerText?: string };
  if (typeof maybe.innerText === "string" && maybe.innerText.trim()) {
    return maybe.innerText.trim();
  }
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

function parseNearbyRentalComparables(doc: Document, maximum = 10): RentComparable[] {
  const seen = new Set<string>();
  const comparables: RentComparable[] = [];

  const searchCardSelectors = [
    '[data-testid*="search-result"]',
    '[class*="searchResult"]',
    '[class*="l-searchResult"]',
    '[class*="propertyCard"]',
    '[class*="l-property"]',
    '[data-testid*="property-card"]',
    "article",
    "li",
  ];

  for (const selector of searchCardSelectors) {
    const cards = Array.from(doc.querySelectorAll<HTMLElement>(selector));
    for (const card of cards) {
      if (comparables.length >= maximum) break;

      const text = getNodeVisibleText(card);
      if (isLikelyRoomOrHouseShareLetting(text)) continue;

      const price = parseRentPriceFromText(text);
      if (!price) continue;

      const anchor = card.querySelector<HTMLAnchorElement>(
        "a[href*='/property-to-rent/']",
      );
      const rawHref = anchor?.getAttribute("href")?.trim();
      const url = rawHref
        ? rawHref.startsWith("http")
          ? rawHref
          : `https://www.rightmove.co.uk${rawHref}`
        : undefined;

      const key = `${price}-${text.slice(0, 50)}-${url ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      comparables.push({
        price: roundToTwoDecimals(price),
        description: normalizeSearchLocation(text) || "Nearby rental listing",
        url,
        availableFrom: undefined,
        source: `search card (${selector})`,
        bedrooms: extractBedroomsFromComparableText(text),
        propertyType: inferComparablePropertyType(text),
        floorAreaSqFt: extractFloorAreaSqFtFromComparableText(text),
      });
      if (comparables.length >= maximum) break;
    }
    if (comparables.length >= maximum) break;
  }

  if (comparables.length > 0) {
    return comparables;
  }

  const body = doc.body as HTMLElement | null | undefined;
  const lines = (body ? getNodeVisibleText(body) : "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (comparables.length >= maximum) {
      break;
    }

    if (isLikelyRoomOrHouseShareLetting(line)) continue;

    const price = parseRentPriceFromText(line);
    if (!price) continue;

    const key = `${price}-${line.slice(0, 50)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    comparables.push({
      price: roundToTwoDecimals(price),
      description: normalizeSearchLocation(line) || "Nearby rental listing",
      url: undefined,
      availableFrom: undefined,
      source: "search page text",
      bedrooms: extractBedroomsFromComparableText(line),
      propertyType: inferComparablePropertyType(line),
      floorAreaSqFt: extractFloorAreaSqFtFromComparableText(line),
    });
  }

  return comparables;
}

export function mergeLettingComparablesFromSearchDocument(
  doc: Document,
  maximum: number,
): RentComparable[] {
  const byKey = new Map<string, RentComparable>();

  for (const item of parseNearbyRentalComparables(doc, maximum)) {
    const key = `${item.price}-${item.description.slice(0, 96)}`;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  for (const item of parseNearbyRentalComparablesFromScript(doc, maximum)) {
    const key = `${item.price}-${item.description.slice(0, 96)}`;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values()).slice(0, maximum);
}

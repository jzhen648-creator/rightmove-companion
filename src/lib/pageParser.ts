// Heuristics for reading useful details from the current Rightmove page.
// Parsing stays separate from the UI so it can improve over time.
import { parseRentEstimate } from "./rentEstimate";
import type {
  GroundRentReview,
  ParsedListingField,
  ParsedListingFieldKey,
  RightmovePageInfo,
} from "./types";
import { roundToTwoDecimals } from "./utils";

const POUND_SYMBOL = "\u00A3";
const MONEY_WITH_SYMBOL_REGEX = new RegExp(
  `${POUND_SYMBOL}\\s*([\\d,]+(?:\\.\\d+)?)`,
  "i",
);
const MONEY_WITHOUT_SYMBOL_REGEX = /([\d,]+(?:\.\d+)?)/;

const ANNUAL_UNIT_REGEX =
  /\b(pa|p\.a\.|per annum|annum|per year|a year|annual(?:ly)?)\b/i;
const MONTHLY_UNIT_REGEX = /\b(pcm|per calendar month|per month|monthly)\b/i;

const SEARCH_SECTION_SELECTORS = [
  '[data-test*="description"]',
  '[data-testid*="description"]',
  '[class*="description"]',
  '[class*="Description"]',
  '[data-test*="feature"]',
  '[data-testid*="feature"]',
  '[class*="feature"]',
  '[class*="Feature"]',
  '[data-test*="tenure"]',
  '[data-testid*="tenure"]',
  '[class*="tenure"]',
  '[class*="Tenure"]',
  '[data-test*="fact"]',
  '[data-testid*="fact"]',
  '[class*="fact"]',
  '[class*="Fact"]',
] as const;

const SQ_FT_REGEX =
  /(\d{2,5}(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|ft(?:2|\u00B2)|square feet)\b/i;
const SQ_M_REGEX =
  /(\d{1,4}(?:\.\d+)?)\s*(?:sq\.?\s*m|sqm|m(?:2|\u00B2)|square metres|square meters)\b/i;

interface ChargeSearchDefinition {
  fieldKey: ParsedListingFieldKey;
  keywords: string[];
  annualLabelPattern?: RegExp;
  peppercornPattern?: RegExp;
}

const CHARGE_SEARCH_DEFINITIONS: ChargeSearchDefinition[] = [
  {
    fieldKey: "serviceChargeAnnual",
    keywords: ["service charge", "annual service charge"],
    annualLabelPattern: /annual service charge/i,
  },
  {
    fieldKey: "groundRentAnnual",
    keywords: ["ground rent", "peppercorn"],
    annualLabelPattern: /annual ground rent/i,
    peppercornPattern:
      /(ground rent[^.:\n\r]{0,40}peppercorn|peppercorn[^.:\n\r]{0,40}ground rent)/i,
  },
];

const GROUND_RENT_SEARCH_DEFINITION = CHARGE_SEARCH_DEFINITIONS.find(
  (definition) => definition.fieldKey === "groundRentAnnual",
);

const GROUND_RENT_ESCALATION_PATTERNS = [
  /\bdoubles?\b/i,
  /\bdoubling\b/i,
  /every\s+(5|10|15)\s+years?\b/i,
  /\brpi\b/i,
  /index[-\s]?linked/i,
  /review period/i,
  /escalating ground rent/i,
] as const;

function normalizeText(rawText: string): string {
  return rawText
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBlockText(rawText: string): string {
  return rawText.replace(/\u00a0/g, " ").trim();
}

function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 10000 && value <= 50000000;
}

function parseMoneyValue(
  rawValue: string | null | undefined,
  requireSymbol = false,
): number | null {
  if (!rawValue) {
    return null;
  }

  const trimmedValue = normalizeText(rawValue);
  const regex = requireSymbol
    ? MONEY_WITH_SYMBOL_REGEX
    : MONEY_WITHOUT_SYMBOL_REGEX;
  const match = trimmedValue.match(regex);

  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1].replace(/,/g, ""));

  return isValidPrice(numericValue) ? numericValue : null;
}

function parseChargeMoneyValue(
  rawValue: string | null | undefined,
): number | null {
  if (!rawValue) {
    return null;
  }

  const match = normalizeText(rawValue).match(MONEY_WITH_SYMBOL_REGEX);

  if (!match) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1].replace(/,/g, ""));

  return Number.isFinite(numericValue) && numericValue >= 0
    ? numericValue
    : null;
}

function readMetaContent(selector: string): string | null {
  return document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s*\|\s*Rightmove\s*$/i, "")
    .replace(/\s*\|\s*[^|]+$/, "")
    .trim();
}

function getAddress(): string {
  const headingText = document.querySelector("h1")?.textContent?.trim();
  if (headingText) {
    return headingText;
  }

  const metaTitle = readMetaContent('meta[property="og:title"]');
  if (metaTitle) {
    return cleanTitle(metaTitle);
  }

  return cleanTitle(document.title);
}

function findPriceFromSelectors(): number | null {
  const selectors = [
    '[data-test="property-header-price"]',
    '[data-test="property-price"]',
    '[data-test="price"]',
    '[data-testid="price"]',
  ];

  for (const selector of selectors) {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    );

    for (const element of elements) {
      const price = parseMoneyValue(
        element.innerText || element.textContent,
        true,
      );
      if (price) {
        return price;
      }
    }
  }

  return null;
}

function findPriceFromStructuredData(): number | null {
  const metaSelectors = [
    'meta[itemprop="price"]',
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
  ];

  for (const selector of metaSelectors) {
    const price = parseMoneyValue(readMetaContent(selector), false);
    if (price) {
      return price;
    }
  }

  const scripts = Array.from(document.querySelectorAll("script"));

  for (const script of scripts) {
    const content = script.textContent ?? "";

    const displayPriceMatch = content.match(
      /"displayPrice"\s*:\s*"\u00A3\s*([\d,]+)/i,
    );
    if (displayPriceMatch) {
      const price = parseMoneyValue(displayPriceMatch[1], false);
      if (price) {
        return price;
      }
    }

    const genericPriceMatch = content.match(
      /"price"\s*:\s*"?(?<value>[\d,]+(?:\.\d+)?)/i,
    );
    const genericPrice = genericPriceMatch?.groups?.value
      ? parseMoneyValue(genericPriceMatch.groups.value, false)
      : null;

    if (genericPrice) {
      return genericPrice;
    }
  }

  return null;
}

const PRICE_FALLBACK_SCAN_ROOTS = [
  '[data-test="property-header"]',
  "header",
  "main",
  '[role="main"]',
  "#root",
] as const;

/** Exported for unit tests: scans free text for a plausible asking price (£, not pcm). */
export function scanBodyTextForAskingPriceFallback(text: string): number | null {
  const priceRegex = new RegExp(
    `${POUND_SYMBOL}\\s*([\\d,]+)(?!\\s*(pcm|pw|per))`,
    "gi",
  );
  const matches = Array.from(text.matchAll(priceRegex));

  for (const match of matches) {
    const price = parseMoneyValue(match[1], false);
    if (price) {
      return price;
    }
  }

  return null;
}

function findPriceFromPageText(): number | null {
  for (const selector of PRICE_FALLBACK_SCAN_ROOTS) {
    const root = document.querySelector(selector);
    const scopedText = root?.innerText ?? "";
    if (scopedText) {
      const scopedPrice = scanBodyTextForAskingPriceFallback(scopedText);
      if (scopedPrice) {
        return scopedPrice;
      }
    }
  }

  const bodyText = document.body?.innerText ?? "";
  return scanBodyTextForAskingPriceFallback(bodyText);
}

function getSearchBlocks(): string[] {
  const blocks = new Set<string>();

  for (const selector of SEARCH_SECTION_SELECTORS) {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    );

    for (const element of elements) {
      const text = cleanBlockText(
        element.innerText || element.textContent || "",
      );
      if (text) {
        blocks.add(text);
      }
    }
  }

  const bodyText = cleanBlockText(document.body?.innerText ?? "");
  if (bodyText) {
    blocks.add(bodyText);
  }

  return Array.from(blocks);
}

function getSearchSnippets(block: string): string[] {
  const lines = block
    .split(/[\r\n]+/)
    .flatMap((line) => line.split(/[|\u2022]/))
    .map((line) => normalizeText(line))
    .filter(Boolean);

  const snippets = new Set<string>();
  const normalizedBlock = normalizeText(block);

  if (normalizedBlock && normalizedBlock.length <= 220) {
    snippets.add(normalizedBlock);
  }

  for (let index = 0; index < lines.length; index += 1) {
    snippets.add(lines[index]);

    if (index < lines.length - 1) {
      snippets.add(normalizeText(`${lines[index]} ${lines[index + 1]}`));
    }
  }

  return Array.from(snippets);
}

function convertChargeToAnnualAmount(amount: number, unitText: string): number {
  return MONTHLY_UNIT_REGEX.test(unitText) ? amount * 12 : amount;
}

function parseChargeAmountFromSnippet(
  snippet: string,
  definition: ChargeSearchDefinition,
): number | null {
  const normalizedSnippet = normalizeText(snippet);
  const lowerSnippet = normalizedSnippet.toLowerCase();

  if (!definition.keywords.some((keyword) => lowerSnippet.includes(keyword))) {
    return null;
  }

  if (definition.peppercornPattern?.test(normalizedSnippet)) {
    return 0;
  }

  const amountWithUnitMatch = normalizedSnippet.match(
    /\u00A3\s*([\d,]+(?:\.\d+)?)\s*(pcm|per calendar month|per month|monthly|pa|p\.a\.|per annum|annum|per year|a year|annual(?:ly)?)/i,
  );

  if (amountWithUnitMatch) {
    const amount = parseChargeMoneyValue(amountWithUnitMatch[0]);
    const unit = amountWithUnitMatch[2];

    if (amount !== null) {
      return convertChargeToAnnualAmount(amount, unit);
    }
  }

  if (
    definition.annualLabelPattern?.test(normalizedSnippet) ||
    ANNUAL_UNIT_REGEX.test(normalizedSnippet)
  ) {
    const amount = parseChargeMoneyValue(normalizedSnippet);
    if (amount !== null) {
      return amount;
    }
  }

  return null;
}

function findParsedChargeField(
  definition: ChargeSearchDefinition,
  searchBlocks: string[],
): ParsedListingField | undefined {
  for (const block of searchBlocks) {
    const snippets = getSearchSnippets(block);

    for (const snippet of snippets) {
      const amount = parseChargeAmountFromSnippet(snippet, definition);

      if (amount === null) {
        continue;
      }

      return {
        value: roundToTwoDecimals(amount),
        note: "Parsed from listing",
      };
    }
  }

  return undefined;
}

function findParsedChargeFields(
  searchBlocks: string[],
): Partial<Record<ParsedListingFieldKey, ParsedListingField>> {
  const parsedFields: Partial<
    Record<ParsedListingFieldKey, ParsedListingField>
  > = {};

  for (const definition of CHARGE_SEARCH_DEFINITIONS) {
    const parsedField = findParsedChargeField(definition, searchBlocks);

    if (parsedField) {
      parsedFields[definition.fieldKey] = parsedField;
    }
  }

  return parsedFields;
}

function getGroundRentReviewFromSnippet(
  snippet: string,
): GroundRentReview | null {
  const normalizedSnippet = normalizeText(snippet);
  const lowerSnippet = normalizedSnippet.toLowerCase();

  if (
    !lowerSnippet.includes("ground rent") &&
    !lowerSnippet.includes("peppercorn")
  ) {
    return null;
  }

  // Keep this practical: we only look for simple low / mild / higher / unknown signals
  // rather than trying to make a legal judgement from listing text alone.
  if (
    GROUND_RENT_SEARCH_DEFINITION?.peppercornPattern?.test(normalizedSnippet)
  ) {
    return {
      level: "low",
      message: "Nil or peppercorn ground rent noted.",
    };
  }

  if (
    GROUND_RENT_ESCALATION_PATTERNS.some((pattern) =>
      pattern.test(normalizedSnippet),
    )
  ) {
    return {
      level: "higher",
      message:
        "Escalating ground-rent clause may need conveyancer/lender review.",
    };
  }

  if (!GROUND_RENT_SEARCH_DEFINITION) {
    return null;
  }

  const parsedAmount = parseChargeAmountFromSnippet(
    normalizedSnippet,
    GROUND_RENT_SEARCH_DEFINITION,
  );

  if (parsedAmount !== null) {
    return {
      level: parsedAmount === 0 ? "low" : "mild",
      message:
        parsedAmount === 0
          ? "Nil or peppercorn ground rent noted."
          : "Ground rent present.",
    };
  }

  return {
    level: "unknown",
    message: "Ground rent terms should be reviewed.",
  };
}

function getGroundRentReviewPriority(level: GroundRentReview["level"]): number {
  if (level === "higher") {
    return 3;
  }

  if (level === "unknown") {
    return 2;
  }

  if (level === "mild") {
    return 1;
  }

  return 0;
}

function findGroundRentReview(
  searchBlocks: string[],
  parsedGroundRentField?: ParsedListingField,
): GroundRentReview | null {
  let bestMatch: GroundRentReview | null = null;

  for (const block of searchBlocks) {
    const snippets = getSearchSnippets(block);

    for (const snippet of snippets) {
      const review = getGroundRentReviewFromSnippet(snippet);

      if (!review) {
        continue;
      }

      if (
        !bestMatch ||
        getGroundRentReviewPriority(review.level) >
          getGroundRentReviewPriority(bestMatch.level)
      ) {
        bestMatch = review;
      }
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  if (!parsedGroundRentField) {
    return null;
  }

  if (parsedGroundRentField.value === 0) {
    return {
      level: "low",
      message: "Nil or peppercorn ground rent noted.",
    };
  }

  return {
    level: "unknown",
    message: "Ground rent terms should be reviewed.",
  };
}

function parseFloorAreaSqFtFromSnippet(snippet: string): number | null {
  const normalizedSnippet = normalizeText(snippet);

  if (!/(sq|square|floor area|internal area|size)/i.test(normalizedSnippet)) {
    return null;
  }

  const sqFtMatch = normalizedSnippet.match(SQ_FT_REGEX);
  if (sqFtMatch) {
    const sqFtValue = Number.parseFloat(sqFtMatch[1].replace(/,/g, ""));
    if (Number.isFinite(sqFtValue) && sqFtValue >= 80 && sqFtValue <= 20000) {
      return roundToTwoDecimals(sqFtValue);
    }
  }

  const sqMetreMatch = normalizedSnippet.match(SQ_M_REGEX);
  if (sqMetreMatch) {
    const sqMetreValue = Number.parseFloat(sqMetreMatch[1].replace(/,/g, ""));

    if (
      Number.isFinite(sqMetreValue) &&
      sqMetreValue >= 8 &&
      sqMetreValue <= 2000
    ) {
      return roundToTwoDecimals(sqMetreValue * 10.7639);
    }
  }

  return null;
}

function findFloorAreaSqFt(searchBlocks: string[]): number | null {
  for (const block of searchBlocks) {
    const snippets = getSearchSnippets(block);

    for (const snippet of snippets) {
      const floorAreaSqFt = parseFloorAreaSqFtFromSnippet(snippet);

      if (floorAreaSqFt !== null) {
        return floorAreaSqFt;
      }
    }
  }

  return null;
}

function parseLeaseLengthTextFromSnippet(snippet: string): string | null {
  const normalizedSnippet = normalizeText(snippet);

  const remainingPatterns = [
    /remaining on lease[^.\n\r]{0,20}?(\d{2,4})\s*(?:year|years)\b/i,
    /lease[^.\n\r]{0,30}?(\d{2,4})\s*(?:year|years)\s*(?:remaining|left|unexpired)\b/i,
    /(\d{2,4})\s*(?:year|years)\s*(?:remaining|left|unexpired)\s*(?:on lease)?\b/i,
  ];

  for (const pattern of remainingPatterns) {
    const match = normalizedSnippet.match(pattern);
    const years = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;

    if (Number.isFinite(years) && years >= 20 && years <= 999) {
      return `${years} years remaining`;
    }
  }

  const leasePatterns = [
    /lease length[^.\n\r]{0,20}?(\d{2,4})\s*(?:year|years)\b/i,
    /lease term[^.\n\r]{0,20}?(\d{2,4})\s*(?:year|years)\b/i,
    /(\d{2,4})\s*(?:year|years)\s*lease\b/i,
    /leasehold[^.\n\r]{0,20}?(\d{2,4})\s*(?:year|years)\b/i,
  ];

  for (const pattern of leasePatterns) {
    const match = normalizedSnippet.match(pattern);
    const years = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;

    if (Number.isFinite(years) && years >= 20 && years <= 999) {
      return `${years} year lease`;
    }
  }

  return null;
}

function findLeaseLengthText(searchBlocks: string[]): string | null {
  for (const block of searchBlocks) {
    const snippets = getSearchSnippets(block);

    for (const snippet of snippets) {
      const leaseLengthText = parseLeaseLengthTextFromSnippet(snippet);

      if (leaseLengthText) {
        return leaseLengthText;
      }
    }
  }

  return null;
}

export async function parseRightmovePage(): Promise<RightmovePageInfo> {
  const url = window.location.href;
  const title = cleanTitle(document.title);
  const address = getAddress();
  const searchBlocks = getSearchBlocks();
  const parsedFields = findParsedChargeFields(searchBlocks);
  const groundRentReview = findGroundRentReview(
    searchBlocks,
    parsedFields.groundRentAnnual,
  );
  const floorAreaSqFt = findFloorAreaSqFt(searchBlocks);
  const leaseLengthText = findLeaseLengthText(searchBlocks);
  // Rent from DOM / PAGE_MODEL only — network fallback runs in the UI after first paint
  // so step 1/3 never blocks on many sequential rental-search fetches.
  const rentEstimate = parseRentEstimate();

  const basePageInfo = {
    url,
    title,
    address,
    floorAreaSqFt,
    leaseLengthText,
    groundRentReview,
    parsedFields,
    rentEstimate,
  };

  const selectorPrice = findPriceFromSelectors();
  if (selectorPrice) {
    return {
      ...basePageInfo,
      askingPrice: selectorPrice,
      priceSource: "page text",
    };
  }

  const structuredPrice = findPriceFromStructuredData();
  if (structuredPrice) {
    return {
      ...basePageInfo,
      askingPrice: structuredPrice,
      priceSource: "structured page data",
    };
  }

  const fallbackPrice = findPriceFromPageText();
  if (fallbackPrice) {
    return {
      ...basePageInfo,
      askingPrice: fallbackPrice,
      priceSource: "general page scan",
    };
  }

  return {
    ...basePageInfo,
    askingPrice: null,
    priceSource: "manual entry",
  };
}

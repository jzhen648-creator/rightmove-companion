import { describe, it, expect } from "vitest";
import {
  buildPricePaidUrl,
  normalisePostcode,
  parseLandRegistryDate,
  parsePricePaidResponse,
  matchListingTransactions,
  summarisePostcodeSales,
  deriveImpliedAnnualGrowth,
  derivePricePaidInsights,
} from "../pricePaid";

/**
 * Fixture item mirroring the real linked-data response shape, captured from
 * https://landregistry.data.gov.uk/data/ppi/transaction-record.json
 *   ?propertyAddress.postcode=DE23 8PL
 * Trimmed to the fields we consume plus representative noise we ignore.
 */
function fixtureItem(
  overrides: {
    price?: number;
    date?: string;
    typeSlug?: string;
    estateSlug?: string;
    categorySlug?: string;
    newBuild?: boolean;
    paon?: string | null;
    saon?: string | null;
    street?: string;
    postcode?: string;
  } = {},
) {
  const {
    price = 130000,
    date = "Fri, 14 Jun 2024",
    typeSlug = "terraced",
    estateSlug = "freehold",
    categorySlug = "standardPricePaidTransaction",
    newBuild = false,
    paon = "164",
    saon = null,
    street = "PEAR TREE STREET",
    postcode = "DE23 8PL",
  } = overrides;

  const address: Record<string, unknown> = {
    _about: "http://landregistry.data.gov.uk/data/ppi/address/abc123",
    county: "CITY OF DERBY",
    district: "CITY OF DERBY",
    street,
    town: "DERBY",
    postcode,
    type: ["http://landregistry.data.gov.uk/def/common/BS7666Address"],
  };
  if (paon !== null) address.paon = paon;
  if (saon !== null) address.saon = saon;

  return {
    _about: "http://landregistry.data.gov.uk/data/ppi/transaction/X/current",
    estateType: {
      _about: `http://landregistry.data.gov.uk/def/common/${estateSlug}`,
      prefLabel: [{ _value: estateSlug, _datatype: "langString", _lang: "en" }],
    },
    hasTransaction: "http://landregistry.data.gov.uk/data/ppi/transaction/X",
    newBuild,
    pricePaid: price,
    propertyAddress: address,
    propertyType: {
      _about: `http://landregistry.data.gov.uk/def/common/${typeSlug}`,
      prefLabel: [{ _value: typeSlug, _datatype: "langString", _lang: "en" }],
    },
    recordStatus: {
      _about: "http://landregistry.data.gov.uk/def/ppi/add",
    },
    transactionCategory: {
      _about: `http://landregistry.data.gov.uk/def/ppi/${categorySlug}`,
    },
    transactionDate: date,
    transactionId: "X",
    type: [{ _about: "http://landregistry.data.gov.uk/def/ppi/TransactionRecord" }],
  };
}

function fixtureResponse(items: unknown[]) {
  return {
    format: "linked-data-api",
    version: "0.2",
    result: {
      _about: "https://landregistry.data.gov.uk/data/ppi/transaction-record.json",
      items,
      itemsPerPage: 200,
      page: 0,
      startIndex: 1,
    },
  };
}

describe("normalisePostcode", () => {
  it("uppercases and fixes spacing", () => {
    expect(normalisePostcode("de23  8pl")).toBe("DE23 8PL");
    expect(normalisePostcode("DE238PL")).toBe("DE23 8PL");
    expect(normalisePostcode(" sw1a 1aa ")).toBe("SW1A 1AA");
  });

  it("rejects garbage", () => {
    expect(normalisePostcode("")).toBeNull();
    expect(normalisePostcode("NOT A POSTCODE")).toBeNull();
    expect(normalisePostcode(null)).toBeNull();
    expect(normalisePostcode(undefined)).toBeNull();
  });
});

describe("buildPricePaidUrl", () => {
  it("builds the endpoint URL with an encoded postcode", () => {
    const url = buildPricePaidUrl("de23 8pl");
    expect(url).toBe(
      "https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode=DE23+8PL&_pageSize=200",
    );
  });

  it("returns null for an invalid postcode", () => {
    expect(buildPricePaidUrl("nope")).toBeNull();
  });
});

describe("parseLandRegistryDate", () => {
  it('parses the "Fri, 14 Jun 2024" format', () => {
    expect(parseLandRegistryDate("Fri, 14 Jun 2024")).toBe("2024-06-14");
    expect(parseLandRegistryDate("Mon, 1 Jan 1996")).toBe("1996-01-01");
  });

  it("tolerates a missing weekday prefix", () => {
    expect(parseLandRegistryDate("14 Jun 2024")).toBe("2024-06-14");
  });

  it("returns null for unrecognised input", () => {
    expect(parseLandRegistryDate("2024-06-14")).toBeNull();
    expect(parseLandRegistryDate("")).toBeNull();
    expect(parseLandRegistryDate(undefined)).toBeNull();
    expect(parseLandRegistryDate(12345)).toBeNull();
  });
});

describe("parsePricePaidResponse", () => {
  it("parses a standard transaction with all fields", () => {
    const [t] = parsePricePaidResponse(fixtureResponse([fixtureItem()]));
    expect(t).toEqual({
      pricePaid: 130000,
      date: "2024-06-14",
      propertyType: "terraced",
      estateType: "freehold",
      newBuild: false,
      isStandardTransaction: true,
      paon: "164",
      saon: null,
      street: "PEAR TREE STREET",
      postcode: "DE23 8PL",
    });
  });

  it("sorts newest first", () => {
    const parsed = parsePricePaidResponse(
      fixtureResponse([
        fixtureItem({ date: "Mon, 3 Mar 1997", price: 28000 }),
        fixtureItem({ date: "Fri, 14 Jun 2024", price: 130000 }),
        fixtureItem({ date: "Wed, 9 Sep 2015", price: 85000 }),
      ]),
    );
    expect(parsed.map((t) => t.pricePaid)).toEqual([130000, 85000, 28000]);
  });

  it("flags category B (repossession/power-of-sale) as non-standard", () => {
    const [t] = parsePricePaidResponse(
      fixtureResponse([fixtureItem({ categorySlug: "additionalPricePaidTransaction" })]),
    );
    expect(t.isStandardTransaction).toBe(false);
  });

  it("maps flat-maisonette and leasehold, and captures saon", () => {
    const [t] = parsePricePaidResponse(
      fixtureResponse([
        fixtureItem({
          typeSlug: "flat-maisonette",
          estateSlug: "leasehold",
          paon: "ORCHARD BUILDING, 25",
          saon: "FLAT 22",
        }),
      ]),
    );
    expect(t.propertyType).toBe("flat-maisonette");
    expect(t.estateType).toBe("leasehold");
    expect(t.saon).toBe("FLAT 22");
  });

  it('maps otherPropertyType to "other" and unknown slugs to null', () => {
    const parsed = parsePricePaidResponse(
      fixtureResponse([
        fixtureItem({ typeSlug: "otherPropertyType" }),
        fixtureItem({ typeSlug: "somethingNewLandRegistryInvented" }),
      ]),
    );
    expect(parsed[0].propertyType).toBe("other");
    expect(parsed[1].propertyType).toBeNull();
  });

  it("skips items with missing/invalid price or date instead of failing the batch", () => {
    const good = fixtureItem();
    const badPrice = fixtureItem();
    // @ts-expect-error deliberately corrupting fixture
    badPrice.pricePaid = "lots";
    const badDate = fixtureItem({ date: "sometime in June" });
    const parsed = parsePricePaidResponse(fixtureResponse([badPrice, good, badDate]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].pricePaid).toBe(130000);
  });

  it("returns [] for empty results (valid postcode, no sales — e.g. SW1A 1AA)", () => {
    expect(parsePricePaidResponse(fixtureResponse([]))).toEqual([]);
  });

  it("returns [] for malformed bodies, never throws", () => {
    expect(parsePricePaidResponse(null)).toEqual([]);
    expect(parsePricePaidResponse("<html>error</html>")).toEqual([]);
    expect(parsePricePaidResponse({ result: "oops" })).toEqual([]);
    expect(parsePricePaidResponse({})).toEqual([]);
  });
});

describe("matchListingTransactions", () => {
  const house164 = fixtureItem({ paon: "164" });
  const house166 = fixtureItem({ paon: "166", price: 120000 });
  const flat22 = fixtureItem({
    paon: "ORCHARD BUILDING, 25",
    saon: "FLAT 22",
    price: 200000,
  });
  const flat23 = fixtureItem({
    paon: "ORCHARD BUILDING, 25",
    saon: "FLAT 23",
    price: 210000,
  });
  const all = parsePricePaidResponse(fixtureResponse([house164, house166, flat22, flat23]));

  it("matches a house by paon", () => {
    const matched = matchListingTransactions(all, { paon: "164" });
    expect(matched).toHaveLength(1);
    expect(matched[0].pricePaid).toBe(130000);
  });

  it("is case/whitespace-insensitive", () => {
    const matched = matchListingTransactions(all, {
      paon: " orchard building,  25 ",
      saon: "flat 22",
    });
    expect(matched).toHaveLength(1);
    expect(matched[0].pricePaid).toBe(200000);
  });

  it("does NOT match other flats in the same building when hint lacks a saon", () => {
    const matched = matchListingTransactions(all, { paon: "ORCHARD BUILDING, 25" });
    expect(matched).toHaveLength(0);
  });

  it("returns [] when there is no address hint — ambiguity means no match", () => {
    expect(matchListingTransactions(all, null)).toEqual([]);
    expect(matchListingTransactions(all, { paon: null })).toEqual([]);
  });
});

const NOW = Date.parse("2026-07-05T00:00:00Z");

describe("summarisePostcodeSales", () => {
  it("computes a recent median excluding old sales and category B", () => {
    const all = parsePricePaidResponse(
      fixtureResponse([
        fixtureItem({ price: 100000, date: "Wed, 1 Feb 2023" }),
        fixtureItem({ price: 140000, date: "Thu, 1 Feb 2024" }),
        fixtureItem({ price: 180000, date: "Sat, 1 Feb 2025" }),
        fixtureItem({
          price: 60000,
          date: "Sun, 1 Jun 2025",
          categorySlug: "additionalPricePaidTransaction",
        }),
        fixtureItem({ price: 30000, date: "Mon, 3 Mar 1997" }),
      ]),
    );
    const summary = summarisePostcodeSales(all, { now: NOW });
    expect(summary).not.toBeNull();
    expect(summary!.sampleSize).toBe(3);
    expect(summary!.medianPrice).toBe(140000);
    expect(summary!.totalSince1995).toBe(4);
    expect(summary!.latestSaleDate).toBe("2025-02-01");
    expect(summary!.periodYears).toBe(5);
  });

  it("filters to the listing property type when matching sales exist", () => {
    const all = parsePricePaidResponse(
      fixtureResponse([
        fixtureItem({ price: 100000, typeSlug: "terraced", date: "Sat, 1 Feb 2025" }),
        fixtureItem({ price: 300000, typeSlug: "detached", date: "Sat, 1 Feb 2025" }),
      ]),
    );
    const summary = summarisePostcodeSales(all, { propertyType: "terraced", now: NOW });
    expect(summary!.medianPrice).toBe(100000);
    expect(summary!.filteredByPropertyType).toBe(true);
  });

  it("falls back to all types when none match, and says so", () => {
    const all = parsePricePaidResponse(
      fixtureResponse([
        fixtureItem({ price: 300000, typeSlug: "detached", date: "Sat, 1 Feb 2025" }),
      ]),
    );
    const summary = summarisePostcodeSales(all, { propertyType: "flat-maisonette", now: NOW });
    expect(summary!.medianPrice).toBe(300000);
    expect(summary!.filteredByPropertyType).toBe(false);
  });

  it("returns null when there are no standard transactions", () => {
    const onlyRepos = parsePricePaidResponse(
      fixtureResponse([fixtureItem({ categorySlug: "additionalPricePaidTransaction" })]),
    );
    expect(summarisePostcodeSales(onlyRepos, { now: NOW })).toBeNull();
    expect(summarisePostcodeSales([], { now: NOW })).toBeNull();
  });
});

describe("deriveImpliedAnnualGrowth", () => {
  it("annualises growth over multi-year holds", () => {
    const twoYearsAgo = "2024-07-05";
    const growth = deriveImpliedAnnualGrowth(121000, 100000, twoYearsAgo, NOW);
    expect(growth).not.toBeNull();
    expect(growth!).toBeCloseTo(0.1, 2);
  });

  it("returns null for holds under a year (annualising would mislead)", () => {
    expect(deriveImpliedAnnualGrowth(110000, 100000, "2026-03-01", NOW)).toBeNull();
  });

  it("returns null for invalid inputs", () => {
    expect(deriveImpliedAnnualGrowth(0, 100000, "2020-01-01", NOW)).toBeNull();
    expect(deriveImpliedAnnualGrowth(100000, -5, "2020-01-01", NOW)).toBeNull();
    expect(deriveImpliedAnnualGrowth(100000, 100000, "not-a-date", NOW)).toBeNull();
  });
});

describe("derivePricePaidInsights (composition)", () => {
  it("produces exact-match history, postcode summary, and implied growth", () => {
    const raw = fixtureResponse([
      fixtureItem({ paon: "164", price: 100000, date: "Fri, 5 Jul 2019" }),
      fixtureItem({ paon: "166", price: 150000, date: "Sat, 1 Feb 2025" }),
    ]);
    const insights = derivePricePaidInsights({
      rawResponse: raw,
      addressHint: { paon: "164" },
      propertyType: "terraced",
      askingPrice: 140281,
      now: NOW,
    });

    expect(insights.propertyTransactions).toHaveLength(1);
    expect(insights.propertyTransactions[0].pricePaid).toBe(100000);
    expect(insights.postcodeSummary!.totalSince1995).toBe(2);
    expect(insights.impliedAnnualGrowthVsAsking).toBeCloseTo(0.05, 2);
    expect(insights.source).toBe("hm-land-registry");
  });

  it("degrades gracefully: garbage in, empty-but-valid history out", () => {
    const insights = derivePricePaidInsights({ rawResponse: "<html>503</html>", now: NOW });
    expect(insights.propertyTransactions).toEqual([]);
    expect(insights.postcodeSummary).toBeNull();
    expect(insights.impliedAnnualGrowthVsAsking).toBeNull();
  });
});

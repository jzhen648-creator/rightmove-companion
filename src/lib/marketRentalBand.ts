// Percentile band from comparable lettings (no LLM).
import { filterWholePropertyLettingComparables } from "./rentalSearchHtmlParser";
import type { ListingRentProfile, RentComparable, RentalAssessment } from "./types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  if (n === 1) {
    return sorted[0];
  }
  const index = Math.min(n - 1, Math.max(0, Math.floor((p / 100) * (n - 1))));
  return sorted[index];
}

/** Point estimate: upper-mid of the comp set (between median and top asks). */
const CENTRAL_ESTIMATE_PERCENTILE = 75;

export function deriveMarketRentalBand(
  profile: ListingRentProfile,
  comparables: RentComparable[],
): RentalAssessment | null {
  const lettings = filterWholePropertyLettingComparables(comparables);
  if (lettings.length === 0) {
    return null;
  }

  const normalizedListingType = normalizeListingPropertyType(profile.propertyType);
  let pool = lettings;
  if (normalizedListingType) {
    const sameType = lettings.filter(
      (row) => row.propertyType === normalizedListingType,
    );
    if (sameType.length >= 3) {
      pool = sameType;
    }
  }

  if (profile.beds !== null) {
    const knownBeds = pool.filter((row) => typeof row.bedrooms === "number");
    if (knownBeds.length >= 5) {
      pool = knownBeds;
    }

    const sameBeds = pool.filter((row) => row.bedrooms === profile.beds);
    if (sameBeds.length >= 3) {
      pool = sameBeds;
    } else {
      const closeBeds = pool.filter(
        (row) =>
          typeof row.bedrooms === "number" &&
          Math.abs((row.bedrooms as number) - profile.beds!) <= 1,
      );
      if (closeBeds.length >= 4) {
        pool = closeBeds;
      }
    }
  }

  if (profile.floorAreaSqFt !== null && profile.floorAreaSqFt > 0) {
    const areaKnownCount = pool.filter(
      (row) => typeof row.floorAreaSqFt === "number" && row.floorAreaSqFt > 0,
    ).length;
    const enoughAreaCoverage =
      areaKnownCount >= 5 && areaKnownCount >= Math.ceil(pool.length * 0.5);
    if (enoughAreaCoverage) {
      const areaMatched = filterBySimilarFloorArea(pool, profile.floorAreaSqFt);
      if (areaMatched.length >= 3) {
        pool = areaMatched;
      }
    }
  }

  const prices = pool.map((row) => row.price).sort((a, b) => a - b);
  const count = prices.length;
  let minMonthly = roundMoney(Math.max(50, percentile(prices, 10)));
  let maxMonthly = roundMoney(Math.max(minMonthly + 25, percentile(prices, 90)));
  const mean = prices.reduce((sum, value) => sum + value, 0) / count;
  // 75th percentile: higher than median but still ignores extreme top tail (band uses p90).
  let bestEstimateMonthly = roundMoney(
    count >= 5 ? percentile(prices, CENTRAL_ESTIMATE_PERCENTILE) : mean,
  );
  bestEstimateMonthly = Math.min(maxMonthly, Math.max(minMonthly, bestEstimateMonthly));

  const matchedBeds =
    profile.beds !== null && pool.every((row) => row.bedrooms === profile.beds);
  const matchedType =
    normalizedListingType !== null &&
    pool.every((row) => row.propertyType === normalizedListingType);
  const listingFloorAreaSqFt = profile.floorAreaSqFt;
  const matchedArea =
    listingFloorAreaSqFt !== null &&
    pool.length > 0 &&
    pool.every((row) => isWithinFloorAreaBand(row.floorAreaSqFt, listingFloorAreaSqFt));
  const weakMatching = !matchedType || !matchedBeds || count < 5;
  if (weakMatching && profile.askingPrice && profile.askingPrice > 0) {
    const yieldFloorMonthly = roundMoney(
      (profile.askingPrice * minimumGrossYieldByType(normalizedListingType)) / 12,
    );
    if (bestEstimateMonthly < yieldFloorMonthly) {
      bestEstimateMonthly = yieldFloorMonthly;
      if (minMonthly > bestEstimateMonthly) {
        minMonthly = bestEstimateMonthly;
      }
      if (maxMonthly < bestEstimateMonthly) {
        maxMonthly = bestEstimateMonthly;
      }
    }
  }

  const centralLabel =
    count >= 5
      ? `Central estimate £${bestEstimateMonthly}/pm (~${CENTRAL_ESTIMATE_PERCENTILE}th percentile of those ${count} lettings — upper-mid vs a straight median).`
      : `Central estimate £${bestEstimateMonthly}/pm (mean of ${count} letting${count === 1 ? "" : "s"}).`;

  const rationale = [
    `Market band from ${count} nearby letting ${count === 1 ? "listing" : "listings"}${
      matchedType ? ` filtered to ${normalizedListingType}` : ""
    }${
      matchedBeds ? ` filtered to ${profile.beds} bed(s)` : ""
    }${
      matchedArea ? ` filtered to similar size (~${profile.floorAreaSqFt} sq ft)` : ""
    }.`,
    `Approximate pcm range £${minMonthly}–£${maxMonthly} (10th–90th percentile of observed rents). ${centralLabel}`,
    weakMatching && profile.askingPrice
      ? `Applied a conservative price-to-rent floor for a £${roundMoney(
          profile.askingPrice,
        )} property due to weaker comparable matching.`
      : "",
  ].filter((line) => line.length > 0);

  return {
    minMonthly,
    maxMonthly,
    bestEstimateMonthly,
    rationale,
    source: "market-data",
    usedComparablesCount: count,
  };
}

function filterBySimilarFloorArea(
  comparables: RentComparable[],
  subjectFloorAreaSqFt: number,
): RentComparable[] {
  return comparables.filter((row) =>
    isWithinFloorAreaBand(row.floorAreaSqFt, subjectFloorAreaSqFt),
  );
}

function isWithinFloorAreaBand(
  comparableFloorAreaSqFt: number | null | undefined,
  subjectFloorAreaSqFt: number,
): boolean {
  if (!comparableFloorAreaSqFt || subjectFloorAreaSqFt <= 0) {
    return false;
  }
  // Keep a practical window: +/-35% with a hard minimum span for small units.
  const lower = Math.max(150, subjectFloorAreaSqFt * 0.65);
  const upper = subjectFloorAreaSqFt * 1.35;
  return comparableFloorAreaSqFt >= lower && comparableFloorAreaSqFt <= upper;
}

function minimumGrossYieldByType(
  propertyType: "house" | "flat" | null,
): number {
  if (propertyType === "house") {
    return 0.042;
  }
  if (propertyType === "flat") {
    return 0.045;
  }
  return 0.04;
}

function normalizeListingPropertyType(
  propertyType: string | null,
): "house" | "flat" | null {
  if (!propertyType) {
    return null;
  }
  if (/\b(flat|apartment|maisonette|penthouse|studio|duplex)\b/i.test(propertyType)) {
    return "flat";
  }
  if (
    /\b(house|bungalow|cottage|mews|townhouse|semi-detached|detached|terraced)\b/i.test(
      propertyType,
    )
  ) {
    return "house";
  }
  return null;
}

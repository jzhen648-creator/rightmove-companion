import { describe, expect, it } from "vitest";
import { deriveMarketRentalBand } from "../marketRentalBand";
import type { ListingRentProfile, RentComparable } from "../types";

const baseProfile: ListingRentProfile = {
  headline: "2 bed flat for sale",
  address: "1 Test Street",
  postcode: "DA1 5TL",
  beds: 2,
  baths: 1,
  propertyType: "Flat",
  tenure: "Leasehold",
  floorAreaSqFt: 800,
  keyFeatures: [],
  descriptionExcerpt: "Modern kitchen",
  askingPrice: 290000,
};

function comp(price: number, beds: number | null): RentComparable {
  return {
    price,
    description: `${beds ?? "?"} bed flat`,
    bedrooms: beds,
    source: "test",
  };
}

describe("deriveMarketRentalBand", () => {
  it("filters to same bedroom count when enough comps exist", () => {
    const comparables: RentComparable[] = [
      ...[1100, 1200, 1250, 1300, 1150].map((p) => comp(p, 2)),
      comp(800, 1),
    ];
    const result = deriveMarketRentalBand(baseProfile, comparables);
    expect(result).not.toBeNull();
    expect(result!.usedComparablesCount).toBe(5);
    expect(result!.bestEstimateMonthly).toBe(1200);
    expect(result!.minMonthly).toBeLessThanOrEqual(result!.bestEstimateMonthly);
    expect(result!.bestEstimateMonthly).toBeLessThanOrEqual(result!.maxMonthly);
  });

  it("uses median central estimate when an outlier would skew the mean", () => {
    const comparables: RentComparable[] = [
      comp(1100, 2),
      comp(1150, 2),
      comp(1200, 2),
      comp(1250, 2),
      comp(4800, 2),
    ];
    const result = deriveMarketRentalBand(baseProfile, comparables);
    expect(result).not.toBeNull();
    expect(result!.bestEstimateMonthly).toBe(1200);
  });

  it("returns null for empty comparables", () => {
    expect(deriveMarketRentalBand(baseProfile, [])).toBeNull();
  });
});

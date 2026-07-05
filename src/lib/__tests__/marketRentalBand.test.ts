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

function comp(
  price: number,
  beds: number | null,
  propertyType: "house" | "flat" | "other" | null = "flat",
  floorAreaSqFt: number | null = null,
): RentComparable {
  return {
    price,
    description: `${beds ?? "?"} bed flat`,
    bedrooms: beds,
    propertyType,
    floorAreaSqFt,
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
    expect(result!.bestEstimateMonthly).toBe(1250);
    expect(result!.minMonthly).toBeLessThanOrEqual(result!.bestEstimateMonthly);
    expect(result!.bestEstimateMonthly).toBeLessThanOrEqual(result!.maxMonthly);
  });

  it("uses ~75th percentile so a high outlier does not dominate like the mean would", () => {
    const comparables: RentComparable[] = [
      comp(1100, 2),
      comp(1150, 2),
      comp(1200, 2),
      comp(1250, 2),
      comp(4800, 2),
    ];
    const result = deriveMarketRentalBand(baseProfile, comparables);
    expect(result).not.toBeNull();
    expect(result!.bestEstimateMonthly).toBe(1250);
  });

  it("returns null for empty comparables", () => {
    expect(deriveMarketRentalBand(baseProfile, [])).toBeNull();
  });

  it("prefers same property type when enough comps exist", () => {
    const houseProfile: ListingRentProfile = {
      ...baseProfile,
      headline: "3 bed house for sale",
      propertyType: "House",
      beds: 3,
    };
    const comparables: RentComparable[] = [
      comp(2300, 3, "house"),
      comp(2400, 3, "house"),
      comp(2500, 3, "house"),
      comp(1550, 3, "flat"),
      comp(1600, 3, "flat"),
      comp(1650, 3, "flat"),
    ];
    const result = deriveMarketRentalBand(houseProfile, comparables);
    expect(result).not.toBeNull();
    expect(result!.usedComparablesCount).toBe(3);
    expect(result!.bestEstimateMonthly).toBe(2400);
    expect(result!.rationale.join(" ")).toContain("filtered to house");
  });

  it("prefers similarly sized comps when enough area data exists", () => {
    const profile: ListingRentProfile = {
      ...baseProfile,
      propertyType: "Flat",
      beds: 2,
      floorAreaSqFt: 900,
    };
    const comparables: RentComparable[] = [
      comp(1750, 2, "flat", 860),
      comp(1800, 2, "flat", 900),
      comp(1850, 2, "flat", 980),
      comp(1300, 2, "flat", 520),
      comp(2400, 2, "flat", 1500),
    ];
    const result = deriveMarketRentalBand(profile, comparables);
    expect(result).not.toBeNull();
    expect(result!.usedComparablesCount).toBe(3);
    expect(result!.bestEstimateMonthly).toBe(1800);
    expect(result!.rationale.join(" ")).toContain("filtered to similar size");
  });

  it("does not apply size filter when area coverage is sparse", () => {
    const profile: ListingRentProfile = {
      ...baseProfile,
      propertyType: "Flat",
      beds: 2,
      floorAreaSqFt: 900,
    };
    const comparables: RentComparable[] = [
      comp(1600, 2, "flat", 520),
      comp(1700, 2, "flat", null),
      comp(1750, 2, "flat", null),
      comp(1800, 2, "flat", null),
      comp(1850, 2, "flat", 1500),
    ];
    const result = deriveMarketRentalBand(profile, comparables);
    expect(result).not.toBeNull();
    expect(result!.usedComparablesCount).toBe(5);
    expect(result!.rationale.join(" ")).not.toContain("filtered to similar size");
  });

  it("applies price-based floor when matching quality is weak", () => {
    const profile: ListingRentProfile = {
      ...baseProfile,
      propertyType: "House",
      beds: 3,
      askingPrice: 500000,
      floorAreaSqFt: null,
    };
    const comparables: RentComparable[] = [
      comp(1300, null, "house"),
      comp(1400, null, "house"),
      comp(1450, null, "house"),
      comp(1500, null, "house"),
    ];
    const result = deriveMarketRentalBand(profile, comparables);
    expect(result).not.toBeNull();
    expect(result!.bestEstimateMonthly).toBeGreaterThanOrEqual(1750);
    expect(result!.rationale.join(" ")).toContain("price-to-rent floor");
  });
});

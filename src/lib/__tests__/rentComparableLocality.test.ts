import { describe, expect, it } from "vitest";
import { filterComparablesToListingPostcodeArea } from "../rentComparableLocality";
import type { ListingRentProfile, RentComparable } from "../types";

function profile(postcode: string): ListingRentProfile {
  return {
    headline: "",
    address: "",
    postcode,
    beds: 3,
    baths: null,
    propertyType: "House",
    tenure: null,
    floorAreaSqFt: null,
    keyFeatures: [],
    descriptionExcerpt: "",
    askingPrice: null,
  };
}

describe("filterComparablesToListingPostcodeArea", () => {
  it("removes comps in a different postcode letter-area (DA vs LE)", () => {
    const listing = profile("DA1 5TL");
    const comparables: RentComparable[] = [
      { price: 2000, description: "3 bed Vimy Drive Dartford DA1", source: "t" },
      { price: 1600, description: "House Burbage Hinckley LE10", source: "t" },
    ];
    const out = filterComparablesToListingPostcodeArea(listing, comparables);
    expect(out).toHaveLength(1);
    expect(out[0].description).toContain("DA1");
  });

  it("keeps adjacent districts in the same letter-area (DA1 vs DA2)", () => {
    const listing = profile("DA1 5TL");
    const comparables: RentComparable[] = [
      { price: 1800, description: "Flat Somewhere DA2 6AA", source: "t" },
    ];
    const out = filterComparablesToListingPostcodeArea(listing, comparables);
    expect(out).toHaveLength(1);
  });

  it("returns empty when every comp is in the wrong area", () => {
    const listing = profile("DA1 5TL");
    const comparables: RentComparable[] = [
      { price: 1400, description: "Livia Close Hinckley LE10", source: "t" },
    ];
    expect(filterComparablesToListingPostcodeArea(listing, comparables)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { inferZooplaTownSlug } from "../inferZooplaTownSlug";
import type { ListingRentProfile } from "../types";
import { outwardPostcodeDistrict } from "../ukPostcodeOutward";

function profile(partial: Partial<ListingRentProfile>): ListingRentProfile {
  return {
    headline: partial.headline ?? "",
    address: partial.address ?? "",
    postcode: partial.postcode ?? null,
    beds: partial.beds ?? null,
    baths: partial.baths ?? null,
    propertyType: partial.propertyType ?? null,
    tenure: partial.tenure ?? null,
    floorAreaSqFt: partial.floorAreaSqFt ?? null,
    keyFeatures: partial.keyFeatures ?? [],
    descriptionExcerpt: partial.descriptionExcerpt ?? "",
    askingPrice: partial.askingPrice ?? null,
  };
}

describe("outwardPostcodeDistrict", () => {
  it("reads outward from full postcode", () => {
    expect(outwardPostcodeDistrict("DA1 2DL")).toBe("da1");
    expect(outwardPostcodeDistrict("EC1A 1BB")).toBe("ec1a");
  });

  it("accepts outward-only input", () => {
    expect(outwardPostcodeDistrict("SW6")).toBe("sw6");
  });
});

describe("inferZooplaTownSlug", () => {
  it("picks the town before county/postcode", () => {
    const slug = inferZooplaTownSlug(
      profile({
        address: "12 Fictional Close, Dartford, Kent, DA1",
        headline: "2 bed flat for sale",
      }),
    );
    expect(slug).toBe("dartford");
  });
});

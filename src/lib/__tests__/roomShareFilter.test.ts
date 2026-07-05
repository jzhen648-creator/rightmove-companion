import { describe, expect, it } from "vitest";
import { deriveMarketRentalBand } from "../marketRentalBand";
import {
  filterWholePropertyLettingComparables,
  isLikelyRoomOrHouseShareLetting,
} from "../rentalSearchHtmlParser";
import type { ListingRentProfile, RentComparable } from "../types";

describe("isLikelyRoomOrHouseShareLetting", () => {
  it("detects room-in-shared-house copy", () => {
    expect(
      isLikelyRoomOrHouseShareLetting(
        "We are pleased to offer 3 delightful rooms within a 4-bedroom, 1-bathroom shared house",
      ),
    ).toBe(true);
  });

  it("allows typical whole-property lines", () => {
    expect(
      isLikelyRoomOrHouseShareLetting("3 bed semi-detached house to rent in Dartford DA1"),
    ).toBe(false);
    expect(
      isLikelyRoomOrHouseShareLetting("2 bedroom flat, bills included, Dartford"),
    ).toBe(false);
  });

  it("detects truncated shared-house copy used in the UI", () => {
    expect(
      isLikelyRoomOrHouseShareLetting(
        "3 bed Princes View · We are pleased to offer rooms within a 4-bed shared hou…",
      ),
    ).toBe(true);
  });
});

describe("filterWholePropertyLettingComparables", () => {
  it("removes house-share rows before banding", () => {
    const profile: ListingRentProfile = {
      headline: "3 bed house for sale",
      address: "Test",
      postcode: "DA1 1AA",
      beds: 3,
      baths: 2,
      propertyType: "House",
      tenure: "Freehold",
      floorAreaSqFt: null,
      keyFeatures: [],
      descriptionExcerpt: "",
      askingPrice: 500000,
    };
    const comparables: RentComparable[] = [
      {
        price: 2000,
        description: "3 bed house William Mundy Way Dartford",
        bedrooms: 3,
        propertyType: "house",
      },
      {
        price: 550,
        description:
          "3 delightful rooms within a 4-bedroom shared house Princes View Dartford",
        bedrooms: 3,
        propertyType: "house",
      },
    ];
    const cleaned = filterWholePropertyLettingComparables(comparables);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].price).toBe(2000);

    const band = deriveMarketRentalBand(profile, comparables);
    expect(band).not.toBeNull();
    expect(band!.usedComparablesCount).toBe(1);
    expect(band!.bestEstimateMonthly).toBe(2000);
  });

  it("drops houseshare rows when only the URL carries the signal", () => {
    const rows: RentComparable[] = [
      {
        price: 550,
        description: "3 bed Princes View Dartford",
        bedrooms: 3,
        url: "https://www.example.com/flat-share/listings/123",
      },
    ];
    expect(filterWholePropertyLettingComparables(rows)).toHaveLength(0);
  });
});

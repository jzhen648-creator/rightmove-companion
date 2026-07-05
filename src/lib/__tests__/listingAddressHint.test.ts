import { describe, it, expect } from "vitest";
import {
  deriveListingAddressHint,
  inferSoldPropertyTypeFromListing,
} from "../listingAddressHint";

describe("deriveListingAddressHint", () => {
  it("extracts house number from a typical Rightmove address", () => {
    expect(
      deriveListingAddressHint("164 Pear Tree Street, Derby, Derbyshire, DE23 8PL"),
    ).toEqual({ paon: "164" });
  });

  it("extracts house number from a bedroom-prefixed listing title", () => {
    expect(
      deriveListingAddressHint(
        "3 bedroom terraced house for sale in 164 Pear Tree Street, Derby, Derbyshire, DE23 8PL",
      ),
    ).toEqual({ paon: "164" });
  });

  it("extracts flat SAON and building PAON", () => {
    expect(
      deriveListingAddressHint(
        "Flat 22, Orchard Building, 25 Pear Tree Street, Derby, DE23 8PL",
      ),
    ).toEqual({ saon: "Flat 22", paon: "Orchard Building, 25" });
  });

  it("returns null for withheld Property in <street> addresses", () => {
    expect(
      deriveListingAddressHint("Property in Pear Tree Street, Derby, Derbyshire, DE23"),
    ).toBeNull();
    expect(
      deriveListingAddressHint(
        "2 bedroom flat for sale in Pear Tree Street, Derby, Derbyshire, DE23",
      ),
    ).toBeNull();
  });

  it("returns null for empty or unparseable input", () => {
    expect(deriveListingAddressHint("")).toBeNull();
    expect(deriveListingAddressHint(null)).toBeNull();
    expect(deriveListingAddressHint("Some Anonymous Building, Derby")).toBeNull();
  });
});

describe("inferSoldPropertyTypeFromListing", () => {
  it("detects terraced from listing text", () => {
    expect(
      inferSoldPropertyTypeFromListing(
        "3 bedroom terraced house for sale in 164 Pear Tree Street",
        "House",
      ),
    ).toBe("terraced");
  });

  it("maps flat listings to flat-maisonette", () => {
    expect(inferSoldPropertyTypeFromListing("Flat 22, Orchard Building", "Flat")).toBe(
      "flat-maisonette",
    );
  });

  it("returns null when property subtype is unknown", () => {
    expect(inferSoldPropertyTypeFromListing("164 Pear Tree Street", "House")).toBeNull();
  });
});

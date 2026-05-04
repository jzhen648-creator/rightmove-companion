import { describe, expect, it } from "vitest";
import { scanBodyTextForAskingPriceFallback } from "../pageParser";

describe("scanBodyTextForAskingPriceFallback", () => {
  it("prefers a property-scale price over small amounts", () => {
    const text = "Guide price £275,000. Other £500 pcm rent nearby.";
    expect(scanBodyTextForAskingPriceFallback(text)).toBe(275000);
  });

  it("returns null when no plausible asking price", () => {
    expect(scanBodyTextForAskingPriceFallback("No money here")).toBeNull();
  });
});

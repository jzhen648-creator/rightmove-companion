import { describe, it, expect } from "vitest";
import {
  clampDepositAmount,
  clampDepositPercent,
  getDepositAmountFromPercent,
  getDepositPercentFromAmount,
  syncDepositValues
} from "../deposit";
import { DEFAULT_INPUTS } from "../defaults";

describe("clampDepositPercent", () => {
  it("clamps negative values to 0", () => {
    expect(clampDepositPercent(-5)).toBe(0);
  });

  it("clamps values above 100 to 100", () => {
    expect(clampDepositPercent(110)).toBe(100);
  });

  it("passes through valid values unchanged", () => {
    expect(clampDepositPercent(25)).toBe(25);
  });
});

describe("clampDepositAmount", () => {
  it("clamps deposit above the asking price down to the price", () => {
    expect(clampDepositAmount(200000, 250000)).toBe(200000);
  });

  it("allows deposit exactly equal to the asking price", () => {
    expect(clampDepositAmount(200000, 200000)).toBe(200000);
  });

  it("returns 0 for a negative deposit", () => {
    expect(clampDepositAmount(200000, -1000)).toBe(0);
  });

  it("does not clamp when asking price is 0", () => {
    expect(clampDepositAmount(0, 50000)).toBe(50000);
  });
});

describe("getDepositAmountFromPercent", () => {
  it("converts 25% of £200k to £50,000", () => {
    expect(getDepositAmountFromPercent(200000, 25)).toBe(50000);
  });

  it("returns 0 when asking price is 0", () => {
    expect(getDepositAmountFromPercent(0, 25)).toBe(0);
  });

  it("clamps the percent before converting", () => {
    expect(getDepositAmountFromPercent(200000, 150)).toBe(200000);
  });
});

describe("getDepositPercentFromAmount", () => {
  it("converts £50k of £200k to 25%", () => {
    expect(getDepositPercentFromAmount(200000, 50000)).toBe(25);
  });

  it("returns 0 when asking price is 0", () => {
    expect(getDepositPercentFromAmount(0, 50000)).toBe(0);
  });
});

describe("syncDepositValues", () => {
  it("derives depositAmount from percent when mode is percent", () => {
    const result = syncDepositValues({
      ...DEFAULT_INPUTS,
      askingPrice: 200000,
      depositPercent: 25,
      depositInputMode: "percent"
    });
    expect(result.depositAmount).toBe(50000);
  });

  it("derives depositPercent from amount when mode is amount", () => {
    const result = syncDepositValues({
      ...DEFAULT_INPUTS,
      askingPrice: 200000,
      depositAmount: 50000,
      depositInputMode: "amount"
    });
    expect(result.depositPercent).toBe(25);
  });

  it("handles a zero asking price without throwing", () => {
    const result = syncDepositValues({
      ...DEFAULT_INPUTS,
      askingPrice: 0,
      depositPercent: 25,
      depositInputMode: "percent"
    });
    expect(result.depositAmount).toBe(0);
  });
});

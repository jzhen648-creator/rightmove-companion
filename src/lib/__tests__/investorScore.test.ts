import { describe, expect, it } from "vitest";
import { calculateInvestorScore } from "../investorScore";

describe("calculateInvestorScore", () => {
  it("returns a strong verdict for a clearly healthy deal", () => {
    const result = calculateInvestorScore({
      monthlyCashFlow: 400,
      cashOnCashReturn: 14,
      interestCoverageRatio: 1.6,
      stressedMonthlyCashFlowPlusOne: 200,
      stressedMonthlyCashFlowPlusTwo: 50,
      hasPurchasePrice: true,
      hasRentEstimate: true,
      hasMortgageAssumptions: true,
      hasOwnershipCostReview: true,
      additionalRecurringCostReviewCount: 2,
      parsedListingSignalCount: 4,
    });

    expect(result.investorScore).toBeGreaterThanOrEqual(75);
    expect(["strong", "exceptional", "firm"]).toContain(result.verdict);
    expect(["high", "medium"]).toContain(result.scoreConfidence);
  });

  it("returns skip for weak fundamentals", () => {
    const result = calculateInvestorScore({
      monthlyCashFlow: -200,
      cashOnCashReturn: -5,
      interestCoverageRatio: 0.95,
      stressedMonthlyCashFlowPlusOne: -300,
      stressedMonthlyCashFlowPlusTwo: -400,
      hasPurchasePrice: true,
      hasRentEstimate: true,
      hasMortgageAssumptions: true,
      hasOwnershipCostReview: false,
      additionalRecurringCostReviewCount: 0,
      parsedListingSignalCount: 0,
    });

    expect(result.verdict).toBe("skip");
    expect(result.investorScore).toBeLessThan(50);
  });
});

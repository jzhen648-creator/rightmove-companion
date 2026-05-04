import { describe, it, expect } from "vitest";
import { calculateInvestmentMetrics } from "../calculations";
import { DEFAULT_INPUTS } from "../defaults";
import type { InvestmentInputs } from "../types";

function makeInputs(overrides: Partial<InvestmentInputs>): InvestmentInputs {
  return { ...DEFAULT_INPUTS, ...overrides };
}

describe("calculateInvestmentMetrics — mortgage payments", () => {
  it("computes interest-only monthly payment correctly", () => {
    // £150k loan at 5% IO = 150000 * 0.05 / 12 = £625
    const results = calculateInvestmentMetrics(
      makeInputs({ askingPrice: 200000, depositPercent: 25, depositAmount: 50000, mortgageRatePercent: 5 })
    );
    expect(results.monthlyMortgagePayment).toBe(625);
  });

  it("returns zero mortgage payment when deposit covers the full price", () => {
    const results = calculateInvestmentMetrics(
      makeInputs({ askingPrice: 200000, depositAmount: 200000, depositPercent: 100, depositInputMode: "amount" })
    );
    expect(results.monthlyMortgagePayment).toBe(0);
    expect(results.loanAmount).toBe(0);
    expect(results.interestCoverageRatio).toBeNull();
  });
});

describe("calculateInvestmentMetrics — gross yield", () => {
  it("computes gross yield correctly", () => {
    // £1,200/month on a £200k property = (14400/200000)*100 = 7.2%
    const results = calculateInvestmentMetrics(
      makeInputs({ askingPrice: 200000, monthlyRent: 1200 })
    );
    expect(results.grossYield).toBe(7.2);
  });

  it("returns 0 gross yield when asking price is 0", () => {
    const results = calculateInvestmentMetrics(makeInputs({ askingPrice: 0, monthlyRent: 1200 }));
    expect(results.grossYield).toBe(0);
  });
});

describe("calculateInvestmentMetrics — cash flow", () => {
  it("returns negative cash flow when costs exceed rent", () => {
    // Low rent, high mortgage — should produce negative monthly cash flow
    const results = calculateInvestmentMetrics(
      makeInputs({
        askingPrice: 300000,
        depositPercent: 25,
        depositAmount: 75000,
        monthlyRent: 800,
        mortgageRatePercent: 6
      })
    );
    expect(results.monthlyCashFlow).toBeLessThan(0);
  });

  it("returns positive cash flow on a well-priced deal", () => {
    // £1,200 rent, £150k loan at 5% IO = £625/month mortgage
    // Management 10% + void 5% = 15% of rent = £180/month
    // Monthly CF = 1200 - 625 - 180 = £395
    const results = calculateInvestmentMetrics(
      makeInputs({
        askingPrice: 200000,
        depositPercent: 25,
        depositAmount: 50000,
        monthlyRent: 1200,
        mortgageRatePercent: 5
      })
    );
    expect(results.monthlyCashFlow).toBe(395);
    expect(results.annualCashFlow).toBe(4740);
  });
});

describe("calculateInvestmentMetrics — ICR", () => {
  it("computes ICR as annual rent divided by annual mortgage cost", () => {
    // £1,200/month rent = £14,400/year; £625/month mortgage = £7,500/year → ICR = 1.92
    const results = calculateInvestmentMetrics(
      makeInputs({
        askingPrice: 200000,
        depositPercent: 25,
        depositAmount: 50000,
        monthlyRent: 1200,
        mortgageRatePercent: 5
      })
    );
    expect(results.interestCoverageRatio).toBe(1.92);
  });

  it("returns null ICR when there is no loan", () => {
    const results = calculateInvestmentMetrics(
      makeInputs({ askingPrice: 200000, depositAmount: 200000, depositPercent: 100, depositInputMode: "amount" })
    );
    expect(results.interestCoverageRatio).toBeNull();
  });
});

describe("calculateInvestmentMetrics — stressed cash flows", () => {
  it("stressed values are lower than the base cash flow", () => {
    const results = calculateInvestmentMetrics(
      makeInputs({
        askingPrice: 200000,
        depositPercent: 25,
        depositAmount: 50000,
        monthlyRent: 1200,
        mortgageRatePercent: 5
      })
    );
    expect(results.stressedMonthlyCashFlowPlusOne).toBeLessThan(results.monthlyCashFlow);
    expect(results.stressedMonthlyCashFlowPlusTwo).toBeLessThan(results.stressedMonthlyCashFlowPlusOne);
  });
});

describe("calculateInvestmentMetrics — SDLT in total cash invested", () => {
  it("includes SDLT in total cash invested", () => {
    // Personal BTL additional-property: higher SDLT rates
    const results = calculateInvestmentMetrics(
      makeInputs({
        askingPrice: 200000,
        depositPercent: 25,
        depositAmount: 50000,
        legalFees: 0,
        brokerFee: 0,
        refurbCost: 0
      })
    );
    // SDLT on £200k additional property: 5% on £125k + 7% on £75k = £6,250 + £5,250 = £11,500
    expect(results.sdltAmount).toBe(11500);
    expect(results.totalCashInvested).toBe(50000 + 11500);
  });
});

describe("calculateInvestmentMetrics — verdict", () => {
  it("returns skip verdict when monthly cash flow is deeply negative", () => {
    const results = calculateInvestmentMetrics(
      makeInputs({
        askingPrice: 500000,
        depositPercent: 25,
        depositAmount: 125000,
        monthlyRent: 800,
        mortgageRatePercent: 6.5
      })
    );
    expect(results.verdict).toBe("skip");
  });

  it("returns a non-skip verdict for a well-performing deal", () => {
    const results = calculateInvestmentMetrics(
      makeInputs({
        askingPrice: 150000,
        depositPercent: 25,
        depositAmount: 37500,
        monthlyRent: 1100,
        mortgageRatePercent: 5
      })
    );
    expect(results.verdict).not.toBe("skip");
  });
});

import { describe, expect, it } from "vitest";
import {
  normaliseImportedDeal,
  parseDealRecordsForImport,
  serialiseDealsForExport,
} from "../savedDealsCodec";
import type { DealRecord } from "../types";

const minimalDeal: DealRecord = {
  id: "https://example.com/p/1",
  pageUrl: "https://example.com/p/1",
  title: "Test",
  address: "1 Test St",
  savedAt: "2026-01-01T00:00:00.000Z",
  inputs: {
    propertyGoal: "buy-to-let",
    askingPrice: 250000,
    monthlyRent: 1200,
    depositAmount: 62500,
    depositPercent: 25,
    depositInputMode: "percent",
    mortgageRatePercent: 5,
    mortgageType: "interest-only",
    mortgageTermYears: 25,
    purchaseStructure: "personal-name",
    personalSdltStatus: "additional-property",
    sdltResidenceType: "main-residence",
    serviceChargeAnnual: 0,
    groundRentAnnual: 0,
    managementPercent: 10,
    maintenanceAllowanceAnnual: 0,
    voidPercent: 5,
    legalFees: 1500,
    brokerFee: 500,
    refurbCost: 0,
    insuranceAnnual: 0,
    miscAnnualCost: 0,
  },
  results: {
    grossYield: 5.76,
    monthlyMortgagePayment: 781.25,
    monthlyCashFlow: 200,
    annualCashFlow: 2400,
    totalCashInvested: 80000,
    cashOnCashReturn: 3,
    annualMortgageCost: 9375,
    loanAmount: 187500,
    depositAmount: 62500,
    sdltAmount: 10000,
    monthlyOperatingCosts: 150,
    annualOperatingCosts: 1800,
    interestCoverageRatio: 1.54,
    stressedMonthlyCashFlowPlusOne: 100,
    stressedMonthlyCashFlowPlusTwo: 0,
    investorScore: 70,
    scoreConfidence: "medium",
    verdict: "firm",
  },
  notes: "Hello",
};

describe("savedDealsCodec", () => {
  it("round-trips export text", () => {
    const text = serialiseDealsForExport([minimalDeal]);
    const parsed = JSON.parse(text) as unknown;
    const { deals, skipped } = parseDealRecordsForImport(parsed);
    expect(skipped).toBe(0);
    expect(deals).toHaveLength(1);
    expect(deals[0]?.id).toBe(minimalDeal.id);
    expect(deals[0]?.notes).toBe("Hello");
  });

  it("rejects invalid top-level JSON shape", () => {
    const { deals, errors } = parseDealRecordsForImport({ foo: 1 });
    expect(deals).toHaveLength(0);
    expect(errors[0]).toMatch(/array/i);
  });

  it("normaliseImportedDeal returns null for bad rows", () => {
    expect(normaliseImportedDeal(null)).toBeNull();
    expect(normaliseImportedDeal({ id: "", pageUrl: "x" })).toBeNull();
  });
});

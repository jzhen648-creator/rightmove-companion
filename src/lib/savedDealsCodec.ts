// Validate and normalise saved deals for import / backup.
import type { DealRecord, InvestmentInputs, InvestmentResults } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function normaliseInvestmentInputs(raw: unknown): InvestmentInputs | null {
  if (!isRecord(raw)) {
    return null;
  }

  const propertyGoal = raw.propertyGoal === "standard-purchase" ? "standard-purchase" : "buy-to-let";

  return {
    propertyGoal,
    askingPrice: Math.max(0, pickNumber(raw.askingPrice)),
    monthlyRent: Math.max(0, pickNumber(raw.monthlyRent)),
    depositAmount: Math.max(0, pickNumber(raw.depositAmount)),
    depositPercent: Math.max(0, pickNumber(raw.depositPercent, 25)),
    depositInputMode: raw.depositInputMode === "percent" ? "percent" : "amount",
    mortgageRatePercent: Math.max(0, pickNumber(raw.mortgageRatePercent, 5)),
    mortgageType: raw.mortgageType === "repayment" ? "repayment" : "interest-only",
    mortgageTermYears: Math.max(0, pickNumber(raw.mortgageTermYears, 25)),
    purchaseStructure:
      raw.purchaseStructure === "limited-company" ? "limited-company" : "personal-name",
    personalSdltStatus:
      raw.personalSdltStatus === "only-residential-property"
        ? "only-residential-property"
        : "additional-property",
    sdltResidenceType:
      raw.sdltResidenceType === "additional-property" ? "additional-property" : "main-residence",
    serviceChargeAnnual: Math.max(0, pickNumber(raw.serviceChargeAnnual)),
    groundRentAnnual: Math.max(0, pickNumber(raw.groundRentAnnual)),
    managementPercent: Math.max(0, pickNumber(raw.managementPercent)),
    maintenanceAllowanceAnnual: Math.max(0, pickNumber(raw.maintenanceAllowanceAnnual)),
    voidPercent: Math.max(0, pickNumber(raw.voidPercent)),
    legalFees: Math.max(0, pickNumber(raw.legalFees)),
    brokerFee: Math.max(0, pickNumber(raw.brokerFee)),
    refurbCost: Math.max(0, pickNumber(raw.refurbCost)),
    insuranceAnnual: Math.max(0, pickNumber(raw.insuranceAnnual)),
    miscAnnualCost: Math.max(0, pickNumber(raw.miscAnnualCost)),
  };
}

function normaliseVerdict(value: unknown): InvestmentResults["verdict"] {
  if (
    value === "skip" ||
    value === "borderline" ||
    value === "firm" ||
    value === "strong" ||
    value === "exceptional"
  ) {
    return value;
  }
  return "skip";
}

function normaliseConfidence(value: unknown): InvestmentResults["scoreConfidence"] {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "low";
}

function normaliseInvestmentResults(raw: unknown): InvestmentResults | null {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    grossYield: pickNumber(raw.grossYield),
    monthlyMortgagePayment: pickNumber(raw.monthlyMortgagePayment),
    monthlyCashFlow: pickNumber(raw.monthlyCashFlow),
    annualCashFlow: pickNumber(raw.annualCashFlow),
    totalCashInvested: pickNumber(raw.totalCashInvested),
    cashOnCashReturn: pickNumber(raw.cashOnCashReturn),
    annualMortgageCost: pickNumber(raw.annualMortgageCost),
    loanAmount: pickNumber(raw.loanAmount),
    depositAmount: pickNumber(raw.depositAmount),
    sdltAmount: pickNumber(raw.sdltAmount),
    monthlyOperatingCosts: pickNumber(raw.monthlyOperatingCosts),
    annualOperatingCosts: pickNumber(raw.annualOperatingCosts),
    interestCoverageRatio:
      raw.interestCoverageRatio === null || raw.interestCoverageRatio === undefined
        ? null
        : pickNumber(raw.interestCoverageRatio),
    stressedMonthlyCashFlowPlusOne: pickNumber(raw.stressedMonthlyCashFlowPlusOne),
    stressedMonthlyCashFlowPlusTwo: pickNumber(raw.stressedMonthlyCashFlowPlusTwo),
    investorScore: pickNumber(raw.investorScore),
    scoreConfidence: normaliseConfidence(raw.scoreConfidence),
    verdict: normaliseVerdict(raw.verdict),
  };
}

export function normaliseImportedDeal(raw: unknown): DealRecord | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  const pageUrl = typeof raw.pageUrl === "string" && raw.pageUrl.trim() ? raw.pageUrl.trim() : null;
  const title = typeof raw.title === "string" ? raw.title : "";
  const address = typeof raw.address === "string" ? raw.address : "";
  const savedAt =
    typeof raw.savedAt === "string" && raw.savedAt.trim() ? raw.savedAt.trim() : new Date().toISOString();

  if (!id || !pageUrl) {
    return null;
  }

  const inputs = normaliseInvestmentInputs(raw.inputs);
  const results = normaliseInvestmentResults(raw.results);

  if (!inputs || !results) {
    return null;
  }

  const notes =
    typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim().slice(0, 2000) : undefined;

  return {
    id,
    pageUrl,
    title,
    address,
    savedAt,
    inputs,
    results,
    notes,
  };
}

export function parseDealRecordsForImport(raw: unknown): {
  deals: DealRecord[];
  skipped: number;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(raw)) {
    return { deals: [], skipped: 0, errors: ["Top-level JSON must be an array of deals."] };
  }

  const deals: DealRecord[] = [];
  let skipped = 0;

  raw.forEach((item, index) => {
    const deal = normaliseImportedDeal(item);
    if (deal) {
      deals.push(deal);
    } else {
      skipped += 1;
      errors.push(`Row ${index + 1}: missing id/pageUrl or invalid inputs/results.`);
    }
  });

  return { deals, skipped, errors };
}

export function serialiseDealsForExport(deals: DealRecord[]): string {
  return `${JSON.stringify(deals, null, 2)}\n`;
}

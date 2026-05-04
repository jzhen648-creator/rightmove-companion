// Shared TypeScript types used across the extension.
export type MortgageType = "interest-only" | "repayment";
export type DepositInputMode = "amount" | "percent";
export type PropertyGoal = "buy-to-let" | "standard-purchase";
export type PurchaseStructure = "personal-name" | "limited-company";
export type PersonalSdltStatus =
  | "only-residential-property"
  | "additional-property";
export type SdltResidenceType = "main-residence" | "additional-property";
export type ParsedListingFieldKey = "serviceChargeAnnual" | "groundRentAnnual";
export type GroundRentRiskLevel = "low" | "mild" | "higher" | "unknown";
export type ScoreConfidence = "high" | "medium" | "low";

export type Verdict = "skip" | "borderline" | "firm" | "strong" | "exceptional";

export interface ParsedListingField {
  value: number;
  note: string;
}

export interface RentComparable {
  price: number;
  description: string;
  url?: string;
  availableFrom?: string;
  source?: string;
  /** Parsed from letting card text when possible (e.g. "2 bed flat"). */
  bedrooms?: number | null;
}

/** Structured for-sale listing context used for rent benchmarking. */
export interface ListingRentProfile {
  headline: string;
  address: string;
  postcode: string | null;
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  tenure: string | null;
  floorAreaSqFt: number | null;
  keyFeatures: string[];
  descriptionExcerpt: string;
  askingPrice: number | null;
}

/** Output from comparable market stats and/or LLM refinement. */
export interface RentalAssessment {
  minMonthly: number;
  maxMonthly: number;
  bestEstimateMonthly: number;
  rationale: string[];
  source: "market-data" | "llm";
  usedComparablesCount: number;
}

export interface RentEstimate {
  estimate: number;
  min: number;
  max: number;
  comparables: RentComparable[];
  source: string;
}

export interface GroundRentReview {
  level: GroundRentRiskLevel;
  message: string;
}

export interface InvestmentInputs {
  propertyGoal: PropertyGoal;
  askingPrice: number;
  monthlyRent: number;
  depositAmount: number;
  depositPercent: number;
  depositInputMode: DepositInputMode;
  mortgageRatePercent: number;
  // Property goal now decides which mortgage basis is used in the calculator.
  mortgageType: MortgageType;
  mortgageTermYears: number;
  purchaseStructure: PurchaseStructure;
  personalSdltStatus: PersonalSdltStatus;
  sdltResidenceType: SdltResidenceType;
  serviceChargeAnnual: number;
  groundRentAnnual: number;
  managementPercent: number;
  maintenanceAllowanceAnnual: number;
  voidPercent: number;
  legalFees: number;
  brokerFee: number;
  refurbCost: number;
  insuranceAnnual: number;
  miscAnnualCost: number;
}

export interface InvestmentResults {
  grossYield: number;
  monthlyMortgagePayment: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  totalCashInvested: number;
  cashOnCashReturn: number;
  annualMortgageCost: number;
  loanAmount: number;
  depositAmount: number;
  sdltAmount: number;
  monthlyOperatingCosts: number;
  annualOperatingCosts: number;
  interestCoverageRatio: number | null;
  stressedMonthlyCashFlowPlusOne: number;
  stressedMonthlyCashFlowPlusTwo: number;
  investorScore: number;
  scoreConfidence: ScoreConfidence;
  verdict: Verdict;
}

export interface RightmovePageInfo {
  url: string;
  title: string;
  address: string;
  askingPrice: number | null;
  priceSource: string;
  floorAreaSqFt: number | null;
  leaseLengthText: string | null;
  groundRentReview: GroundRentReview | null;
  parsedFields: Partial<Record<ParsedListingFieldKey, ParsedListingField>>;
  rentEstimate: RentEstimate | null;
}

export interface DealRecord {
  id: string;
  pageUrl: string;
  title: string;
  address: string;
  savedAt: string;
  inputs: InvestmentInputs;
  results: InvestmentResults;
  /** Optional free-text note; stored only for saved deals. */
  notes?: string;
}

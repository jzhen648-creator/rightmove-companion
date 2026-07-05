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
  /** Normalized broad type for matching (e.g. "house", "flat"). */
  propertyType?: "house" | "flat" | "other" | null;
  /** Comparable floor area normalized to square feet when available. */
  floorAreaSqFt?: number | null;
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

/** HM Land Registry Price Paid — property type slug. */
export type SoldPropertyType =
  | "detached"
  | "semi-detached"
  | "terraced"
  | "flat-maisonette"
  | "other";

export interface SoldTransaction {
  pricePaid: number;
  /** ISO date (YYYY-MM-DD) parsed from Land Registry's "Fri, 14 Jun 2024" format. */
  date: string;
  propertyType: SoldPropertyType | null;
  estateType: "freehold" | "leasehold" | null;
  newBuild: boolean;
  /**
   * True for standard residential sales (category A). False for category B
   * (repossessions, power-of-sale, some buy-to-let transfers) — excluded
   * from comps by default because they skew the median down.
   */
  isStandardTransaction: boolean;
  paon: string | null;
  saon: string | null;
  street: string | null;
  postcode: string;
}

export interface PostcodeSalesSummary {
  sampleSize: number;
  medianPrice: number | null;
  latestSaleDate: string | null;
  /** Recency window the median was computed over. */
  periodYears: number;
  /** Total transactions in the postcode across the full dataset (since 1995). */
  totalSince1995: number;
  /** True when the summary was filtered to the listing's property type. */
  filteredByPropertyType: boolean;
}

export interface SoldPriceHistory {
  /** Exact-address matches for the listing, newest first. Empty when unknown. */
  propertyTransactions: SoldTransaction[];
  postcodeSummary: PostcodeSalesSummary | null;
  /**
   * Annualised growth implied by asking price vs the most recent exact-match
   * sale. Null when there is no exact match or the sale is <1 year old
   * (annualising very short periods produces junk numbers).
   */
  impliedAnnualGrowthVsAsking: number | null;
  fetchedAt: number;
  source: "hm-land-registry";
}

export interface ListingAddressHint {
  /** Primary addressable object name — house number or building name. */
  paon?: string | null;
  /** Secondary — flat/unit within a building. */
  saon?: string | null;
}

/** Per-listing draft persisted in chrome.storage.local. */
export interface PageDraft {
  inputs: InvestmentInputs;
  soldPriceHistory?: SoldPriceHistory | null;
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

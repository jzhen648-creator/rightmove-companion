// Pure calculation helpers. Keeping these out of the UI makes future upgrades easier.
import { getUsableDepositAmount } from "./deposit";
import { calculateInvestorScore } from "./investorScore";
import { calculateEnglandNorthernIrelandSdltForInputs } from "./stampDuty";
import type { InvestmentInputs, InvestmentResults, RightmovePageInfo } from "./types";
import { roundToTwoDecimals } from "./utils";

function getLoanAmount(askingPrice: number, depositAmount: number): number {
  return Math.max(0, askingPrice - depositAmount);
}

function getMonthlyMortgagePayment(inputs: InvestmentInputs, loanAmount: number): number {
  return getMonthlyMortgagePaymentAtRate(inputs, loanAmount, inputs.mortgageRatePercent);
}

function getMonthlyMortgagePaymentAtRate(
  inputs: InvestmentInputs,
  loanAmount: number,
  annualRatePercent: number
): number {
  const annualRateToUse = Math.max(0, annualRatePercent) / 100;
  const monthlyRateToUse = annualRateToUse / 12;
  const numberOfPayments = Math.max(1, inputs.mortgageTermYears * 12);

  if (loanAmount <= 0) {
    return 0;
  }

  if (inputs.mortgageType === "interest-only") {
    return loanAmount * monthlyRateToUse;
  }

  if (monthlyRateToUse === 0) {
    return loanAmount / numberOfPayments;
  }

  return (loanAmount * monthlyRateToUse) / (1 - Math.pow(1 + monthlyRateToUse, -numberOfPayments));
}

export function countParsedListingSignals(pageInfo?: RightmovePageInfo): number {
  if (!pageInfo) {
    return 0;
  }

  let signals = 0;

  if (pageInfo.askingPrice && pageInfo.priceSource !== "manual entry") {
    signals += 1;
  }

  if (pageInfo.parsedFields.serviceChargeAnnual) {
    signals += 1;
  }

  if (pageInfo.parsedFields.groundRentAnnual || pageInfo.groundRentReview) {
    signals += 1;
  }

  if (pageInfo.floorAreaSqFt) {
    signals += 1;
  }

  if (pageInfo.leaseLengthText) {
    signals += 1;
  }

  return signals;
}

function hasMortgageAssumptions(inputs: InvestmentInputs, loanAmount: number): boolean {
  if (loanAmount <= 0) {
    return true;
  }

  return (
    (inputs.depositAmount > 0 || inputs.depositPercent > 0) &&
    (inputs.mortgageType === "interest-only" || inputs.mortgageTermYears > 0)
  );
}

function hasOwnershipCostReview(inputs: InvestmentInputs, pageInfo?: RightmovePageInfo): boolean {
  return Boolean(
    inputs.serviceChargeAnnual > 0 ||
      inputs.groundRentAnnual > 0 ||
      pageInfo?.parsedFields.serviceChargeAnnual ||
      pageInfo?.parsedFields.groundRentAnnual ||
      pageInfo?.groundRentReview
  );
}

function countAdditionalRecurringCostReviews(inputs: InvestmentInputs): number {
  return [
    inputs.maintenanceAllowanceAnnual > 0,
    inputs.insuranceAnnual > 0,
    inputs.miscAnnualCost > 0
  ].filter(Boolean).length;
}

export function calculateInvestmentMetrics(
  inputs: InvestmentInputs,
  pageInfo?: RightmovePageInfo
): InvestmentResults {
  const askingPrice = Math.max(0, inputs.askingPrice);
  const monthlyRent = Math.max(0, inputs.monthlyRent);
  const annualRent = monthlyRent * 12;
  const depositAmount = getUsableDepositAmount(askingPrice, inputs.depositAmount);
  const loanAmount = getLoanAmount(askingPrice, depositAmount);
  const monthlyMortgagePayment = getMonthlyMortgagePayment(inputs, loanAmount);
  const annualMortgageCost = monthlyMortgagePayment * 12;
  const sdltAmount = calculateEnglandNorthernIrelandSdltForInputs(askingPrice, inputs);

  // Percent-based recurring costs move with rent.
  const annualPercentCosts =
    annualRent * ((Math.max(0, inputs.managementPercent) + Math.max(0, inputs.voidPercent)) / 100);

  // Fixed recurring costs are annual pound amounts.
  const annualFixedRecurringCosts =
    Math.max(0, inputs.serviceChargeAnnual) +
    Math.max(0, inputs.groundRentAnnual) +
    Math.max(0, inputs.maintenanceAllowanceAnnual) +
    Math.max(0, inputs.insuranceAnnual) +
    Math.max(0, inputs.miscAnnualCost);

  const annualOperatingCosts = annualPercentCosts + annualFixedRecurringCosts;
  const monthlyOperatingCosts = annualOperatingCosts / 12;
  const grossYield = askingPrice > 0 ? (annualRent / askingPrice) * 100 : 0;
  const annualCashFlow = annualRent - annualMortgageCost - annualOperatingCosts;
  const monthlyCashFlow = annualCashFlow / 12;
  const stressedMonthlyCashFlowPlusOne =
    monthlyRent -
    monthlyOperatingCosts -
    getMonthlyMortgagePaymentAtRate(inputs, loanAmount, inputs.mortgageRatePercent + 1);
  const stressedMonthlyCashFlowPlusTwo =
    monthlyRent -
    monthlyOperatingCosts -
    getMonthlyMortgagePaymentAtRate(inputs, loanAmount, inputs.mortgageRatePercent + 2);
  const interestCoverageRatio = annualMortgageCost > 0 ? annualRent / annualMortgageCost : null;

  // Upfront costs do not reduce annual cash flow. They only increase cash invested.
  const totalCashInvested =
    depositAmount +
    Math.max(0, inputs.legalFees) +
    Math.max(0, inputs.brokerFee) +
    Math.max(0, inputs.refurbCost) +
    sdltAmount;
  const cashOnCashReturn =
    totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0;
  const parsedListingSignalCount = countParsedListingSignals(pageInfo);

  const scoreResult = calculateInvestorScore({
    monthlyCashFlow,
    cashOnCashReturn,
    interestCoverageRatio,
    stressedMonthlyCashFlowPlusOne,
    stressedMonthlyCashFlowPlusTwo,
    hasPurchasePrice: askingPrice > 0,
    hasRentEstimate: inputs.propertyGoal !== "buy-to-let" || monthlyRent > 0,
    hasMortgageAssumptions: hasMortgageAssumptions(inputs, loanAmount),
    hasOwnershipCostReview: hasOwnershipCostReview(inputs, pageInfo),
    additionalRecurringCostReviewCount: countAdditionalRecurringCostReviews(inputs),
    parsedListingSignalCount
  });

  return {
    grossYield: roundToTwoDecimals(grossYield),
    monthlyMortgagePayment: roundToTwoDecimals(monthlyMortgagePayment),
    monthlyCashFlow: roundToTwoDecimals(monthlyCashFlow),
    annualCashFlow: roundToTwoDecimals(annualCashFlow),
    totalCashInvested: roundToTwoDecimals(totalCashInvested),
    cashOnCashReturn: roundToTwoDecimals(cashOnCashReturn),
    annualMortgageCost: roundToTwoDecimals(annualMortgageCost),
    loanAmount: roundToTwoDecimals(loanAmount),
    depositAmount: roundToTwoDecimals(depositAmount),
    sdltAmount: roundToTwoDecimals(sdltAmount),
    monthlyOperatingCosts: roundToTwoDecimals(monthlyOperatingCosts),
    annualOperatingCosts: roundToTwoDecimals(annualOperatingCosts),
    interestCoverageRatio:
      interestCoverageRatio === null ? null : roundToTwoDecimals(interestCoverageRatio),
    stressedMonthlyCashFlowPlusOne: roundToTwoDecimals(stressedMonthlyCashFlowPlusOne),
    stressedMonthlyCashFlowPlusTwo: roundToTwoDecimals(stressedMonthlyCashFlowPlusTwo),
    investorScore: scoreResult.investorScore,
    scoreConfidence: scoreResult.scoreConfidence,
    verdict: scoreResult.verdict
  };
}

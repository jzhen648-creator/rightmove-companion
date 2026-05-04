// Plain-English result summaries for buy-to-let mode.
// Keeping this separate from the UI makes the Results section easier to maintain.
import { countParsedListingSignals } from "./calculations";
import { formatCurrency } from "./formatters";
import { INVESTOR_SCORE_CONFIG } from "./investorScore";
import type { InvestmentInputs, InvestmentResults, RightmovePageInfo } from "./types";

export interface BuyToLetEvaluationSummary {
  reasons: string[];
  structuralRisks: string[];
  improvements: string[];
}

function formatRoundedPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatMultiple(value: number | null): string {
  return value === null ? "No mortgage" : `${value.toFixed(2)}x`;
}

function addIfRoom(list: string[], message: string | null, maximumItems: number): void {
  if (!message || list.length >= maximumItems) {
    return;
  }

  list.push(message);
}

function getAnnualFixedRecurringCosts(inputs: InvestmentInputs): number {
  return (
    Math.max(0, inputs.serviceChargeAnnual) +
    Math.max(0, inputs.groundRentAnnual) +
    Math.max(0, inputs.maintenanceAllowanceAnnual) +
    Math.max(0, inputs.insuranceAnnual) +
    Math.max(0, inputs.miscAnnualCost)
  );
}

function getRentRetentionRate(inputs: InvestmentInputs): number {
  const percentCosts = Math.max(0, inputs.managementPercent) + Math.max(0, inputs.voidPercent);
  return 1 - percentCosts / 100;
}

function getTargetMonthlyRentForBreakEven(
  inputs: InvestmentInputs,
  results: InvestmentResults
): number | null {
  const rentRetentionRate = getRentRetentionRate(inputs);
  const annualFixedRecurringCosts = getAnnualFixedRecurringCosts(inputs);

  if (rentRetentionRate <= 0) {
    return null;
  }

  return (results.annualMortgageCost + annualFixedRecurringCosts) / (12 * rentRetentionRate);
}

function getGroundRentRiskMessage(inputs: InvestmentInputs, pageInfo: RightmovePageInfo): string | null {
  if (inputs.groundRentAnnual <= 0) {
    return pageInfo.groundRentReview?.level === "higher" || pageInfo.groundRentReview?.level === "unknown"
      ? pageInfo.groundRentReview.message
      : null;
  }

  if (pageInfo.groundRentReview?.level === "higher") {
    return pageInfo.groundRentReview.message;
  }

  if (pageInfo.groundRentReview?.level === "mild") {
    return `Ground rent present at ${formatCurrency(inputs.groundRentAnnual)} per year.`;
  }

  return "Ground rent terms should be reviewed.";
}

export function buildBuyToLetEvaluationSummary(
  inputs: InvestmentInputs,
  results: InvestmentResults,
  pageInfo: RightmovePageInfo
): BuyToLetEvaluationSummary {
  const reasons: string[] = [];
  const structuralRisks: string[] = [];
  const improvements: string[] = [];
  const parsedListingSignalCount = countParsedListingSignals(pageInfo);

  const cashFlowThresholds = INVESTOR_SCORE_CONFIG.anchorThresholds.monthlyCashFlow;
  const cashOnCashThresholds = INVESTOR_SCORE_CONFIG.anchorThresholds.cashOnCashReturn;
  const interestCoverageThresholds = INVESTOR_SCORE_CONFIG.anchorThresholds.interestCoverageRatio;
  const stressThresholds = INVESTOR_SCORE_CONFIG.anchorThresholds.stressResilience;
  const healthySupportingYield = INVESTOR_SCORE_CONFIG.grossYieldSupport.healthy;

  if (results.monthlyCashFlow >= cashFlowThresholds.strong) {
    reasons.push(
      `Monthly cash flow is ${formatCurrency(results.monthlyCashFlow)}, which is a strong cushion and the biggest driver of the score.`
    );
  } else if (results.monthlyCashFlow >= cashFlowThresholds.good) {
    reasons.push(
      `Monthly cash flow is ${formatCurrency(results.monthlyCashFlow)}, which is a healthy positive buffer and a strong anchor for the score.`
    );
  } else if (results.monthlyCashFlow >= cashFlowThresholds.okay) {
    reasons.push(
      `Monthly cash flow is ${formatCurrency(results.monthlyCashFlow)}, so the deal is positive but still not especially cushioned.`
    );
  } else if (results.monthlyCashFlow >= 0) {
    reasons.push(
      `Monthly cash flow is only ${formatCurrency(results.monthlyCashFlow)}, so the score is held back by the thin monthly cushion.`
    );
  } else {
    reasons.push(
      `Monthly cash flow is ${formatCurrency(results.monthlyCashFlow)}, so this deal would need topping up each month.`
    );
  }

  if (results.cashOnCashReturn >= cashOnCashThresholds.exceptional) {
    reasons.push(
      `Cash-on-cash return is ${formatRoundedPercent(results.cashOnCashReturn)}, which is in the exceptional range and already close to the maximum score contribution.`
    );
  } else if (results.cashOnCashReturn >= cashOnCashThresholds.strong) {
    reasons.push(
      `Cash-on-cash return is ${formatRoundedPercent(results.cashOnCashReturn)}, which is in the strong range for return on cash invested.`
    );
  } else if (results.cashOnCashReturn >= cashOnCashThresholds.good) {
    reasons.push(
      `Cash-on-cash return is ${formatRoundedPercent(results.cashOnCashReturn)}, which is good without being standout.`
    );
  } else if (results.cashOnCashReturn >= cashOnCashThresholds.okay) {
    reasons.push(
      `Cash-on-cash return is ${formatRoundedPercent(results.cashOnCashReturn)}, which is okay but still fairly modest.`
    );
  } else {
    reasons.push(
      `Cash-on-cash return is ${formatRoundedPercent(results.cashOnCashReturn)}, which is still in the weak range for the cash going in.`
    );
  }

  if (results.interestCoverageRatio === null) {
    reasons.push("There is no mortgage cost in the model, so debt safety is not limiting the score here.");
  } else if (results.interestCoverageRatio >= interestCoverageThresholds.strong) {
    reasons.push(`ICR is ${formatMultiple(results.interestCoverageRatio)}, which gives a strong debt-safety margin.`);
  } else if (results.interestCoverageRatio >= interestCoverageThresholds.okay) {
    reasons.push(`ICR is ${formatMultiple(results.interestCoverageRatio)}, which gives a workable debt-safety cushion.`);
  } else if (results.interestCoverageRatio >= interestCoverageThresholds.thin) {
    reasons.push(`ICR is ${formatMultiple(results.interestCoverageRatio)}, which is positive but still a thin debt-safety margin.`);
  } else {
    reasons.push(`ICR is ${formatMultiple(results.interestCoverageRatio)}, so rent does not leave much room for mortgage pressure.`);
  }

  if (inputs.monthlyRent <= 0) {
    addIfRoom(structuralRisks, "Monthly rent is still blank, so the rental analysis is not meaningful yet.", 4);
  } else {
    addIfRoom(structuralRisks, "Rent is manually entered, so the result depends on that assumption.", 4);
  }

  const { stressedMonthlyCashFlowPlusOne, stressedMonthlyCashFlowPlusTwo } = results;

  if (stressedMonthlyCashFlowPlusOne < 0) {
    reasons.push(
      `Under a 1% mortgage-rate stress, monthly cash flow falls to ${formatCurrency(
        stressedMonthlyCashFlowPlusOne
      )}, so resilience is weak.`
    );
  } else if (stressedMonthlyCashFlowPlusTwo < stressThresholds.plusTwoBreakEven) {
    reasons.push(
      `Stress resilience is mixed: cash flow stays positive at ${formatCurrency(
        stressedMonthlyCashFlowPlusOne
      )} with +1%, but falls to ${formatCurrency(stressedMonthlyCashFlowPlusTwo)} at +2%.`
    );
  } else if (stressedMonthlyCashFlowPlusOne < stressThresholds.plusOneWeak) {
    reasons.push(
      `Stress resilience is only fair: cash flow stays positive under stress, but the +1% cushion is still fairly slim at ${formatCurrency(
        stressedMonthlyCashFlowPlusOne
      )}.`
    );
  } else if (stressedMonthlyCashFlowPlusOne >= stressThresholds.plusOneStrong) {
    reasons.push(
      `Stress resilience is solid: cash flow stays positive at ${formatCurrency(
        stressedMonthlyCashFlowPlusOne
      )} with +1% and ${formatCurrency(stressedMonthlyCashFlowPlusTwo)} with +2%.`
    );
  } else {
    reasons.push(
      `Stress resilience is reasonable: cash flow stays positive at ${formatCurrency(
        stressedMonthlyCashFlowPlusOne
      )} with +1% and ${formatCurrency(stressedMonthlyCashFlowPlusTwo)} with +2%.`
    );
  }

  if (results.grossYield < INVESTOR_SCORE_CONFIG.grossYieldSupport.weak) {
    addIfRoom(
      structuralRisks,
      `Gross yield is ${formatRoundedPercent(results.grossYield)}, so the rent-to-price ratio is only giving limited support to the deal.`,
      4
    );
  } else if (results.grossYield < INVESTOR_SCORE_CONFIG.grossYieldSupport.okay) {
    addIfRoom(
      structuralRisks,
      `Gross yield is ${formatRoundedPercent(results.grossYield)}, so it is a supporting metric here rather than a clear strength.`,
      4
    );
  }

  if (stressedMonthlyCashFlowPlusOne < 0) {
    addIfRoom(
      structuralRisks,
      `Cash flow turns negative at roughly ${formatCurrency(stressedMonthlyCashFlowPlusOne)} per month if mortgage rates are 1% higher.`,
      4
    );
  } else if (stressedMonthlyCashFlowPlusTwo < 0) {
    addIfRoom(
      structuralRisks,
      `Cash flow stays positive today but turns negative at roughly ${formatCurrency(
        stressedMonthlyCashFlowPlusTwo
      )} per month under a 2% rate stress.`,
      4
    );
  }

  if (inputs.serviceChargeAnnual >= 2000) {
    addIfRoom(
      structuralRisks,
      `Service charge is ${formatCurrency(inputs.serviceChargeAnnual)} per year, which is a meaningful drag on cash flow.`,
      4
    );
  } else if (inputs.serviceChargeAnnual > 0) {
    addIfRoom(
      structuralRisks,
      `Service charge is ${formatCurrency(inputs.serviceChargeAnnual)} per year, so check what it covers and how stable it is.`,
      4
    );
  } else if (!pageInfo.parsedFields.serviceChargeAnnual) {
    addIfRoom(structuralRisks, "Service charge was not parsed from the listing, so confirm whether one applies.", 4);
  }

  addIfRoom(structuralRisks, getGroundRentRiskMessage(inputs, pageInfo), 4);

  if (!pageInfo.leaseLengthText) {
    addIfRoom(
      structuralRisks,
      "Lease length was not available from the listing, so check it separately if the property is leasehold.",
      4
    );
  }

  if (
    inputs.maintenanceAllowanceAnnual <= 0 &&
    inputs.insuranceAnnual <= 0 &&
    inputs.miscAnnualCost <= 0
  ) {
    addIfRoom(
      structuralRisks,
      "Several recurring cost inputs are still blank, so the score is more tentative than usual.",
      4
    );
  }

  if (parsedListingSignalCount <= 2) {
    addIfRoom(
      structuralRisks,
      "Listing data is fairly limited, so analysis confidence is lower than it would be with more verified details.",
      4
    );
  }

  const annualRent = Math.max(0, inputs.monthlyRent) * 12;
  const targetPriceForStrongYield =
    annualRent > 0 ? annualRent / (healthySupportingYield / 100) : null;

  // Only suggest levers the buyer can realistically influence.
  if (targetPriceForStrongYield && targetPriceForStrongYield < inputs.askingPrice) {
    addIfRoom(
      improvements,
      `A purchase price closer to ${formatCurrency(targetPriceForStrongYield)} would lift gross yield toward a healthier 6% supporting range.`,
      3
    );
  }

  const targetMonthlyRentForBreakEven = getTargetMonthlyRentForBreakEven(inputs, results);

  if (targetMonthlyRentForBreakEven && targetMonthlyRentForBreakEven > inputs.monthlyRent && results.monthlyCashFlow < 0) {
    addIfRoom(
      improvements,
      `An achievable rent closer to ${formatCurrency(targetMonthlyRentForBreakEven)} per month would move this deal toward break-even.`,
      3
    );
  }

  if (results.loanAmount > 0 && inputs.mortgageRatePercent >= 5) {
    const monthlySavingPerHalfPoint = (results.loanAmount * 0.005) / 12;
    addIfRoom(
      improvements,
      `A lower mortgage rate would help. Roughly 0.5% off the rate saves about ${formatCurrency(monthlySavingPerHalfPoint)} per month at this loan size.`,
      3
    );
  }

  if (results.loanAmount > 0 && (results.monthlyCashFlow < 0 || results.interestCoverageRatio !== null && results.interestCoverageRatio < 1.25)) {
    const monthlySavingPerTenThousand = (10000 * (Math.max(0, inputs.mortgageRatePercent) / 100)) / 12;
    addIfRoom(
      improvements,
      `A higher deposit would reduce the mortgage cost. Every extra ${formatCurrency(10000)} saves about ${formatCurrency(
        monthlySavingPerTenThousand
      )} per month at the current rate.`,
      3
    );
  }

  if (inputs.managementPercent >= 8) {
    const monthlyManagementCost = (Math.max(0, inputs.monthlyRent) * inputs.managementPercent) / 100;
    addIfRoom(
      improvements,
      `Self-managing instead of using an agent would improve cash flow by about ${formatCurrency(
        monthlyManagementCost
      )} per month, if that fits your plan.`,
      3
    );
  }

  return {
    reasons: reasons.slice(0, 4),
    structuralRisks,
    improvements
  };
}

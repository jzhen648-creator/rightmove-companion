// Property goal configuration.
// Keeping mode rules here makes it easier to add new modes later such as Flip, HMO, or BRR.
import type { InvestmentInputs, MortgageType, PropertyGoal } from "./types";

export interface PropertyGoalConfig {
  label: string;
  description: string;
  mortgageBasis: MortgageType;
  showMortgageTerm: boolean;
  showRentField: boolean;
  showManagementField: boolean;
  showVoidField: boolean;
  showInvestorScore: boolean;
  showInvestmentMetrics: boolean;
  showSavedDeals: boolean;
}

export const PROPERTY_GOAL_CONFIG: Record<PropertyGoal, PropertyGoalConfig> = {
  "buy-to-let": {
    label: "Buy-to-let",
    description: "Full rental investment view with rent, yield, cash flow, score, and saved deals.",
    mortgageBasis: "interest-only",
    showMortgageTerm: false,
    showRentField: true,
    showManagementField: true,
    showVoidField: true,
    showInvestorScore: true,
    showInvestmentMetrics: true,
    showSavedDeals: true
  },
  "standard-purchase": {
    label: "Standard purchase",
    description: "Cleaner home-purchase view without rent-led analysis and investor scoring.",
    mortgageBasis: "repayment",
    showMortgageTerm: true,
    showRentField: false,
    showManagementField: false,
    showVoidField: false,
    showInvestorScore: false,
    showInvestmentMetrics: false,
    showSavedDeals: false
  }
};

export const PROPERTY_GOAL_OPTIONS = (
  Object.entries(PROPERTY_GOAL_CONFIG) as Array<[PropertyGoal, PropertyGoalConfig]>
).map(([value, config]) => ({
  value,
  label: config.label
}));

export function getPropertyGoalConfig(propertyGoal: PropertyGoal): PropertyGoalConfig {
  return PROPERTY_GOAL_CONFIG[propertyGoal];
}

// Each mode now owns its own mortgage basis, so the UI does not need a separate toggle.
export function applyPropertyGoalDefaults(inputs: InvestmentInputs): InvestmentInputs {
  const config = getPropertyGoalConfig(inputs.propertyGoal);

  return {
    ...inputs,
    mortgageType: config.mortgageBasis
  };
}

// Standard purchase mode hides rent-based metrics, so calculations should ignore rental-only inputs.
export function getCalculationInputsForPropertyGoal(inputs: InvestmentInputs): InvestmentInputs {
  const normalizedInputs = applyPropertyGoalDefaults(inputs);

  if (inputs.propertyGoal !== "standard-purchase") {
    return normalizedInputs;
  }

  return {
    ...normalizedInputs,
    monthlyRent: 0,
    managementPercent: 0,
    voidPercent: 0
  };
}

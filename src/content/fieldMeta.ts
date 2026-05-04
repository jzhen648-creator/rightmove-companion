import type { InvestmentInputs } from "../lib/types";

export type EditableNumberKey = Exclude<
  keyof InvestmentInputs,
  | "mortgageType"
  | "depositInputMode"
  | "sdltResidenceType"
  | "propertyGoal"
  | "purchaseStructure"
  | "personalSdltStatus"
>;

export interface NumberFieldDefinition {
  key: EditableNumberKey;
  label: string;
  step?: string;
  prefix?: string;
  suffix?: string;
  helperText?: string;
  showBlankWhenZero?: boolean;
}

export interface ToggleOption {
  label: string;
  value: string;
}

export const POUND_SYMBOL = "\u00A3";

export const financeFields: NumberFieldDefinition[] = [
  {
    key: "askingPrice",
    label: "Purchase price",
    step: "1000",
    prefix: POUND_SYMBOL,
  },
  {
    key: "monthlyRent",
    label: "Monthly rent",
    step: "25",
    prefix: POUND_SYMBOL,
    helperText: "Parsed from the listing when available; otherwise enter manually.",
  },
  {
    key: "depositAmount",
    label: `Deposit (${POUND_SYMBOL})`,
    step: "100",
    prefix: POUND_SYMBOL,
    helperText: "Edit either deposit field. The other one updates automatically.",
  },
  { key: "depositPercent", label: "Deposit (%)", step: "0.5", suffix: "%" },
  {
    key: "mortgageRatePercent",
    label: "Mortgage rate",
    step: "0.1",
    suffix: "%",
  },
  {
    key: "mortgageTermYears",
    label: "Mortgage term",
    step: "1",
    suffix: "years",
  },
];

export const upfrontCostFields: NumberFieldDefinition[] = [
  { key: "legalFees", label: "Legal fee", step: "100", prefix: POUND_SYMBOL },
  { key: "brokerFee", label: "Broker fee", step: "50", prefix: POUND_SYMBOL },
  {
    key: "refurbCost",
    label: "Refurb cost",
    step: "250",
    prefix: POUND_SYMBOL,
  },
];

export const recurringCostFields: NumberFieldDefinition[] = [
  {
    key: "serviceChargeAnnual",
    label: "Service charge",
    step: "50",
    prefix: POUND_SYMBOL,
    suffix: "/yr",
  },
  {
    key: "groundRentAnnual",
    label: "Ground rent",
    step: "25",
    prefix: POUND_SYMBOL,
    suffix: "/yr",
  },
  { key: "managementPercent", label: "Management", step: "0.5", suffix: "%" },
  {
    key: "maintenanceAllowanceAnnual",
    label: "Maintenance allowance",
    step: "25",
    prefix: POUND_SYMBOL,
    suffix: "/yr",
    showBlankWhenZero: true,
  },
  { key: "voidPercent", label: "Void allowance", step: "0.5", suffix: "%" },
  {
    key: "insuranceAnnual",
    label: "Insurance",
    step: "25",
    prefix: POUND_SYMBOL,
    suffix: "/yr",
    showBlankWhenZero: true,
  },
  {
    key: "miscAnnualCost",
    label: "Misc annual cost",
    step: "25",
    prefix: POUND_SYMBOL,
    suffix: "/yr",
    showBlankWhenZero: true,
  },
];

export const purchaseStructureOptions: ToggleOption[] = [
  { label: "Personal name", value: "personal-name" },
  { label: "Limited company", value: "limited-company" },
];

export const personalSdltStatusOptions: ToggleOption[] = [
  { label: "Only residential property", value: "only-residential-property" },
  { label: "Additional property", value: "additional-property" },
];

export const sdltResidenceOptions: ToggleOption[] = [
  { label: "Main residence", value: "main-residence" },
  { label: "Additional property", value: "additional-property" },
];

export function getNumberFieldDefinition(
  definitions: NumberFieldDefinition[],
  key: EditableNumberKey,
): NumberFieldDefinition {
  const field = definitions.find((definition) => definition.key === key);

  if (!field) {
    throw new Error(`Missing field definition for ${key}`);
  }

  return field;
}

export const purchasePriceField = getNumberFieldDefinition(financeFields, "askingPrice");
export const monthlyRentField = getNumberFieldDefinition(financeFields, "monthlyRent");
export const depositAmountField = getNumberFieldDefinition(financeFields, "depositAmount");
export const depositPercentField = getNumberFieldDefinition(financeFields, "depositPercent");
export const mortgageRateField = getNumberFieldDefinition(financeFields, "mortgageRatePercent");
export const mortgageTermField = getNumberFieldDefinition(financeFields, "mortgageTermYears");

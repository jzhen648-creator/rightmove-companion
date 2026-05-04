// Default values that make the first version usable straight away.
import type { InvestmentInputs } from "./types";

export const DEFAULT_INPUTS: InvestmentInputs = {
  propertyGoal: "buy-to-let",
  askingPrice: 0,
  monthlyRent: 0,
  depositAmount: 0,
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
  miscAnnualCost: 0
};

export const DEFAULT_SETTING_KEYS: Array<keyof InvestmentInputs> = [
  "propertyGoal",
  "depositPercent",
  "mortgageRatePercent",
  "mortgageTermYears",
  "purchaseStructure",
  "personalSdltStatus",
  "sdltResidenceType",
  "serviceChargeAnnual",
  "groundRentAnnual",
  "managementPercent",
  "maintenanceAllowanceAnnual",
  "voidPercent",
  "legalFees",
  "brokerFee",
  "refurbCost",
  "insuranceAnnual",
  "miscAnnualCost"
];

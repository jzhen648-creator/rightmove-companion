import { syncDepositValues } from "../lib/deposit";
import { formatCurrency } from "../lib/formatters";
import { applyPropertyGoalDefaults } from "../lib/propertyGoals";
import { DEFAULT_INPUTS, DEFAULT_SETTING_KEYS } from "../lib/defaults";
import type { EditableNumberKey } from "./fieldMeta";
import type {
  InvestmentInputs,
  ParsedListingFieldKey,
  RightmovePageInfo,
  Verdict,
} from "../lib/types";

export function parseInputNumber(value: string): number {
  if (value.trim() === "") {
    return 0;
  }

  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 0;
}

export function formatMultiple(value: number | null): string {
  return value === null ? "No mortgage" : `${value.toFixed(2)}x`;
}

export function buildStatusMessage(pageInfo: RightmovePageInfo): string {
  const messages: string[] = [];

  if (pageInfo.askingPrice) {
    messages.push(
      `Purchase price detected automatically from ${pageInfo.priceSource}.`,
    );
  } else {
    messages.push(
      "Could not detect the purchase price, so you can type it in manually.",
    );
  }

  if (pageInfo.rentEstimate) {
    messages.push(
      `Rent estimate parsed: ${formatCurrency(pageInfo.rentEstimate.estimate)}/pm.`,
    );
  }

  if (pageInfo.parsedFields.serviceChargeAnnual) {
    messages.push("Service charge parsed from listing.");
  }

  if (pageInfo.parsedFields.groundRentAnnual) {
    messages.push("Ground rent parsed from listing.");
  }

  if (pageInfo.floorAreaSqFt) {
    messages.push("Floor area found for price per sq ft.");
  }

  return messages.join(" ");
}

export function getParsedInputOverrides(
  pageInfo: RightmovePageInfo,
): Partial<InvestmentInputs> {
  return {
    ...(pageInfo.askingPrice ? { askingPrice: pageInfo.askingPrice } : {}),
    ...(pageInfo.parsedFields.serviceChargeAnnual
      ? { serviceChargeAnnual: pageInfo.parsedFields.serviceChargeAnnual.value }
      : {}),
    ...(pageInfo.parsedFields.groundRentAnnual
      ? { groundRentAnnual: pageInfo.parsedFields.groundRentAnnual.value }
      : {}),
    ...(pageInfo.rentEstimate
      ? { monthlyRent: pageInfo.rentEstimate.estimate }
      : {}),
  };
}

export function buildStartingInputs(
  pageInfo: RightmovePageInfo,
  savedSettings: Partial<InvestmentInputs>,
  pageDraft?: InvestmentInputs,
): InvestmentInputs {
  return syncDepositValues(
    applyPropertyGoalDefaults({
      ...DEFAULT_INPUTS,
      ...savedSettings,
      ...getParsedInputOverrides(pageInfo),
      ...pageDraft,
    }),
  );
}

export function applyParsedPageInfoToInputs(
  inputs: InvestmentInputs,
  pageInfo: RightmovePageInfo,
): InvestmentInputs {
  const nextInputs = { ...inputs };

  if (pageInfo.askingPrice && nextInputs.askingPrice <= 0) {
    nextInputs.askingPrice = pageInfo.askingPrice;
  }

  if (
    pageInfo.parsedFields.serviceChargeAnnual &&
    nextInputs.serviceChargeAnnual <= 0
  ) {
    nextInputs.serviceChargeAnnual =
      pageInfo.parsedFields.serviceChargeAnnual.value;
  }

  if (
    pageInfo.parsedFields.groundRentAnnual &&
    nextInputs.groundRentAnnual <= 0
  ) {
    nextInputs.groundRentAnnual = pageInfo.parsedFields.groundRentAnnual.value;
  }

  if (pageInfo.rentEstimate && nextInputs.monthlyRent <= 0) {
    nextInputs.monthlyRent = pageInfo.rentEstimate.estimate;
  }

  return syncDepositValues(applyPropertyGoalDefaults(nextInputs));
}

export function pickDefaultSettings(
  inputs: InvestmentInputs,
): Partial<InvestmentInputs> {
  return DEFAULT_SETTING_KEYS.reduce<Partial<InvestmentInputs>>(
    (savedSettings, key) => {
      return { ...savedSettings, [key]: inputs[key] };
    },
    {},
  );
}

export function getFieldNoteText(
  pageInfo: RightmovePageInfo,
  fieldKey: EditableNumberKey,
): string | undefined {
  if (fieldKey !== "serviceChargeAnnual" && fieldKey !== "groundRentAnnual") {
    return undefined;
  }

  return pageInfo.parsedFields[fieldKey as ParsedListingFieldKey]?.note;
}

export function verdictLabel(verdict: Verdict): string {
  return verdict.charAt(0).toUpperCase() + verdict.slice(1);
}

export function scoreConfidenceLabel(value: "high" | "medium" | "low"): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)} analysis confidence`;
}

export function getSdltHelperText(inputs: InvestmentInputs): string {
  if (inputs.propertyGoal === "buy-to-let") {
    if (inputs.purchaseStructure === "limited-company") {
      return "Limited company purchases use higher residential rates automatically for now.";
    }

    return "Only residential property uses standard residential rates. Additional property uses higher rates.";
  }

  return "England / Northern Ireland only for now.";
}

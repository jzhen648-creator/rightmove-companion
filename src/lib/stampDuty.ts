// Stamp Duty Land Tax (SDLT) helper for England and Northern Ireland only.
// Keeping this separate makes it easier to add Wales and Scotland later.
import type { InvestmentInputs, SdltResidenceType } from "./types";
import { roundToTwoDecimals } from "./utils";

interface TaxBand {
  upperLimit: number;
  rate: number;
}

const INFINITE_LIMIT = Number.POSITIVE_INFINITY;

// GOV.UK residential rates used from 1 April 2025 for England / Northern Ireland.
// These are the standard residential bands.
// In buy-to-let mode, a personal buyer with no other residential property can still use them.
const STANDARD_RESIDENTIAL_BANDS: TaxBand[] = [
  { upperLimit: 125000, rate: 0 },
  { upperLimit: 250000, rate: 0.02 },
  { upperLimit: 925000, rate: 0.05 },
  { upperLimit: 1500000, rate: 0.1 },
  { upperLimit: INFINITE_LIMIT, rate: 0.12 }
];

// Higher residential rates for additional dwellings from 1 April 2025.
// We also use these for limited company purchases in buy-to-let mode for now.
const ADDITIONAL_PROPERTY_BANDS: TaxBand[] = [
  { upperLimit: 125000, rate: 0.05 },
  { upperLimit: 250000, rate: 0.07 },
  { upperLimit: 925000, rate: 0.1 },
  { upperLimit: 1500000, rate: 0.15 },
  { upperLimit: INFINITE_LIMIT, rate: 0.17 }
];

function getBandsForResidenceType(residenceType: SdltResidenceType): TaxBand[] {
  return residenceType === "additional-property"
    ? ADDITIONAL_PROPERTY_BANDS
    : STANDARD_RESIDENTIAL_BANDS;
}

function calculateBandTax(purchasePrice: number, bands: TaxBand[]): number {
  let remainingPrice = Math.max(0, purchasePrice);
  let previousLimit = 0;
  let totalTax = 0;

  for (const band of bands) {
    if (remainingPrice <= 0) {
      break;
    }

    const bandWidth = band.upperLimit - previousLimit;
    const taxableAmount = Math.min(remainingPrice, bandWidth);

    totalTax += taxableAmount * band.rate;
    remainingPrice -= taxableAmount;
    previousLimit = band.upperLimit;
  }

  return roundToTwoDecimals(totalTax);
}

export function calculateEnglandNorthernIrelandSdlt(
  purchasePrice: number,
  residenceType: SdltResidenceType
): number {
  if (purchasePrice <= 0) {
    return 0;
  }

  return calculateBandTax(purchasePrice, getBandsForResidenceType(residenceType));
}

// This keeps the UI wording separate from the tax bands.
// Standard purchase uses the normal SDLT status field.
// Buy-to-let decides the SDLT rate from purchase structure and personal SDLT status.
export function getSdltResidenceTypeForInputs(
  inputs: Pick<
    InvestmentInputs,
    "propertyGoal" | "purchaseStructure" | "personalSdltStatus" | "sdltResidenceType"
  >
): SdltResidenceType {
  if (inputs.propertyGoal === "buy-to-let") {
    if (inputs.purchaseStructure === "limited-company") {
      return "additional-property";
    }

    return inputs.personalSdltStatus === "additional-property"
      ? "additional-property"
      : "main-residence";
  }

  return inputs.sdltResidenceType;
}

export function calculateEnglandNorthernIrelandSdltForInputs(
  purchasePrice: number,
  inputs: Pick<
    InvestmentInputs,
    "propertyGoal" | "purchaseStructure" | "personalSdltStatus" | "sdltResidenceType"
  >
): number {
  return calculateEnglandNorthernIrelandSdlt(
    purchasePrice,
    getSdltResidenceTypeForInputs(inputs)
  );
}

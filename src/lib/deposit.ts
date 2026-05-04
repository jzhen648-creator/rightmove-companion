// Helpers for keeping Deposit (GBP) and Deposit (%) linked in a simple way.
import type { DepositInputMode, InvestmentInputs } from "./types";
import { roundToTwoDecimals } from "./utils";

export function clampDepositPercent(depositPercent: number): number {
  return roundToTwoDecimals(Math.min(Math.max(0, depositPercent), 100));
}

export function clampDepositAmount(askingPrice: number, depositAmount: number): number {
  const safeDepositAmount = Math.max(0, depositAmount);

  if (askingPrice <= 0) {
    return roundToTwoDecimals(safeDepositAmount);
  }

  return roundToTwoDecimals(Math.min(safeDepositAmount, askingPrice));
}

export function getDepositAmountFromPercent(askingPrice: number, depositPercent: number): number {
  if (askingPrice <= 0) {
    return 0;
  }

  return roundToTwoDecimals(askingPrice * (clampDepositPercent(depositPercent) / 100));
}

export function getDepositPercentFromAmount(askingPrice: number, depositAmount: number): number {
  if (askingPrice <= 0) {
    return 0;
  }

  return roundToTwoDecimals((clampDepositAmount(askingPrice, depositAmount) / askingPrice) * 100);
}

export function getUsableDepositAmount(askingPrice: number, depositAmount: number): number {
  return clampDepositAmount(askingPrice, depositAmount);
}

export function syncDepositValues(inputs: InvestmentInputs): InvestmentInputs {
  const askingPrice = Math.max(0, inputs.askingPrice);
  const depositInputMode: DepositInputMode = inputs.depositInputMode ?? "percent";

  if (depositInputMode === "amount") {
    const depositAmount = clampDepositAmount(askingPrice, inputs.depositAmount);

    return {
      ...inputs,
      askingPrice,
      depositAmount,
      depositPercent: getDepositPercentFromAmount(askingPrice, depositAmount),
      depositInputMode
    };
  }

  const depositPercent = clampDepositPercent(inputs.depositPercent);

  return {
    ...inputs,
    askingPrice,
    depositAmount: getDepositAmountFromPercent(askingPrice, depositPercent),
    depositPercent,
    depositInputMode
  };
}

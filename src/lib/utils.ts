// Shared utility helpers used across multiple lib modules.
export function roundToTwoDecimals(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

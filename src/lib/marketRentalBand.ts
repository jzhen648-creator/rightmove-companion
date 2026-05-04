// Percentile band from comparable lettings (no LLM).
import type { ListingRentProfile, RentComparable, RentalAssessment } from "./types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  if (n === 1) {
    return sorted[0];
  }
  const index = Math.min(n - 1, Math.max(0, Math.floor((p / 100) * (n - 1))));
  return sorted[index];
}

export function deriveMarketRentalBand(
  profile: ListingRentProfile,
  comparables: RentComparable[],
): RentalAssessment | null {
  if (comparables.length === 0) {
    return null;
  }

  let pool = comparables;
  if (profile.beds !== null) {
    const sameBeds = comparables.filter((row) => row.bedrooms === profile.beds);
    if (sameBeds.length >= 3) {
      pool = sameBeds;
    }
  }

  const prices = pool.map((row) => row.price).sort((a, b) => a - b);
  const count = prices.length;
  const minMonthly = roundMoney(Math.max(50, percentile(prices, 10)));
  const maxMonthly = roundMoney(Math.max(minMonthly + 25, percentile(prices, 90)));
  const mean = prices.reduce((sum, value) => sum + value, 0) / count;
  const mid = Math.floor(count / 2);
  const median =
    count % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  let bestEstimateMonthly =
    count >= 5 ? roundMoney(median) : roundMoney(mean);
  bestEstimateMonthly = Math.min(maxMonthly, Math.max(minMonthly, bestEstimateMonthly));

  const matchedBeds =
    profile.beds !== null && pool.every((row) => row.bedrooms === profile.beds);

  const centralLabel =
    count >= 5
      ? `Central estimate £${bestEstimateMonthly}/pm (median of those ${count} lettings).`
      : `Central estimate £${bestEstimateMonthly}/pm (mean of ${count} letting${count === 1 ? "" : "s"}).`;

  const rationale = [
    `Market band from ${count} nearby letting ${count === 1 ? "listing" : "listings"}${
      matchedBeds ? ` filtered to ${profile.beds} bed(s)` : ""
    }.`,
    `Approximate pcm range £${minMonthly}–£${maxMonthly} (10th–90th percentile of observed rents). ${centralLabel}`,
  ];

  return {
    minMonthly,
    maxMonthly,
    bestEstimateMonthly,
    rationale,
    source: "market-data",
    usedComparablesCount: count,
  };
}

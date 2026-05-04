import type { RentComparable } from "./types";

function dedupeKey(item: RentComparable): string {
  if (item.url) {
    try {
      const u = new URL(item.url);
      return `${u.hostname}${u.pathname}|${Math.round(item.price)}`;
    } catch {
      /* fall through */
    }
  }
  const d = item.description.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  return `${Math.round(item.price)}|${d}`;
}

/**
 * Concatenate portal results; dedupe by URL+price or description+price.
 * Order: Rightmove first, then Zoopla, then PrimeLocation (stable priority).
 */
export function mergeRentComparablesFromSources(
  buckets: { source: string; items: RentComparable[] }[],
  maxTotal: number,
): RentComparable[] {
  const seen = new Set<string>();
  const out: RentComparable[] = [];

  for (const bucket of buckets) {
    for (const raw of bucket.items) {
      const item: RentComparable = {
        ...raw,
        source: raw.source?.trim() || bucket.source,
      };
      const key = dedupeKey(item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(item);
      if (out.length >= maxTotal) {
        return out;
      }
    }
  }

  return out;
}

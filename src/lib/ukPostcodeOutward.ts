/** UK outward code for PrimeLocation-style URLs (e.g. DA1 2DL → da1). */
export function outwardPostcodeDistrict(postcode: string): string | null {
  const t = postcode.trim().toUpperCase();
  const withSpace = t.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)\s+(\d[A-Z]{2})$/);
  if (withSpace) {
    return withSpace[1].toLowerCase();
  }
  const outwardOnly = t.match(/^([A-Z]{1,2}\d[A-Z0-9]?)$/);
  if (outwardOnly) {
    return outwardOnly[1].toLowerCase();
  }
  return null;
}

/**
 * Broad postcode “area” for locality checks (e.g. da1 & da2 → da, le10 → le).
 * Uses the leading letter group of the outward code so adjacent districts stay comparable.
 */
export function postcodeAreaPrefix(outward: string): string {
  const o = outward.trim().toLowerCase();
  const m = o.match(/^([a-z]{1,2})/);
  return m ? m[1] : o.slice(0, 2);
}

/** Extract a full or outward-only UK postcode from free text (same rules as listing scrape). */
export function findPostcode(text: string): string | null {
  const fullMatch = text.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s+(\d[A-Z]{2})\b/i);
  if (fullMatch) {
    return `${fullMatch[1].toUpperCase()} ${fullMatch[2].toUpperCase()}`;
  }

  const outwardMatches = [...text.matchAll(/\b([A-Z]{1,2}\d[A-Z0-9]?)\b/gi)];
  for (let index = outwardMatches.length - 1; index >= 0; index -= 1) {
    const raw = outwardMatches[index][1].toUpperCase();
    if (raw.length < 2 || raw.length > 4) {
      continue;
    }
    if (!/\d/.test(raw)) {
      continue;
    }
    if (!/^[A-Z]{1,2}\d/.test(raw)) {
      continue;
    }
    return raw;
  }

  return null;
}

/** UK outward code for PrimeLocation-style URLs (e.g. DA1 2DL → da1). */
export function outwardPostcodeDistrict(postcode: string): string | null {
  const t = postcode.trim().toUpperCase();
  const withSpace = t.match(/^([A-Z]{1,2}\d[A-Z0-9]?)\s+(\d[A-Z]{2})$/);
  if (withSpace) {
    return withSpace[1].toLowerCase();
  }
  const outwardOnly = t.match(/^([A-Z]{1,2}\d[A-Z0-9]?)$/);
  if (outwardOnly) {
    return outwardOnly[1].toLowerCase();
  }
  return null;
}

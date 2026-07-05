// Drop rental comps whose visible postcode is in a different UK postcode area than the listing.
import type { ListingRentProfile, RentComparable } from "./types";
import {
  findPostcode,
  outwardPostcodeDistrict,
  postcodeAreaPrefix,
} from "./ukPostcodeOutward";

export function filterComparablesToListingPostcodeArea(
  listing: ListingRentProfile,
  comparables: RentComparable[],
): RentComparable[] {
  const subjectPc = listing.postcode?.trim();
  if (!subjectPc || comparables.length === 0) {
    return comparables;
  }

  const subjectOutward = outwardPostcodeDistrict(subjectPc);
  if (!subjectOutward) {
    return comparables;
  }

  const subjectArea = postcodeAreaPrefix(subjectOutward);
  const out: RentComparable[] = [];
  let droppedWrongArea = 0;

  for (const row of comparables) {
    const haystack = `${row.description}\n${row.url ?? ""}`;
    const compPc = findPostcode(haystack);
    if (!compPc) {
      out.push(row);
      continue;
    }
    const compOutward = outwardPostcodeDistrict(compPc);
    if (!compOutward) {
      out.push(row);
      continue;
    }
    if (postcodeAreaPrefix(compOutward) === subjectArea) {
      out.push(row);
    } else {
      droppedWrongArea += 1;
    }
  }

  if (out.length === 0 && droppedWrongArea > 0) {
    return [];
  }
  return out;
}

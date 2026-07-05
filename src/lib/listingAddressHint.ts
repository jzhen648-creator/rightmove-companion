// Derive Land Registry PAON/SAON hints from Rightmove address strings (best-effort, conservative).
import { findPostcode } from "./ukPostcodeOutward";
import type { ListingAddressHint, SoldPropertyType } from "./types";

const BEDROOM_LISTING_PREFIX =
  /^\d+\s+bed(?:room)?\s+.+?\s+for\s+sale\s+in\s+/i;

function stripListingPrefix(line: string): string {
  let text = line.replace(/\s+/g, " ").trim();
  text = text.replace(BEDROOM_LISTING_PREFIX, "");
  text = text.replace(/\bfor\s+sale\s+in\s+/i, "");
  return text.trim();
}

function stripPostcodeSuffix(line: string): string {
  const postcode = findPostcode(line);
  if (!postcode) {
    return line;
  }
  const index = line.toUpperCase().indexOf(postcode);
  if (index < 0) {
    return line;
  }
  return line.slice(0, index).replace(/,\s*$/, "").trim();
}

function titleCaseUnitPrefix(prefix: string): string {
  return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1).toLowerCase()}`;
}

/**
 * Conservative PAON/SAON extraction. Returns null when the address is ambiguous
 * or Rightmove has withheld the number — postcode summary is used instead.
 */
export function deriveListingAddressHint(
  address: string | null | undefined,
): ListingAddressHint | null {
  if (!address?.trim()) {
    return null;
  }

  let line = stripListingPrefix(address);
  line = stripPostcodeSuffix(line);
  if (!line) {
    return null;
  }

  if (/^property\s+in\b/i.test(line)) {
    return null;
  }

  const parts = line
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const first = parts[0];
  const flatMatch = first.match(/^(flat|apartment|unit)\s+(.+)$/i);
  if (flatMatch) {
    const unitRef = flatMatch[2].trim();
    if (!unitRef) {
      return null;
    }
    const saon = `${titleCaseUnitPrefix(flatMatch[1])} ${unitRef}`;
    let paon = parts[1]?.trim();
    if (!paon) {
      return null;
    }
    const third = parts[2]?.trim();
    if (third) {
      const buildingNumber = third.match(/^(\d+[A-Za-z]?)\b/);
      if (buildingNumber) {
        paon = `${paon}, ${buildingNumber[1]}`;
      }
    }
    return { saon, paon };
  }

  if (/^\d+[A-Za-z]?$/.test(first)) {
    return { paon: first };
  }

  const houseNumber = first.match(/^(\d+[A-Za-z]?)\b/);
  if (houseNumber) {
    return { paon: houseNumber[1] };
  }

  return null;
}

/** Map listing text to a Land Registry property type slug when unambiguous. */
export function inferSoldPropertyTypeFromListing(
  headlineOrAddress: string,
  propertyType: string | null,
): SoldPropertyType | null {
  const text = headlineOrAddress.toLowerCase();
  if (/\bsemi-?detached\b/.test(text)) {
    return "semi-detached";
  }
  if (/\bdetached\b/.test(text)) {
    return "detached";
  }
  if (/\bterraced\b/.test(text)) {
    return "terraced";
  }
  if (/\b(flat|apartment|maisonette|penthouse|studio)\b/.test(text)) {
    return "flat-maisonette";
  }
  if (propertyType === "Flat") {
    return "flat-maisonette";
  }
  return null;
}

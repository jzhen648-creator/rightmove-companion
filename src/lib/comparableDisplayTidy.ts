import { isLikelyRoomOrHouseShareLetting } from "./rentalSearchHtmlParser";

/**
 * Short, readable summary line for a rental comparable (portal card text is often noisy).
 * Safe to run in the UI on any `RentComparable.description`.
 */
export function tidyComparableSummaryLine(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) {
    return "Listing";
  }

  s = s.replace(/^Highlight\s*/i, "");
  s = s.replace(/\(\s*£[\d,]+(?:\.\d+)?\s*pw\s*\)/gi, " ");
  s = s.replace(/\(\s*£[\d,]+(?:\.\d+)?\s*pcm\s*\)/gi, " ");
  s = s.replace(/^£[\d,]+(?:\.\d+)?\s*pcm\s*/i, "");

  const marketing = [
    /\bWelcome to\b/i,
    /\bWe are (?:delighted|pleased) to\b/i,
    /\bListed on\b/i,
    /\bNew Listing\b/i,
    /\bJust added\b/i,
    /\bPremium\b/i,
    /\bDeposit alternative\b/i,
    /\bZero Deposit\b/i,
  ];
  for (const re of marketing) {
    const m = s.match(re);
    if (m?.index != null && m.index >= 28) {
      const shortened = s.slice(0, m.index).trim();
      if (
        isLikelyRoomOrHouseShareLetting(s) &&
        !isLikelyRoomOrHouseShareLetting(shortened)
      ) {
        continue;
      }
      s = shortened;
    }
  }

  s = s.replace(/(\d+)\s*beds?\s*/gi, "$1 bed · ");
  s = s.replace(/(\d+)\s*baths?\s*/gi, "$1 bath · ");
  // Plural must be a literal "s" (avoid /receptions?/i matching "reception" + "S" in "receptionStreet").
  s = s.replace(/(\d+)\s*receptions\s*/gi, "$1 reception · ");
  s = s.replace(/(\d+)\s*reception(?=\s|[·,]|$|[A-Za-z]|\d)/gi, "$1 reception · ");
  s = s.replace(/\s*·\s*(?=·)/g, "");
  s = s.replace(/(?:\s*·\s*)+$/g, "").trim();
  s = s.replace(/\s{2,}/g, " ");

  const share = isLikelyRoomOrHouseShareLetting(s);
  if (s.length > 130) {
    if (share) {
      s = `House-share · ${s.slice(0, 100).trimEnd()}…`;
    } else {
      s = `${s.slice(0, 127).trimEnd()}…`;
    }
  } else if (share && !/\bhouse[-\s]+share\b/i.test(s)) {
    s = `House-share · ${s}`;
  }

  return s || raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

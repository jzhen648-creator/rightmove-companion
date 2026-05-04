// Caps for rental comparables — smaller sets reduce noise from distant/outlier listings.

/** Parsed from each portal HTML before merge. */
export const RENT_COMP_RM_PARSE_MAX = 10;
export const RENT_COMP_ZOOPLA_PARSE_MAX = 8;
export const RENT_COMP_PRIMELOCATION_PARSE_MAX = 8;

/** After merge + dedupe: used for market band, LLM, and the Rent tab list. */
export const RENT_COMP_MERGED_MAX = 15;

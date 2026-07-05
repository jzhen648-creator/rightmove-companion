import { describe, expect, it } from "vitest";
import { tidyComparableSummaryLine } from "../comparableDisplayTidy";
import { isLikelyRoomOrHouseShareLetting } from "../rentalSearchHtmlParser";

describe("tidyComparableSummaryLine", () => {
  it("keeps house-share signals when marketing trim would remove them", () => {
    const raw =
      "3 bed 1 bath Princes View Dartford DA1 £550 pcm We are pleased to offer 3 delightful rooms within a 4-bedroom, 1-bathroom shared house";
    const out = tidyComparableSummaryLine(raw);
    expect(isLikelyRoomOrHouseShareLetting(out)).toBe(true);
    expect(out).toMatch(/House-share|shared|rooms within/i);
  });

  it("strips Highlight and pw noise, trims before marketing", () => {
    const raw =
      "Highlight(£1,550 pcm)(£357.69 pw)2 beds2 baths1 receptionMain Road, Exampleton DA1 Welcome to this delightful two-bedroom apartment";
    const out = tidyComparableSummaryLine(raw);
    expect(out).not.toMatch(/Highlight/i);
    expect(out).not.toMatch(/357\.69\s*pw/i);
    expect(out).not.toMatch(/Welcome to/i);
    expect(out).toMatch(/Main Road/i);
    expect(out.length).toBeLessThanOrEqual(135);
  });
});

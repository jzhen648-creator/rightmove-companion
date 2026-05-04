import { describe, expect, it } from "vitest";
import { tidyComparableSummaryLine } from "../comparableDisplayTidy";

describe("tidyComparableSummaryLine", () => {
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

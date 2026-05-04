// MV3 service workers have no `DOMParser`; linkedom supplies a minimal `Document` instead.
import { parseHTML } from "linkedom";
import { mergeLettingComparablesFromSearchDocument } from "./rentalSearchHtmlParser";
import type { RentComparable } from "./types";

export function parseLettingsSearchResultHtml(
  html: string,
  maximum = 40,
): RentComparable[] {
  const { document } = parseHTML(html);
  return mergeLettingComparablesFromSearchDocument(
    document as unknown as Document,
    maximum,
  );
}

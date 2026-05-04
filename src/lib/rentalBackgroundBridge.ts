// Message bridge from the content script to the MV3 service worker for rental fetches.
import type { LettingsSearchLocationHint } from "./rentEstimate";
import type { ListingRentProfile, RentalAssessment, RentComparable } from "./types";

export interface FetchRentalsResponse {
  comparables: RentComparable[];
  locationUsed: string;
  market: RentalAssessment | null;
  llm: RentalAssessment | null;
  error?: string;
}

export function fetchRentalsViaBackground(
  postcode: string,
  beds: number,
  listing: ListingRentProfile,
  lettingsLocationHint?: LettingsSearchLocationHint | null,
): Promise<FetchRentalsResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "fetchRentals",
        postcode,
        beds,
        listing,
        lettingsLocationHint: lettingsLocationHint ?? null,
      },
      (response: FetchRentalsResponse | undefined) => {
        if (chrome.runtime.lastError) {
          resolve({
            comparables: [],
            locationUsed: postcode,
            market: null,
            llm: null,
            error: chrome.runtime.lastError.message,
          });
          return;
        }

        resolve(
          response ?? {
            comparables: [],
            locationUsed: postcode,
            market: null,
            llm: null,
            error: "No response from the extension background worker.",
          },
        );
      },
    );
  });
}

// Message bridge from the content script to the MV3 service worker for sold-price fetches.
import type {
  ListingAddressHint,
  SoldPriceHistory,
  SoldPropertyType,
} from "./types";

export function fetchSoldPricesViaBackground(
  postcode: string,
  addressHint: ListingAddressHint | null,
  propertyType: SoldPropertyType | null,
  askingPrice: number | null,
): Promise<SoldPriceHistory | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "fetchSoldPrices",
        postcode,
        addressHint,
        propertyType,
        askingPrice,
      },
      (response: SoldPriceHistory | null | undefined) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response ?? null);
      },
    );
  });
}

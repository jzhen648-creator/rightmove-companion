// Re-parse the listing after Rightmove injects async widgets (price, rent estimate, etc.).
import { useEffect, useRef } from "react";
import { parseRightmovePage } from "../../lib/pageParser";
import type { RightmovePageInfo } from "../../lib/types";

function pageLikelyHasListingWidgets(): boolean {
  if (
    document.querySelector(
      '[data-test="property-header-price"], [data-test="property-price"], [data-test="price"]',
    )
  ) {
    return true;
  }

  const text = document.body?.innerText ?? "";
  return /rental estimate|estimated monthly rent|pcm\b/i.test(text);
}

export function useRightmoveParseRefresh(
  isReady: boolean,
  hasRefreshedPageData: boolean,
  onParsed: (pageInfo: RightmovePageInfo) => void,
): void {
  const onParsedRef = useRef(onParsed);
  onParsedRef.current = onParsed;

  useEffect(() => {
    if (!isReady || hasRefreshedPageData) {
      return;
    }

    let cancelled = false;
    let finished = false;
    let parseGeneration = 0;
    let debounceTimer: number | undefined;
    let fallbackTimer: number | undefined;

    const complete = (pageInfo: RightmovePageInfo) => {
      if (cancelled || finished) {
        return;
      }
      finished = true;
      window.clearTimeout(debounceTimer);
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
      onParsedRef.current(pageInfo);
    };

    const runParse = async () => {
      const generation = ++parseGeneration;
      const pageInfo = await parseRightmovePage();
      if (cancelled || generation !== parseGeneration) {
        return;
      }
      complete(pageInfo);
    };

    const scheduleParse = () => {
      if (finished) {
        return;
      }
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void runParse(), 420);
    };

    const observer = new MutationObserver(() => {
      if (pageLikelyHasListingWidgets()) {
        scheduleParse();
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
    });

    if (pageLikelyHasListingWidgets()) {
      scheduleParse();
    }

    fallbackTimer = window.setTimeout(() => void runParse(), 3200);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(debounceTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [isReady, hasRefreshedPageData]);
}

// Wrapper functions around chrome.storage.local so the UI code stays simple.
import { parseDealRecordsForImport } from "./savedDealsCodec";
import type { DealRecord, InvestmentInputs, PageDraft, SoldPriceHistory } from "./types";

const STORAGE_KEYS = {
  defaultSettings: "rmia_default_settings",
  pageDrafts: "rmia_page_drafts",
  savedDeals: "rmia_saved_deals",
  panelOpen: "rmia_panel_open",
} as const;

const MAX_SAVED_DEALS = 50;

export interface StorageWriteResult {
  ok: boolean;
  errorMessage?: string;
}

function canUseChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

function getLastErrorMessage(): string | undefined {
  return chrome.runtime?.lastError?.message;
}

/** After an extension reload, old content scripts lose their API connection; storage calls fail harmlessly. */
function isBenignInvalidatedContextMessage(message?: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("extension context invalidated") ||
    m.includes("message port closed") ||
    m.includes("receiving end does not exist")
  );
}

function storageGet<T>(key: string): Promise<T | undefined> {
  if (!canUseChromeStorage()) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (result) => {
        if (chrome.runtime?.lastError) {
          resolve(undefined);
          return;
        }
        resolve(result[key] as T | undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function storageSet<T>(key: string, value: T): Promise<StorageWriteResult> {
  if (!canUseChromeStorage()) {
    return Promise.resolve({
      ok: false,
      errorMessage: "Chrome storage is not available (extension context missing).",
    });
  }

  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime?.lastError) {
          resolve({
            ok: false,
            errorMessage: getLastErrorMessage() ?? "Unknown chrome.storage error.",
          });
          return;
        }
        resolve({ ok: true });
      });
    } catch (err) {
      resolve({
        ok: false,
        errorMessage:
          err instanceof Error && err.message
            ? err.message
            : "Extension context invalidated. Reload the extension and refresh the tab.",
      });
    }
  });
}

function assertWriteOk(result: StorageWriteResult, action: string): void {
  if (!result.ok) {
    throw new Error(result.errorMessage ?? `${action} failed.`);
  }
}

export async function getSavedSettings(): Promise<Partial<InvestmentInputs>> {
  return (await storageGet<Partial<InvestmentInputs>>(STORAGE_KEYS.defaultSettings)) ?? {};
}

export async function saveDefaultSettings(settings: Partial<InvestmentInputs>): Promise<void> {
  const result = await storageSet(STORAGE_KEYS.defaultSettings, settings);
  assertWriteOk(result, "Saving default settings");
}

function normalizePageDraft(
  raw: PageDraft | InvestmentInputs | undefined,
): PageDraft | undefined {
  if (!raw) {
    return undefined;
  }
  if (typeof raw === "object" && "inputs" in raw && raw.inputs) {
    return raw as PageDraft;
  }
  return { inputs: raw as InvestmentInputs };
}

export async function getPageDraft(pageUrl: string): Promise<InvestmentInputs | undefined> {
  const drafts =
    (await storageGet<Record<string, PageDraft | InvestmentInputs>>(STORAGE_KEYS.pageDrafts)) ??
    {};

  return normalizePageDraft(drafts[pageUrl])?.inputs;
}

export async function getPageDraftSoldPriceHistory(
  pageUrl: string,
): Promise<SoldPriceHistory | null | undefined> {
  const drafts =
    (await storageGet<Record<string, PageDraft | InvestmentInputs>>(STORAGE_KEYS.pageDrafts)) ??
    {};

  return normalizePageDraft(drafts[pageUrl])?.soldPriceHistory;
}

export async function savePageDraft(pageUrl: string, inputs: InvestmentInputs): Promise<void> {
  const drafts =
    (await storageGet<Record<string, PageDraft | InvestmentInputs>>(STORAGE_KEYS.pageDrafts)) ??
    {};

  const existing = normalizePageDraft(drafts[pageUrl]);
  drafts[pageUrl] = {
    inputs,
    ...(existing?.soldPriceHistory !== undefined
      ? { soldPriceHistory: existing.soldPriceHistory }
      : {}),
  };
  const result = await storageSet(STORAGE_KEYS.pageDrafts, drafts);
  if (!result.ok && !isBenignInvalidatedContextMessage(result.errorMessage)) {
    console.warn("[Companion] Could not save page draft:", result.errorMessage);
  }
}

export async function savePageDraftSoldPriceHistory(
  pageUrl: string,
  soldPriceHistory: SoldPriceHistory | null,
  inputs: InvestmentInputs,
): Promise<void> {
  const drafts =
    (await storageGet<Record<string, PageDraft | InvestmentInputs>>(STORAGE_KEYS.pageDrafts)) ??
    {};

  drafts[pageUrl] = { inputs, soldPriceHistory };
  const result = await storageSet(STORAGE_KEYS.pageDrafts, drafts);
  if (!result.ok && !isBenignInvalidatedContextMessage(result.errorMessage)) {
    console.warn("[Companion] Could not save sold price cache:", result.errorMessage);
  }
}

export async function getSavedDeals(): Promise<DealRecord[]> {
  return (await storageGet<DealRecord[]>(STORAGE_KEYS.savedDeals)) ?? [];
}

export async function saveDeal(deal: DealRecord): Promise<DealRecord[]> {
  const existingDeals = await getSavedDeals();
  const dealToStore: DealRecord = { ...deal };
  if (dealToStore.notes !== undefined) {
    const trimmed = dealToStore.notes.trim();
    if (trimmed) {
      dealToStore.notes = trimmed.slice(0, 2000);
    } else {
      delete dealToStore.notes;
    }
  }

  const updatedDeals = [dealToStore, ...existingDeals.filter((item) => item.id !== deal.id)].slice(
    0,
    MAX_SAVED_DEALS,
  );

  const result = await storageSet(STORAGE_KEYS.savedDeals, updatedDeals);
  assertWriteOk(result, "Saving deal");
  return updatedDeals;
}

export async function saveDealNotes(dealId: string, notes: string): Promise<DealRecord[]> {
  const existingDeals = await getSavedDeals();
  const index = existingDeals.findIndex((deal) => deal.id === dealId);

  if (index === -1) {
    return existingDeals;
  }

  const trimmed = notes.trim();
  const next = [...existingDeals];
  next[index] = {
    ...next[index],
    ...(trimmed ? { notes: trimmed.slice(0, 2000) } : { notes: undefined }),
  };

  if (!next[index].notes) {
    delete next[index].notes;
  }

  const result = await storageSet(STORAGE_KEYS.savedDeals, next);
  assertWriteOk(result, "Saving deal notes");
  return next;
}

export async function importSavedDealsFromJson(
  jsonText: string,
): Promise<{ deals: DealRecord[]; importedCount: number; skipped: number; errors: string[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    return {
      deals: await getSavedDeals(),
      importedCount: 0,
      skipped: 0,
      errors: ["File is not valid JSON."],
    };
  }

  const { deals: incoming, skipped, errors } = parseDealRecordsForImport(parsed);

  if (incoming.length === 0) {
    return { deals: await getSavedDeals(), importedCount: 0, skipped, errors };
  }

  const existing = await getSavedDeals();
  const byId = new Map<string, DealRecord>();
  for (const deal of incoming) {
    byId.set(deal.id, deal);
  }
  for (const deal of existing) {
    if (!byId.has(deal.id)) {
      byId.set(deal.id, deal);
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => {
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });

  const capped = merged.slice(0, MAX_SAVED_DEALS);
  const result = await storageSet(STORAGE_KEYS.savedDeals, capped);
  assertWriteOk(result, "Importing deals");
  return {
    deals: capped,
    importedCount: incoming.length,
    skipped,
    errors,
  };
}

export async function deleteSavedDeal(dealId: string): Promise<DealRecord[]> {
  const existingDeals = await getSavedDeals();
  const updatedDeals = existingDeals.filter((deal) => deal.id !== dealId);

  const result = await storageSet(STORAGE_KEYS.savedDeals, updatedDeals);
  assertWriteOk(result, "Deleting deal");
  return updatedDeals;
}

export async function getIsPanelOpen(): Promise<boolean> {
  return (await storageGet<boolean>(STORAGE_KEYS.panelOpen)) ?? true;
}

export async function saveIsPanelOpen(value: boolean): Promise<void> {
  const result = await storageSet(STORAGE_KEYS.panelOpen, value);
  if (!result.ok && !isBenignInvalidatedContextMessage(result.errorMessage)) {
    console.warn("[Companion] Could not save panel open state:", result.errorMessage);
  }
}

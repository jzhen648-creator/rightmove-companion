// Main React UI for the Rightmove Companion overlay.
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateInvestmentMetrics } from "../lib/calculations";
import { DEFAULT_INPUTS } from "../lib/defaults";
import { syncDepositValues } from "../lib/deposit";
import {
  formatCurrency,
  formatPercent,
  formatSavedAt,
} from "../lib/formatters";
import {
  applyPropertyGoalDefaults,
  getCalculationInputsForPropertyGoal,
  getPropertyGoalConfig,
  PROPERTY_GOAL_OPTIONS,
} from "../lib/propertyGoals";
import { parseRightmovePage } from "../lib/pageParser";
import { tidyComparableSummaryLine } from "../lib/comparableDisplayTidy";
import { extractListingRentProfile } from "../lib/listingProfile";
import {
  deriveListingAddressHint,
  inferSoldPropertyTypeFromListing,
} from "../lib/listingAddressHint";
import { fetchRentalsViaBackground } from "../lib/rentalBackgroundBridge";
import { fetchSoldPricesViaBackground } from "../lib/soldPriceBackgroundBridge";
import {
  getPreferredLettingsSearchLocation,
  lettingsSearchHintFromListingProfile,
} from "../lib/rentEstimate";
import { buildBuyToLetEvaluationSummary } from "../lib/resultEvaluation";
import { serialiseDealsForExport } from "../lib/savedDealsCodec";
import {
  deleteSavedDeal,
  getIsPanelOpen,
  getPageDraft,
  getPageDraftSoldPriceHistory,
  getSavedDeals,
  getSavedSettings,
  importSavedDealsFromJson,
  saveDeal,
  saveDealNotes,
  saveDefaultSettings,
  saveIsPanelOpen,
  savePageDraft,
  savePageDraftSoldPriceHistory,
} from "../lib/storage";
import type {
  DealRecord,
  InvestmentInputs,
  PersonalSdltStatus,
  PropertyGoal,
  PurchaseStructure,
  RentalAssessment,
  RentComparable,
  RightmovePageInfo,
  SdltResidenceType,
  SoldPriceHistory,
  SoldPropertyType,
} from "../lib/types";
import {
  depositAmountField,
  depositPercentField,
  monthlyRentField,
  mortgageRateField,
  mortgageTermField,
  personalSdltStatusOptions,
  purchasePriceField,
  purchaseStructureOptions,
  POUND_SYMBOL,
  recurringCostFields,
  sdltResidenceOptions,
  upfrontCostFields,
} from "./fieldMeta";
import type { EditableNumberKey } from "./fieldMeta";
import {
  applyParsedPageInfoToInputs,
  buildStartingInputs,
  buildStatusMessage,
  formatMultiple,
  getFieldNoteText,
  getSdltHelperText,
  pickDefaultSettings,
  verdictLabel,
} from "./stateHelpers";
import {
  DetailItem,
  EvaluationNotesBox,
  NumberField,
  openListingInNewTab,
  PlaceholderField,
  RentRangeGauge,
  ResultCard,
  ScoreSummaryBox,
  SoldPriceHistorySection,
  ToggleField,
} from "./components/AnalyzerWidgets";
import { useRightmoveParseRefresh } from "./hooks/useRightmoveParseRefresh";

type ActiveTab = "calculator" | "rent" | "saved";

type SavedDealSort = "newest" | "oldest" | "score-high" | "score-low";

const SOLD_PRICE_CACHE_MS = 24 * 60 * 60 * 1000;

function isSoldPriceCacheFresh(history: SoldPriceHistory | null | undefined): boolean {
  if (!history?.fetchedAt) {
    return false;
  }
  return Date.now() - history.fetchedAt < SOLD_PRICE_CACHE_MS;
}

function useFilteredSortedDeals(
  deals: DealRecord[],
  query: string,
  sort: SavedDealSort,
): DealRecord[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = deals;

    if (q) {
      list = deals.filter((deal) => {
        const hay = `${deal.address} ${deal.title} ${deal.notes ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const next = [...list];
    next.sort((a, b) => {
      if (sort === "newest" || sort === "oldest") {
        const ta = new Date(a.savedAt).getTime();
        const tb = new Date(b.savedAt).getTime();
        return sort === "newest" ? tb - ta : ta - tb;
      }
      const sa = a.results.investorScore;
      const sb = b.results.investorScore;
      return sort === "score-high" ? sb - sa : sa - sb;
    });

    return next;
  }, [deals, query, sort]);
}

export default function App() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("calculator");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [hasRefreshedPageData, setHasRefreshedPageData] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Loading property details...",
  );
  const [loadingStep, setLoadingStep] = useState(0);
  const [defaultSettings, setDefaultSettings] = useState<
    Partial<InvestmentInputs>
  >({});
  const [pageInfo, setPageInfo] = useState<RightmovePageInfo>({
    url: window.location.href,
    title: document.title,
    address: document.title,
    askingPrice: null,
    priceSource: "manual entry",
    floorAreaSqFt: null,
    leaseLengthText: null,
    groundRentReview: null,
    parsedFields: {},
    rentEstimate: null,
  });
  const [inputs, setInputs] = useState<InvestmentInputs>(DEFAULT_INPUTS);
  const [savedDeals, setSavedDeals] = useState<DealRecord[]>([]);
  const [saveDealNotesDraft, setSaveDealNotesDraft] = useState("");
  const [savedDealsQuery, setSavedDealsQuery] = useState("");
  const [savedDealsSort, setSavedDealsSort] = useState<SavedDealSort>("newest");
  const [rentFromSearch, setRentFromSearch] = useState<{
    loading: boolean;
    error: string | null;
    comparables: RentComparable[];
    locationUsed: string;
    market: RentalAssessment | null;
    llm: RentalAssessment | null;
  }>({
    loading: false,
    error: null,
    comparables: [],
    locationUsed: "",
    market: null,
    llm: null,
  });
  const [soldPriceHistory, setSoldPriceHistory] = useState<SoldPriceHistory | null>(null);
  const [soldPriceLoading, setSoldPriceLoading] = useState(false);
  const [soldPriceExpanded, setSoldPriceExpanded] = useState(false);
  const soldPriceHistoryRef = useRef<SoldPriceHistory | null>(null);
  const soldPriceFetchInFlight = useRef(false);

  soldPriceHistoryRef.current = soldPriceHistory;

  const visibleSavedDeals = useFilteredSortedDeals(
    savedDeals,
    savedDealsQuery,
    savedDealsSort,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setLoadingStep(1);
      setStatusMessage(
        "Loading property details... (1/3) Reading listing (price, charges, area).",
      );

      const detectedPageInfo = await parseRightmovePage();

      setLoadingStep(2);
      setStatusMessage(
        "Loading property details... (2/3) Reading saved settings, saved deals, and panel state.",
      );

      const [savedSettings, pageDraft, existingSavedDeals, savedPanelOpen, cachedSoldPrice] =
        await Promise.all([
          getSavedSettings(),
          getPageDraft(detectedPageInfo.url),
          getSavedDeals(),
          getIsPanelOpen(),
          getPageDraftSoldPriceHistory(detectedPageInfo.url),
        ]);

      if (cancelled) {
        return;
      }

      setPageInfo(detectedPageInfo);
      setDefaultSettings(savedSettings);
      setInputs(
        buildStartingInputs(detectedPageInfo, savedSettings, pageDraft),
      );
      setSavedDeals(existingSavedDeals);
      const existingForPage = existingSavedDeals.find(
        (deal) => deal.id === detectedPageInfo.url,
      );
      setSaveDealNotesDraft(existingForPage?.notes ?? "");
      if (cachedSoldPrice && isSoldPriceCacheFresh(cachedSoldPrice)) {
        setSoldPriceHistory(cachedSoldPrice);
      }
      setStatusMessage(
        "Loading property details... (3/3) Finalizing the panel and showing results.",
      );
      setIsOpen(savedPanelOpen);
      setIsReady(true);
      setStatusMessage(buildStatusMessage(detectedPageInfo));
      setLoadingStep(3);
    }

    void loadPageData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let cancelled = false;
    void getPageDraftSoldPriceHistory(pageInfo.url).then((cached) => {
      if (cancelled) {
        return;
      }
      if (cached && isSoldPriceCacheFresh(cached)) {
        setSoldPriceHistory(cached);
      } else {
        setSoldPriceHistory(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isReady, pageInfo.url]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      void savePageDraft(pageInfo.url, inputs);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [inputs, isReady, pageInfo.url]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void saveIsPanelOpen(isOpen);
  }, [isOpen, isReady]);

  useRightmoveParseRefresh(isReady, hasRefreshedPageData, (refreshed) => {
    setPageInfo(refreshed);
    setInputs((currentInputs) =>
      applyParsedPageInfoToInputs(currentInputs, refreshed),
    );
    setStatusMessage(buildStatusMessage(refreshed));
    setHasRefreshedPageData(true);
  });

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (inputs.propertyGoal !== "buy-to-let") {
      setRentFromSearch({
        loading: false,
        error: null,
        comparables: [],
        locationUsed: "",
        market: null,
        llm: null,
      });
      return;
    }

    const profile = extractListingRentProfile(pageInfo);
    const postcode = profile.postcode;
    if (!postcode) {
      setRentFromSearch({
        loading: false,
        error:
          "No UK postcode found on this listing — the extension needs a postcode to load comparable lettings.",
        comparables: [],
        locationUsed: "",
        market: null,
        llm: null,
      });
      return;
    }

    let cancelled = false;
    setRentFromSearch((previous) => ({
      ...previous,
      loading: true,
      error: null,
    }));

    const beds = profile.beds ?? 0;
    const lettingsHint =
      lettingsSearchHintFromListingProfile(profile) ??
      getPreferredLettingsSearchLocation();
    void fetchRentalsViaBackground(postcode, beds, profile, lettingsHint).then((response) => {
      if (cancelled) {
        return;
      }

      setRentFromSearch({
        loading: false,
        error: response.error ?? null,
        comparables: response.comparables,
        locationUsed: response.locationUsed,
        market: response.market,
        llm: response.llm,
      });

      const best =
        response.llm?.bestEstimateMonthly ?? response.market?.bestEstimateMonthly;
      if (best && !pageInfo.rentEstimate) {
        setInputs((previous) => {
          if (previous.monthlyRent > 0) {
            return previous;
          }
          return syncDepositValues(
            applyPropertyGoalDefaults({
              ...previous,
              monthlyRent: best,
            }),
          );
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isReady, inputs.propertyGoal, pageInfo]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const profile = extractListingRentProfile(pageInfo);
    const postcode = profile.postcode;
    if (!postcode) {
      return;
    }
    if (isSoldPriceCacheFresh(soldPriceHistoryRef.current)) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || soldPriceFetchInFlight.current) {
        return;
      }

      soldPriceFetchInFlight.current = true;
      setSoldPriceLoading(true);

      const addressHint = deriveListingAddressHint(pageInfo.address);
      const propertyType = inferSoldPropertyTypeFromListing(
        pageInfo.address,
        profile.propertyType,
      );
      const askingPrice =
        inputs.askingPrice > 0 ? inputs.askingPrice : (pageInfo.askingPrice ?? null);

      void fetchSoldPricesViaBackground(
        postcode,
        addressHint,
        propertyType,
        askingPrice,
      ).then((result) => {
        soldPriceFetchInFlight.current = false;
        if (cancelled) {
          return;
        }
        setSoldPriceLoading(false);
        if (result) {
          setSoldPriceHistory(result);
          void savePageDraftSoldPriceHistory(pageInfo.url, result, inputs);
        }
      });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    isReady,
    pageInfo,
    inputs.askingPrice,
    inputs,
  ]);

  const propertyGoalConfig = getPropertyGoalConfig(inputs.propertyGoal);
  const calculationInputs = getCalculationInputsForPropertyGoal(inputs);
  const results = calculateInvestmentMetrics(calculationInputs, pageInfo);
  const isBuyToLetMode = inputs.propertyGoal === "buy-to-let";
  const isLimitedCompanyPurchase =
    inputs.purchaseStructure === "limited-company";
  const askingPricePerSqFt =
    pageInfo.floorAreaSqFt && inputs.askingPrice > 0
      ? inputs.askingPrice / pageInfo.floorAreaSqFt
      : null;
  const listingRentProfile = useMemo(
    () => extractListingRentProfile(pageInfo),
    [pageInfo],
  );
  const soldPricePostcode = listingRentProfile.postcode;
  const soldPricePropertyType = useMemo(
    (): SoldPropertyType | null =>
      inferSoldPropertyTypeFromListing(
        pageInfo.address,
        listingRentProfile.propertyType,
      ),
    [pageInfo.address, listingRentProfile.propertyType],
  );

  const requestSoldPricesOnExpand = (): void => {
    if (!isReady || soldPriceFetchInFlight.current) {
      return;
    }
    const postcode = listingRentProfile.postcode;
    if (!postcode) {
      return;
    }
    if (isSoldPriceCacheFresh(soldPriceHistoryRef.current)) {
      return;
    }

    soldPriceFetchInFlight.current = true;
    setSoldPriceLoading(true);
    const addressHint = deriveListingAddressHint(pageInfo.address);
    const askingPrice =
      inputs.askingPrice > 0 ? inputs.askingPrice : (pageInfo.askingPrice ?? null);

    void fetchSoldPricesViaBackground(
      postcode,
      addressHint,
      soldPricePropertyType,
      askingPrice,
    ).then((result) => {
      soldPriceFetchInFlight.current = false;
      setSoldPriceLoading(false);
      if (result) {
        setSoldPriceHistory(result);
        void savePageDraftSoldPriceHistory(pageInfo.url, result, inputs);
      }
    });
  };

  const rentHeroBand = useMemo(() => {
    if (rentFromSearch.llm) {
      return {
        min: rentFromSearch.llm.minMonthly,
        max: rentFromSearch.llm.maxMonthly,
        best: rentFromSearch.llm.bestEstimateMonthly,
        subtitle: "Refined estimate",
        rationale: rentFromSearch.llm.rationale,
      };
    }
    if (rentFromSearch.market) {
      return {
        min: rentFromSearch.market.minMonthly,
        max: rentFromSearch.market.maxMonthly,
        best: rentFromSearch.market.bestEstimateMonthly,
        subtitle: "From merged lettings search",
        rationale: rentFromSearch.market.rationale,
      };
    }
    if (pageInfo.rentEstimate) {
      return {
        min: pageInfo.rentEstimate.min,
        max: pageInfo.rentEstimate.max,
        best: pageInfo.rentEstimate.estimate,
        subtitle: `On-page widget · ${pageInfo.rentEstimate.source}`,
        rationale: [] as string[],
      };
    }
    return null;
  }, [rentFromSearch.llm, rentFromSearch.market, pageInfo.rentEstimate]);

  const visibleRecurringFields = recurringCostFields.filter((field) => {
    if (field.key === "managementPercent") {
      return propertyGoalConfig.showManagementField;
    }
    if (field.key === "voidPercent") {
      return propertyGoalConfig.showVoidField;
    }
    return true;
  });

  const primaryCards = propertyGoalConfig.showInvestmentMetrics
    ? [
        {
          label: "Monthly cash flow",
          value: formatCurrency(results.monthlyCashFlow, true),
          tone:
            results.monthlyCashFlow >= 0
              ? ("success" as const)
              : ("warning" as const),
        },
        {
          label: "Cash-on-cash return",
          value: formatPercent(results.cashOnCashReturn),
          tone: "neutral" as const,
        },
        {
          label: "ICR / debt safety",
          value: formatMultiple(results.interestCoverageRatio),
          tone: "neutral" as const,
        },
        {
          label: "Gross yield",
          value: formatPercent(results.grossYield),
          tone: "neutral" as const,
        },
      ]
    : [
        {
          label: "Monthly mortgage",
          value: formatCurrency(results.monthlyMortgagePayment, true),
          tone: "neutral" as const,
        },
        {
          label: "Total cash needed",
          value: formatCurrency(results.totalCashInvested),
          tone: "neutral" as const,
        },
        {
          label: "SDLT",
          value: formatCurrency(results.sdltAmount),
          tone: "neutral" as const,
        },
        {
          label: "Monthly recurring costs",
          value: formatCurrency(results.monthlyOperatingCosts, true),
          tone: "neutral" as const,
        },
      ];

  const detailItems = propertyGoalConfig.showInvestmentMetrics
    ? [
        {
          label: "Monthly mortgage",
          value: formatCurrency(results.monthlyMortgagePayment, true),
        },
        {
          label: "Annual cash flow",
          value: formatCurrency(results.annualCashFlow, true),
        },
        {
          label: "Total cash invested",
          value: formatCurrency(results.totalCashInvested),
        },
        { label: "Loan amount", value: formatCurrency(results.loanAmount) },
        {
          label: "Deposit amount",
          value: formatCurrency(results.depositAmount),
        },
        { label: "SDLT", value: formatCurrency(results.sdltAmount) },
        {
          label: "Monthly recurring costs",
          value: formatCurrency(results.monthlyOperatingCosts, true),
        },
        {
          label: "Annual recurring costs",
          value: formatCurrency(results.annualOperatingCosts, true),
        },
        ...(askingPricePerSqFt !== null
          ? [
              {
                label: "Purchase price / sq ft",
                value: `${formatCurrency(askingPricePerSqFt, true)} / sq ft`,
              },
            ]
          : []),
      ]
    : [
        { label: "Loan amount", value: formatCurrency(results.loanAmount) },
        {
          label: "Deposit amount",
          value: formatCurrency(results.depositAmount),
        },
        {
          label: "Monthly mortgage",
          value: formatCurrency(results.monthlyMortgagePayment, true),
        },
        {
          label: "Annual mortgage cost",
          value: formatCurrency(results.annualMortgageCost, true),
        },
        { label: "SDLT", value: formatCurrency(results.sdltAmount) },
        {
          label: "Monthly recurring costs",
          value: formatCurrency(results.monthlyOperatingCosts, true),
        },
        {
          label: "Annual recurring costs",
          value: formatCurrency(results.annualOperatingCosts, true),
        },
        ...(askingPricePerSqFt !== null
          ? [
              {
                label: "Purchase price / sq ft",
                value: `${formatCurrency(askingPricePerSqFt, true)} / sq ft`,
              },
            ]
          : []),
      ];
  const evaluationSummary = propertyGoalConfig.showInvestorScore
    ? buildBuyToLetEvaluationSummary(calculationInputs, results, pageInfo)
    : null;

  function updateNumberField(field: EditableNumberKey, value: number): void {
    setInputs((currentInputs) => {
      if (field === "askingPrice") {
        return syncDepositValues({ ...currentInputs, askingPrice: value });
      }
      if (field === "depositAmount") {
        return syncDepositValues({
          ...currentInputs,
          depositAmount: value,
          depositInputMode: "amount",
        });
      }
      if (field === "depositPercent") {
        return syncDepositValues({
          ...currentInputs,
          depositPercent: value,
          depositInputMode: "percent",
        });
      }
      return { ...currentInputs, [field]: value };
    });
  }

  function updateSdltResidenceType(value: SdltResidenceType): void {
    setInputs((currentInputs) => ({
      ...currentInputs,
      sdltResidenceType: value,
    }));
  }

  function updatePurchaseStructure(value: PurchaseStructure): void {
    setInputs((currentInputs) => ({
      ...currentInputs,
      purchaseStructure: value,
    }));
  }

  function updatePersonalSdltStatus(value: PersonalSdltStatus): void {
    setInputs((currentInputs) => ({
      ...currentInputs,
      personalSdltStatus: value,
    }));
  }

  function updatePropertyGoal(value: PropertyGoal): void {
    setInputs((currentInputs) =>
      applyPropertyGoalDefaults({ ...currentInputs, propertyGoal: value }),
    );
  }

  async function handleSaveDefaults(): Promise<void> {
    try {
      const nextDefaultSettings = pickDefaultSettings(inputs);
      await saveDefaultSettings(nextDefaultSettings);
      setDefaultSettings(nextDefaultSettings);
      setStatusMessage("Default assumptions saved for future properties.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown storage error.";
      setStatusMessage(`Could not save defaults: ${message}`);
    }
  }

  async function handleSaveDeal(): Promise<void> {
    try {
      const trimmedNotes = saveDealNotesDraft.trim();
      const updatedDeals = await saveDeal({
        id: pageInfo.url,
        pageUrl: pageInfo.url,
        title: pageInfo.title,
        address: pageInfo.address,
        savedAt: new Date().toISOString(),
        inputs,
        results,
        ...(trimmedNotes ? { notes: trimmedNotes.slice(0, 2000) } : {}),
      });

      setSavedDeals(updatedDeals);
      setStatusMessage("Deal saved locally in Chrome storage.");
      setActiveTab("saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown storage error.";
      setStatusMessage(`Could not save deal: ${message}`);
    }
  }

  async function handleDeleteDeal(deal: DealRecord): Promise<void> {
    try {
      const updatedDeals = await deleteSavedDeal(deal.id);
      setSavedDeals(updatedDeals);
      setPendingDeleteId(null);
      setStatusMessage("Saved deal removed.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown storage error.";
      setStatusMessage(`Could not delete deal: ${message}`);
    }
  }

  function handleRestoreDeal(deal: DealRecord): void {
    setInputs(
      syncDepositValues(
        applyPropertyGoalDefaults({ ...DEFAULT_INPUTS, ...deal.inputs }),
      ),
    );
    setSaveDealNotesDraft(deal.notes ?? "");
    setStatusMessage(
      `Restored saved deal from ${formatSavedAt(deal.savedAt)}.`,
    );
  }

  function handleResetForm(): void {
    setInputs(buildStartingInputs(pageInfo, defaultSettings));
    setSaveDealNotesDraft("");
    setStatusMessage("Form reset to sensible defaults.");
  }

  function handleExportDeals(): void {
    const blob = new Blob([serialiseDealsForExport(savedDeals)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rightmove-saved-deals-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Exported saved deals as JSON.");
  }

  async function handleImportDealsFile(
    fileList: FileList | null,
  ): Promise<void> {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const { deals, importedCount, skipped, errors } =
        await importSavedDealsFromJson(text);
      setSavedDeals(deals);
      const parts = [
        `Imported ${importedCount} deal(s).`,
        skipped ? `${skipped} row(s) skipped.` : "",
        errors.length ? errors.slice(0, 3).join(" ") : "",
      ].filter(Boolean);
      setStatusMessage(parts.join(" "));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown storage error.";
      setStatusMessage(`Import failed: ${message}`);
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function handleDealNotesBlur(deal: DealRecord, notes: string): Promise<void> {
    const trimmedExisting = (deal.notes ?? "").trim();
    const trimmedNext = notes.trim();
    if (trimmedExisting === trimmedNext) {
      return;
    }

    try {
      const next = await saveDealNotes(deal.id, notes);
      setSavedDeals(next);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown storage error.";
      setStatusMessage(`Could not save notes: ${message}`);
    }
  }

  function handleApplyBenchmarkRent(): void {
    const best =
      rentFromSearch.llm?.bestEstimateMonthly ??
      rentFromSearch.market?.bestEstimateMonthly ??
      pageInfo.rentEstimate?.estimate;
    if (!best) {
      return;
    }
    updateNumberField("monthlyRent", best);
    setActiveTab("calculator");
    setStatusMessage("Monthly rent updated from the rent estimate.");
  }

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          className="rmia-launcher"
          aria-label="Open Rightmove Companion panel"
          onClick={() => setIsOpen(true)}
        >
          Rightmove Companion
        </button>
      ) : null}
      {isOpen ? (
        <aside
          className="rmia-panel"
          role="complementary"
          aria-label="Rightmove Companion"
        >
          <header className="rmia-panel-header">
            <div>
              <h1 className="rmia-title">Rightmove Companion</h1>
              <p className="rmia-subtitle">
                {pageInfo.address || "Current Rightmove property"}
              </p>
            </div>
            <button
              type="button"
              className="rmia-secondary-button rmia-panel-close"
              aria-label="Hide Rightmove Companion panel"
              onClick={() => setIsOpen(false)}
            >
              Hide
            </button>
          </header>

          <nav className="rmia-tab-bar" aria-label="Rightmove Companion sections">
            <button
              type="button"
              className={`rmia-tab${activeTab === "calculator" ? " rmia-tab--active" : ""}`}
              aria-selected={activeTab === "calculator"}
              role="tab"
              onClick={() => setActiveTab("calculator")}
            >
              Home
            </button>
            <button
              type="button"
              className={`rmia-tab${activeTab === "rent" ? " rmia-tab--active" : ""}`}
              aria-selected={activeTab === "rent"}
              role="tab"
              onClick={() => setActiveTab("rent")}
            >
              Rent estimate
              {pageInfo.rentEstimate ||
              rentFromSearch.market ||
              rentFromSearch.llm ||
              rentFromSearch.loading ? (
                <span className="rmia-tab-dot" />
              ) : null}
            </button>
            <button
              type="button"
              className={`rmia-tab${activeTab === "saved" ? " rmia-tab--active" : ""}`}
              aria-selected={activeTab === "saved"}
              role="tab"
              onClick={() => setActiveTab("saved")}
            >
              Saved properties
              {savedDeals.length > 0 ? (
                <span className="rmia-tab-badge">{savedDeals.length}</span>
              ) : null}
            </button>
          </nav>

          {isReady ? (
            <div className="rmia-property-strip" aria-label="Listing snapshot">
              <div className="rmia-property-strip-main">
                <span className="rmia-property-strip-price">
                  {inputs.askingPrice > 0 || (pageInfo.askingPrice ?? 0) > 0
                    ? formatCurrency(inputs.askingPrice || (pageInfo.askingPrice ?? 0))
                    : "Price not set"}
                </span>
                {pageInfo.floorAreaSqFt ? (
                  <span className="rmia-property-strip-meta">
                    {Math.round(pageInfo.floorAreaSqFt).toLocaleString("en-GB")} sq ft
                  </span>
                ) : null}
              </div>
              {pageInfo.priceSource ? (
                <span className="rmia-property-strip-pill" title={pageInfo.priceSource}>
                  {pageInfo.priceSource.length > 26
                    ? `${pageInfo.priceSource.slice(0, 26)}…`
                    : pageInfo.priceSource}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="rmia-status-row">
            <p className="rmia-status">{statusMessage}</p>
            {!isReady && loadingStep > 0 ? (
              <span className="rmia-loading-step">Step {loadingStep} of 3</span>
            ) : null}
          </div>

          {activeTab === "calculator" ? (
            <>
              <section className="rmia-section rmia-section--goal">
                <div className="rmia-section-heading">
                  <h2>Property goal</h2>
                </div>
                <div className="rmia-grid">
                  <ToggleField
                    label="Property goal"
                    value={inputs.propertyGoal}
                    options={PROPERTY_GOAL_OPTIONS}
                    helperText={propertyGoalConfig.description}
                    fullWidth
                    onChange={(value) =>
                      updatePropertyGoal(value as PropertyGoal)
                    }
                  />
                </div>
              </section>

              {pageInfo.leaseLengthText ? (
                <div className="rmia-info-pill">
                  <strong>Lease info</strong>
                  <span>{pageInfo.leaseLengthText}</span>
                </div>
              ) : null}

              <section className="rmia-section">
                <div className="rmia-section-heading">
                  <h2>Finance</h2>
                  <span className="rmia-section-note">
                    {propertyGoalConfig.showRentField
                      ? `Interest-only basis. ${POUND_SYMBOL} and % deposit stay linked.`
                      : "Repayment mortgage basis."}
                  </span>
                </div>
                <div className="rmia-grid rmia-grid--finance">
                  <NumberField
                    field={purchasePriceField}
                    value={inputs.askingPrice}
                    onChange={(value) =>
                      updateNumberField("askingPrice", value)
                    }
                  />

                  {soldPricePostcode ? (
                    <SoldPriceHistorySection
                      expanded={soldPriceExpanded}
                      loading={soldPriceLoading}
                      history={soldPriceHistory}
                      postcode={soldPricePostcode}
                      propertyType={soldPricePropertyType}
                      onToggle={(expanded) => {
                        setSoldPriceExpanded(expanded);
                        if (expanded) {
                          requestSoldPricesOnExpand();
                        }
                      }}
                    />
                  ) : null}

                  {propertyGoalConfig.showRentField ? (
                    <NumberField
                      field={monthlyRentField}
                      value={inputs.monthlyRent}
                      noteText={
                        pageInfo.rentEstimate
                          ? "Estimate available →"
                          : undefined
                      }
                      onChange={(value) =>
                        updateNumberField("monthlyRent", value)
                      }
                    />
                  ) : (
                    <PlaceholderField
                      label="Monthly rent"
                      helperText="Not used in Standard purchase mode."
                      placeholderText="N/A"
                    />
                  )}

                  <NumberField
                    field={depositAmountField}
                    value={inputs.depositAmount}
                    helperText={depositAmountField.helperText}
                    onChange={(value) =>
                      updateNumberField("depositAmount", value)
                    }
                  />

                  <NumberField
                    field={depositPercentField}
                    value={inputs.depositPercent}
                    onChange={(value) =>
                      updateNumberField("depositPercent", value)
                    }
                  />

                  <NumberField
                    field={mortgageRateField}
                    value={inputs.mortgageRatePercent}
                    onChange={(value) =>
                      updateNumberField("mortgageRatePercent", value)
                    }
                  />

                  {propertyGoalConfig.showMortgageTerm ? (
                    <NumberField
                      field={mortgageTermField}
                      value={inputs.mortgageTermYears}
                      onChange={(value) =>
                        updateNumberField("mortgageTermYears", value)
                      }
                    />
                  ) : (
                    <PlaceholderField
                      label="Mortgage term"
                      helperText="Not used in Buy-to-let mode."
                      placeholderText="N/A"
                    />
                  )}
                </div>
              </section>

              <section className="rmia-section rmia-section--upfront">
                <div className="rmia-section-heading">
                  <h2>Purchase costs</h2>
                  <span className="rmia-section-note">
                    Increase total cash invested only
                  </span>
                </div>
                <div className="rmia-grid">
                  {upfrontCostFields.map((field) => (
                    <NumberField
                      key={field.key}
                      field={field}
                      value={inputs[field.key]}
                      onChange={(value) => updateNumberField(field.key, value)}
                    />
                  ))}

                  {isBuyToLetMode ? (
                    <ToggleField
                      label="Purchase structure"
                      value={inputs.purchaseStructure}
                      options={purchaseStructureOptions}
                      helperText={getSdltHelperText(inputs)}
                      fullWidth
                      onChange={(value) =>
                        updatePurchaseStructure(value as PurchaseStructure)
                      }
                    />
                  ) : (
                    <ToggleField
                      label="SDLT status"
                      value={inputs.sdltResidenceType}
                      options={sdltResidenceOptions}
                      helperText={getSdltHelperText(inputs)}
                      fullWidth
                      onChange={(value) =>
                        updateSdltResidenceType(value as SdltResidenceType)
                      }
                    />
                  )}

                  {isBuyToLetMode && !isLimitedCompanyPurchase ? (
                    <ToggleField
                      label="Personal SDLT status"
                      value={inputs.personalSdltStatus}
                      options={personalSdltStatusOptions}
                      helperText="Decides whether personal BTL uses standard or higher SDLT rates."
                      fullWidth
                      onChange={(value) =>
                        updatePersonalSdltStatus(value as PersonalSdltStatus)
                      }
                    />
                  ) : null}

                  <div className="rmia-inline-metric rmia-field--span-2">
                    <span className="rmia-result-label">SDLT</span>
                    <strong className="rmia-inline-metric-value">
                      {formatCurrency(results.sdltAmount)}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="rmia-section rmia-section--recurring">
                <div className="rmia-section-heading">
                  <h2>Recurring costs</h2>
                  <span className="rmia-section-note">
                    Affect annual ownership costs
                  </span>
                </div>
                <div className="rmia-grid">
                  {visibleRecurringFields.map((field) => (
                    <NumberField
                      key={field.key}
                      field={field}
                      value={inputs[field.key]}
                      noteText={getFieldNoteText(pageInfo, field.key)}
                      onChange={(value) => updateNumberField(field.key, value)}
                    />
                  ))}
                </div>
              </section>

              <section className="rmia-section">
                <div className="rmia-section-heading">
                  <h2>Results</h2>
                  <span className="rmia-section-note">
                    {propertyGoalConfig.showInvestmentMetrics
                      ? "Pre-tax cash-flow analysis"
                      : "Purchase cost summary"}
                  </span>
                </div>

                {propertyGoalConfig.showInvestorScore && evaluationSummary ? (
                  <ScoreSummaryBox
                    score={results.investorScore}
                    verdict={results.verdict}
                    confidence={results.scoreConfidence}
                  />
                ) : null}

                {isBuyToLetMode && !isLimitedCompanyPurchase ? (
                  <p className="rmia-notice">
                    Pre-tax only. Personal BTL is subject to Section 24 —
                    mortgage interest is no longer fully deductible for
                    higher-rate taxpayers.
                  </p>
                ) : null}

                <div className="rmia-results-grid rmia-results-grid--primary">
                  {primaryCards.map((card) => (
                    <ResultCard
                      key={card.label}
                      label={card.label}
                      value={card.value}
                      tone={card.tone}
                    />
                  ))}
                </div>

                <div className="rmia-details-box">
                  <div className="rmia-details-header">
                    <span className="rmia-result-label">More details</span>
                  </div>
                  <div className="rmia-details-grid">
                    {detailItems.map((item) => (
                      <DetailItem
                        key={item.label}
                        label={item.label}
                        value={item.value}
                      />
                    ))}
                  </div>
                </div>

                {propertyGoalConfig.showInvestorScore && evaluationSummary ? (
                  <EvaluationNotesBox
                    reasons={evaluationSummary.reasons}
                    structuralRisks={evaluationSummary.structuralRisks}
                    improvements={evaluationSummary.improvements}
                  />
                ) : null}

                {propertyGoalConfig.showSavedDeals ? (
                  <label className="rmia-field rmia-field--span-2 rmia-field--notes">
                    <div className="rmia-field-top">
                      <span className="rmia-field-label">
                        Notes (saved with this property)
                      </span>
                    </div>
                    <span className="rmia-field-helper">
                      Optional. Stored only on this device in Chrome.
                    </span>
                    <textarea
                      className="rmia-textarea"
                      rows={3}
                      maxLength={2000}
                      value={saveDealNotesDraft}
                      onChange={(event) =>
                        setSaveDealNotesDraft(event.target.value)
                      }
                      placeholder="E.g. viewing booked, lender quoted, concerns about lease..."
                    />
                  </label>
                ) : null}

                <div className="rmia-button-row">
                  {propertyGoalConfig.showSavedDeals ? (
                    <button
                      type="button"
                      className="rmia-primary-button"
                      onClick={() => void handleSaveDeal()}
                    >
                      Save deal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rmia-secondary-button"
                    onClick={() => void handleSaveDefaults()}
                  >
                    Save defaults
                  </button>
                  <button
                    type="button"
                    className="rmia-secondary-button"
                    onClick={handleResetForm}
                  >
                    Reset
                  </button>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === "rent" ? (
            <section className="rmia-section">
              <div className="rmia-section-heading">
                <h2>Rent estimate</h2>
                <span className="rmia-section-note">
                  {rentFromSearch.loading
                    ? "Loading…"
                    : rentHeroBand
                      ? "Live band"
                      : "Buy-to-let"}
                </span>
              </div>

              {propertyGoalConfig.showRentField && rentHeroBand ? (
                <div className="rmia-rent-hero">
                  <RentRangeGauge
                    minMonthly={rentHeroBand.min}
                    maxMonthly={rentHeroBand.max}
                    bestMonthly={rentHeroBand.best}
                    subtitle={rentHeroBand.subtitle}
                  />
                  {Math.round(inputs.monthlyRent) !==
                  Math.round(rentHeroBand.best) ? (
                    <button
                      type="button"
                      className="rmia-primary-button rmia-rent-hero-apply"
                      onClick={handleApplyBenchmarkRent}
                    >
                      Apply {formatCurrency(rentHeroBand.best)}/pm on Home
                    </button>
                  ) : (
                    <p className="rmia-field-helper rmia-rent-hero-synced">
                      This amount is already your Monthly rent on the Home tab.
                    </p>
                  )}
                </div>
              ) : null}

              {!propertyGoalConfig.showRentField && pageInfo.rentEstimate ? (
                <p className="rmia-empty-state">
                  Switch to <strong>Buy-to-let</strong> to see the merged lettings
                  band, gauge, and comparables.
                </p>
              ) : null}

              {!propertyGoalConfig.showRentField &&
              !pageInfo.rentEstimate &&
              !rentHeroBand &&
              !rentFromSearch.loading ? (
                <p className="rmia-field-helper">
                  Rightmove may not show an on-page rent widget here. In{" "}
                  <strong>Buy-to-let</strong> mode we still pull lettings from
                  Rightmove, Zoopla, and PrimeLocation automatically.
                </p>
              ) : null}

              {propertyGoalConfig.showRentField ? (
                <div className="rmia-rent-panel">
                  <p className="rmia-field-helper rmia-rent-panel-intro">
                    Comparables load in the background (no manual search). Optional
                    server-side AI refinement uses your build config only — no API
                    keys in this panel.
                  </p>

                  {rentFromSearch.loading ? (
                    <p className="rmia-field-helper">Refreshing lettings data…</p>
                  ) : null}
                  {rentFromSearch.error && !rentFromSearch.loading ? (
                    <p className="rmia-notice">{rentFromSearch.error}</p>
                  ) : null}

                  {rentHeroBand && rentHeroBand.rationale.length > 0 ? (
                    <details className="rmia-rent-details">
                      <summary>How this range was calculated</summary>
                      <ul className="rmia-bullet-list">
                        {rentHeroBand.rationale.map((line, index) => (
                          <li key={`r-${index}`}>{line}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {rentFromSearch.comparables.length > 0 ? (
                    <details className="rmia-rent-details rmia-comparables-details">
                      <summary>
                        Comparables ({rentFromSearch.comparables.length})
                      </summary>
                      <ul className="rmia-comparables-list">
                        {rentFromSearch.comparables.map((row, index) => (
                          <li
                            key={row.url ?? `${index}-${row.description}`}
                            className="rmia-comparable"
                          >
                            <div className="rmia-comparable-meta">
                              <span className="rmia-comparable-price">
                                {formatCurrency(row.price)}/pm
                              </span>
                              {row.bedrooms != null ? (
                                <span className="rmia-comparable-beds">
                                  {row.bedrooms} bed{row.bedrooms === 1 ? "" : "s"}
                                </span>
                              ) : null}
                              {row.source ? (
                                <span className="rmia-comparable-source">{row.source}</span>
                              ) : null}
                            </div>
                            <p className="rmia-comparable-summary">
                              {tidyComparableSummaryLine(row.description || "")}
                            </p>
                            {row.url ? (
                              <a
                                className="rmia-comparable-url"
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={row.url}
                              >
                                {row.url}
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === "saved" ? (
            <section className="rmia-section">
              <div className="rmia-section-heading">
                <h2>Saved deals</h2>
                <span className="rmia-section-note">
                  {savedDeals.length} stored locally
                </span>
              </div>

              <div className="rmia-saved-toolbar">
                <label className="rmia-saved-search">
                  <span className="rmia-visually-hidden">Filter saved deals</span>
                  <input
                    type="search"
                    className="rmia-input rmia-input--search"
                    placeholder="Search address or notes..."
                    value={savedDealsQuery}
                    onChange={(event) => setSavedDealsQuery(event.target.value)}
                    aria-label="Filter saved deals"
                  />
                </label>
                <label className="rmia-saved-sort">
                  <span className="rmia-field-label">Sort</span>
                  <select
                    className="rmia-select"
                    value={savedDealsSort}
                    onChange={(event) =>
                      setSavedDealsSort(event.target.value as SavedDealSort)
                    }
                    aria-label="Sort saved deals"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="score-high">Score high to low</option>
                    <option value="score-low">Score low to high</option>
                  </select>
                </label>
              </div>

              <div className="rmia-saved-io-row">
                <button
                  type="button"
                  className="rmia-secondary-button"
                  disabled={savedDeals.length === 0}
                  onClick={handleExportDeals}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  className="rmia-secondary-button"
                  onClick={() => importInputRef.current?.click()}
                >
                  Import JSON
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="rmia-file-input-hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(event) =>
                    void handleImportDealsFile(event.target.files)
                  }
                />
              </div>

              {savedDeals.length === 0 ? (
                <p className="rmia-empty-state">
                  Save a deal from the Calculator tab and it will appear here.
                </p>
              ) : visibleSavedDeals.length === 0 ? (
                <p className="rmia-empty-state">
                  No deals match your search. Try a different filter.
                </p>
              ) : (
                <div className="rmia-saved-list">
                  {visibleSavedDeals.map((deal) => (
                    <article className="rmia-saved-card" key={deal.id}>
                      <div className="rmia-saved-main">
                        <div className="rmia-saved-top">
                          <h3 className="rmia-saved-title">
                            {deal.address || deal.title}
                          </h3>
                          <span
                            className={`rmia-verdict-badge rmia-verdict-badge--${deal.results.verdict}`}
                          >
                            {verdictLabel(deal.results.verdict)}
                          </span>
                        </div>
                        <p className="rmia-saved-meta">
                          Saved {formatSavedAt(deal.savedAt)}
                        </p>
                        <div className="rmia-saved-summary">
                          <span className="rmia-saved-chip">
                            {formatCurrency(deal.inputs.askingPrice)}
                          </span>
                          <span className="rmia-saved-chip">
                            {formatCurrency(deal.inputs.monthlyRent)}/pm
                          </span>
                          <span className="rmia-saved-chip">
                            CF{" "}
                            {formatCurrency(deal.results.monthlyCashFlow, true)}
                            /mo
                          </span>
                          <span className="rmia-saved-chip">
                            {deal.results.investorScore}/100
                          </span>
                        </div>
                        <label className="rmia-saved-notes">
                          <span className="rmia-field-label">Notes</span>
                          <textarea
                            className="rmia-textarea rmia-textarea--compact"
                            rows={2}
                            maxLength={2000}
                            defaultValue={deal.notes ?? ""}
                            key={deal.id + (deal.notes ?? "")}
                            onBlur={(event) =>
                              void handleDealNotesBlur(deal, event.target.value)
                            }
                            placeholder="Add a note..."
                          />
                        </label>
                      </div>
                      <div className="rmia-saved-actions">
                        {pendingDeleteId === deal.id ? (
                          <>
                            <span className="rmia-delete-confirm-text">
                              Delete this deal?
                            </span>
                            <button
                              type="button"
                              className="rmia-secondary-button rmia-danger-button"
                              onClick={() => void handleDeleteDeal(deal)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="rmia-secondary-button"
                              onClick={() => setPendingDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            {deal.pageUrl ? (
                              <button
                                type="button"
                                className="rmia-secondary-button"
                                onClick={() =>
                                  openListingInNewTab(deal.pageUrl)
                                }
                              >
                                Open listing
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rmia-secondary-button"
                              onClick={() => {
                                handleRestoreDeal(deal);
                                setActiveTab("calculator");
                              }}
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              className="rmia-secondary-button rmia-danger-button"
                              onClick={() => setPendingDeleteId(deal.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <p className="rmia-disclaimer">
            Estimates only — not financial, tax, or legal advice. SDLT covers
            England and Northern Ireland at the bands coded in this extension;
            verify against HMRC before you commit.
          </p>
        </aside>
      ) : null}
    </>
  );
}

import { useState, type ReactElement } from "react";
import { formatCurrency, formatIsoDateShort } from "../../lib/formatters";
import { INVESTOR_SCORE_CONFIG } from "../../lib/investorScore";
import type {
  PostcodeSalesSummary,
  RentEstimate,
  SoldPriceHistory,
  SoldPropertyType,
  SoldTransaction,
  Verdict,
} from "../../lib/types";
import type { NumberFieldDefinition, ToggleOption } from "../fieldMeta";
import { parseInputNumber, scoreConfidenceLabel, verdictLabel } from "../stateHelpers";

function soldPropertyTypeLabel(type: SoldPropertyType | null): string {
  if (!type) {
    return "sales";
  }
  switch (type) {
    case "semi-detached":
      return "semi-detached sales";
    case "flat-maisonette":
      return "flat/maisonette sales";
    case "other":
      return "sales";
    default:
      return `${type} sales`;
  }
}

function formatPostcodeSummaryLine(
  summary: PostcodeSalesSummary,
  postcode: string,
  propertyType: SoldPropertyType | null,
): string {
  const median =
    summary.medianPrice != null ? formatCurrency(summary.medianPrice) : "n/a";
  const typePhrase = summary.filteredByPropertyType
    ? soldPropertyTypeLabel(propertyType)
    : "sales";
  const suffix = summary.filteredByPropertyType ? "" : " — all property types";
  return `${summary.sampleSize} ${typePhrase} in ${postcode} in the last ${summary.periodYears} years, median ${median} (${summary.totalSince1995} sales since 1995)${suffix}`;
}

function hasSoldPriceContent(history: SoldPriceHistory | null): boolean {
  if (!history) {
    return false;
  }
  return (
    history.propertyTransactions.length > 0 || history.postcodeSummary !== null
  );
}

/** Collapsible HM Land Registry sold-price context near the asking-price field. */
export function SoldPriceHistorySection(props: {
  expanded: boolean;
  loading: boolean;
  history: SoldPriceHistory | null;
  postcode: string | null;
  propertyType: SoldPropertyType | null;
  onToggle: (expanded: boolean) => void;
}) {
  const { expanded, loading, history, postcode, propertyType, onToggle } = props;
  const hasContent = hasSoldPriceContent(history);

  return (
    <details
      className="rmia-rent-details rmia-sold-price-details rmia-field--span-2"
      open={expanded}
      onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Sold price history</summary>
      {loading && !hasContent ? (
        <p className="rmia-field-helper">Loading Land Registry data…</p>
      ) : null}
      {!loading && expanded && !hasContent ? (
        <p className="rmia-field-helper">No Land Registry data available</p>
      ) : null}
      {hasContent && history ? (
        <div className="rmia-sold-price-body">
          {history.propertyTransactions.length > 0 ? (
            <div className="rmia-sold-price-block">
              <span className="rmia-result-label">This property</span>
              <table className="rmia-sold-price-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Price</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.propertyTransactions.map((row: SoldTransaction, index) => (
                    <tr key={`${row.date}-${row.pricePaid}-${index}`}>
                      <td>{formatIsoDateShort(row.date)}</td>
                      <td>{formatCurrency(row.pricePaid)}</td>
                      <td>{row.newBuild ? "New build" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.propertyTransactions[0] ? (
                <p className="rmia-field-helper">
                  Last sold {formatCurrency(history.propertyTransactions[0].pricePaid)} on{" "}
                  {formatIsoDateShort(history.propertyTransactions[0].date)}
                  {history.impliedAnnualGrowthVsAsking != null
                    ? `. Implied growth vs asking: ${(history.impliedAnnualGrowthVsAsking * 100).toFixed(1)}%/yr since ${formatIsoDateShort(history.propertyTransactions[0].date)}`
                    : null}
                </p>
              ) : null}
            </div>
          ) : null}
          {history.propertyTransactions.length === 0 &&
          history.postcodeSummary &&
          postcode ? (
            <p className="rmia-field-helper">
              {formatPostcodeSummaryLine(history.postcodeSummary, postcode, propertyType)}
            </p>
          ) : null}
          {history.propertyTransactions.length > 0 &&
          history.postcodeSummary &&
          postcode ? (
            <p className="rmia-field-helper">
              Postcode context:{" "}
              {formatPostcodeSummaryLine(history.postcodeSummary, postcode, propertyType)}
            </p>
          ) : null}
          <p className="rmia-field-note">Source: HM Land Registry Price Paid data</p>
        </div>
      ) : null}
    </details>
  );
}

/** Semi-circular range + central estimate (Propeller-style at-a-glance rent band). */
export function RentRangeGauge(props: {
  minMonthly: number;
  maxMonthly: number;
  bestMonthly: number;
  subtitle: string;
}): ReactElement {
  const { minMonthly, maxMonthly, bestMonthly, subtitle } = props;
  const w = 280;
  const h = 118;
  const cx = w / 2;
  const cy = h - 4;
  const r = 76;
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const span = Math.max(maxMonthly - minMonthly, 1);
  const t = Math.min(1, Math.max(0, (bestMonthly - minMonthly) / span));
  const angle = Math.PI * (1 - t);
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);
  const arcLen = Math.PI * r;
  const filledLen = arcLen * t;

  const label = `Estimated rent ${formatCurrency(bestMonthly)} per month, between ${formatCurrency(minMonthly)} and ${formatCurrency(maxMonthly)}.`;

  return (
    <div className="rmia-rent-gauge" role="img" aria-label={label}>
      <p className="rmia-rent-gauge-subtitle">{subtitle}</p>
      <svg
        className="rmia-rent-gauge-svg"
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="118"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          d={arcPath}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={arcPath}
          fill="none"
          stroke="#0f766e"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filledLen} ${arcLen}`}
        />
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="#0f766e"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="6" fill="#0f766e" />
      </svg>
      <div className="rmia-rent-gauge-bounds">
        <span>{formatCurrency(minMonthly)}</span>
        <span>{formatCurrency(maxMonthly)}</span>
      </div>
      <div className="rmia-rent-gauge-hero">
        <span className="rmia-rent-gauge-hero-value">{formatCurrency(bestMonthly)}</span>
        <span className="rmia-rent-gauge-hero-unit">/pm</span>
      </div>
    </div>
  );
}

export function RentEstimateCard(props: {
  rentEstimate: RentEstimate;
  currentRent: number;
  onUseEstimate: () => void;
}) {
  const [showComparables, setShowComparables] = useState(false);
  const { rentEstimate, currentRent } = props;
  const isUsingEstimate = currentRent === rentEstimate.estimate;
  const hasRange =
    rentEstimate.min !== rentEstimate.estimate ||
    rentEstimate.max !== rentEstimate.estimate;

  return (
    <div className="rmia-rent-estimate rmia-field--span-2">
      <div className="rmia-rent-estimate-header">
        <span className="rmia-result-label">Rent estimate</span>
        <span className="rmia-field-note">
          Source: {rentEstimate.source || "listing"}
        </span>
      </div>
      <div className="rmia-rent-estimate-body">
        <div>
          <strong className="rmia-rent-estimate-value">
            {formatCurrency(rentEstimate.estimate)}
          </strong>
          <span className="rmia-rent-estimate-unit">/pm</span>
        </div>
        {hasRange ? (
          <span className="rmia-rent-estimate-range">
            {formatCurrency(rentEstimate.min)} –{" "}
            {formatCurrency(rentEstimate.max)}
          </span>
        ) : null}
        {!isUsingEstimate ? (
          <button
            type="button"
            className="rmia-secondary-button rmia-rent-estimate-use"
            onClick={props.onUseEstimate}
          >
            Use this estimate
          </button>
        ) : null}
      </div>
      {rentEstimate.comparables.length > 0 ? (
        <div className="rmia-comparables">
          <button
            type="button"
            className="rmia-comparables-toggle"
            onClick={() => setShowComparables((v) => !v)}
          >
            <span>Comparisons ({rentEstimate.comparables.length})</span>
            <span>{showComparables ? "▲" : "▼"}</span>
          </button>
          {showComparables ? (
            <div className="rmia-comparables-list">
              {rentEstimate.comparables.map((comp, index) => (
                <div key={index} className="rmia-comparable-item">
                  <div className="rmia-comparable-details">
                    <strong className="rmia-comparable-price">
                      {formatCurrency(comp.price)}/pm
                    </strong>
                    {comp.description ? (
                      <span className="rmia-comparable-desc">
                        {comp.description}
                      </span>
                    ) : null}
                    {comp.availableFrom ? (
                      <span className="rmia-comparable-desc">
                        Available from {comp.availableFrom}
                      </span>
                    ) : null}
                    {comp.source ? (
                      <span className="rmia-comparable-source">
                        Evidence: {comp.source}
                      </span>
                    ) : null}
                  </div>
                  {comp.url ? (
                    <button
                      type="button"
                      className="rmia-comparable-link"
                      onClick={() =>
                        window.open(comp.url, "_blank", "noopener,noreferrer")
                      }
                    >
                      ↗
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function NumberField(props: {
  field: NumberFieldDefinition;
  value: number;
  onChange: (value: number) => void;
  helperText?: string;
  noteText?: string;
  disabled?: boolean;
}) {
  const displayValue =
    props.field.showBlankWhenZero && props.value === 0 ? "" : props.value;

  return (
    <label className="rmia-field">
      <div className="rmia-field-top">
        <span className="rmia-field-label">{props.field.label}</span>
        {props.noteText ? (
          <span className="rmia-field-note">{props.noteText}</span>
        ) : null}
      </div>
      {props.helperText ? (
        <span className="rmia-field-helper">{props.helperText}</span>
      ) : null}
      <div
        className={`rmia-input-shell${props.disabled ? " rmia-input-shell--disabled" : ""}`}
      >
        {props.field.prefix ? (
          <span className="rmia-input-addon">{props.field.prefix}</span>
        ) : null}
        <input
          className={`rmia-input${props.disabled ? " rmia-input--disabled" : ""}`}
          type="number"
          min={0}
          step={props.field.step ?? "1"}
          value={displayValue}
          disabled={props.disabled}
          onChange={(event) =>
            props.onChange(parseInputNumber(event.target.value))
          }
        />
        {props.field.suffix ? (
          <span className="rmia-input-addon">{props.field.suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

export function PlaceholderField(props: {
  label: string;
  helperText?: string;
  placeholderText: string;
}) {
  return (
    <div className="rmia-field rmia-field--placeholder">
      <div className="rmia-field-top">
        <span className="rmia-field-label">{props.label}</span>
      </div>
      {props.helperText ? (
        <span className="rmia-field-helper">{props.helperText}</span>
      ) : null}
      <div className="rmia-input-shell rmia-input-shell--placeholder">
        <span className="rmia-placeholder-text">{props.placeholderText}</span>
      </div>
    </div>
  );
}

export function ToggleField(props: {
  label: string;
  value: string;
  options: ToggleOption[];
  helperText?: string;
  fullWidth?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`rmia-field${props.fullWidth ? " rmia-field--span-2" : ""}`}
    >
      <div className="rmia-field-top">
        <span className="rmia-field-label">{props.label}</span>
      </div>
      {props.helperText ? (
        <span className="rmia-field-helper">{props.helperText}</span>
      ) : null}
      <div className="rmia-toggle">
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`rmia-toggle-button${props.value === option.value ? " rmia-toggle-button--active" : ""}`}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ResultCard(props: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div
      className={`rmia-result-card rmia-result-card--${props.tone ?? "neutral"}`}
    >
      <span className="rmia-result-label">{props.label}</span>
      <strong className="rmia-result-value">{props.value}</strong>
    </div>
  );
}

export function DetailItem(props: { label: string; value: string }) {
  return (
    <div className="rmia-detail-item">
      <span className="rmia-detail-label">{props.label}</span>
      <strong className="rmia-detail-value">{props.value}</strong>
    </div>
  );
}

export function ScoreSummaryBox(props: {
  score: number;
  verdict: Verdict;
  confidence: "high" | "medium" | "low";
}) {
  return (
    <div className="rmia-score-summary">
      <div className="rmia-score-summary-top">
        <div>
          <span className="rmia-result-label">Cash-flow-led deal score</span>
          <strong className="rmia-evaluation-score">{props.score} / 100</strong>
        </div>
        <span
          className={`rmia-verdict-badge rmia-verdict-badge--${props.verdict}`}
        >
          {verdictLabel(props.verdict)}
        </span>
      </div>
      <p className="rmia-score-confidence">
        {scoreConfidenceLabel(props.confidence)}
      </p>
    </div>
  );
}

export function EvaluationNotesBox(props: {
  reasons: string[];
  structuralRisks: string[];
  improvements: string[];
}) {
  return (
    <div className="rmia-evaluation-box">
      <p className="rmia-field-helper">
        Anchored by monthly cash flow (
        {INVESTOR_SCORE_CONFIG.weights.monthlyCashFlow}%) and cash-on-cash
        return ({INVESTOR_SCORE_CONFIG.weights.cashOnCashReturn}%), then ICR /
        debt safety ({INVESTOR_SCORE_CONFIG.weights.interestCoverageRatio}%) and
        mortgage-rate stress resilience (
        {INVESTOR_SCORE_CONFIG.weights.stressResilience}%). Gross yield is
        supporting context, not a main score driver.
      </p>

      <div className="rmia-evaluation-section">
        <span className="rmia-result-label">Why this scored this way</span>
        <ul className="rmia-bullet-list">
          {props.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      {props.improvements.length > 0 ? (
        <div className="rmia-evaluation-section">
          <span className="rmia-result-label">Ways to improve the deal</span>
          <ul className="rmia-bullet-list">
            {props.improvements.map((improvement) => (
              <li key={improvement}>{improvement}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {props.structuralRisks.length > 0 ? (
        <div className="rmia-evaluation-section">
          <span className="rmia-result-label">
            Structural risks / watch-outs
          </span>
          <ul className="rmia-bullet-list">
            {props.structuralRisks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function openListingInNewTab(pageUrl: string): void {
  window.open(pageUrl, "_blank", "noopener,noreferrer");
}

// Investor score helper.
// This keeps the score and verdict rules outside the React UI so they are easy to tweak later.
import type { ScoreConfidence, Verdict } from "./types";

interface ScoreInput {
  monthlyCashFlow: number;
  cashOnCashReturn: number;
  interestCoverageRatio: number | null;
  stressedMonthlyCashFlowPlusOne: number;
  stressedMonthlyCashFlowPlusTwo: number;
  hasPurchasePrice: boolean;
  hasRentEstimate: boolean;
  hasMortgageAssumptions: boolean;
  hasOwnershipCostReview: boolean;
  additionalRecurringCostReviewCount: number;
  parsedListingSignalCount: number;
}

interface InvestorScoreResult {
  investorScore: number;
  scoreConfidence: ScoreConfidence;
  verdict: Verdict;
}

interface ScoreScalePoint {
  value: number;
  points: number;
  exponent?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundToWholeNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function getScoreFromScale(value: number, scale: readonly ScoreScalePoint[]): number {
  if (scale.length === 0) {
    return 0;
  }

  const firstPoint = scale[0];

  if (value <= firstPoint.value) {
    return firstPoint.points;
  }

  for (let index = 1; index < scale.length; index += 1) {
    const previousPoint = scale[index - 1];
    const currentPoint = scale[index];

    if (value <= currentPoint.value) {
      const progress = (value - previousPoint.value) / (currentPoint.value - previousPoint.value);
      const easedProgress = Math.pow(progress, currentPoint.exponent ?? 0.85);
      return previousPoint.points + (currentPoint.points - previousPoint.points) * easedProgress;
    }
  }

  return scale[scale.length - 1].points;
}

function hasMinimumInterestCoverage(interestCoverageRatio: number | null, minimum: number): boolean {
  return interestCoverageRatio === null || interestCoverageRatio >= minimum;
}

export const INVESTOR_SCORE_CONFIG = {
  weights: {
    monthlyCashFlow: 35,
    cashOnCashReturn: 30,
    interestCoverageRatio: 20,
    stressResilience: 15
  },
  anchorScales: {
    monthlyCashFlow: [
      { value: 0, points: 0 },
      { value: 75, points: 11, exponent: 0.9 },
      { value: 150, points: 21, exponent: 0.9 },
      { value: 300, points: 30, exponent: 0.85 },
      { value: 500, points: 35, exponent: 0.8 }
    ],
    cashOnCashReturn: [
      { value: -10, points: -5 },
      { value: 0, points: -2, exponent: 0.85 },
      { value: 4, points: 0, exponent: 0.9 },
      { value: 8, points: 12, exponent: 0.9 },
      { value: 12, points: 21, exponent: 0.85 },
      { value: 20, points: 28.5, exponent: 0.8 },
      { value: 25, points: 30, exponent: 0.75 }
    ],
    interestCoverageRatio: [
      { value: 1, points: 0 },
      { value: 1.15, points: 6, exponent: 0.95 },
      { value: 1.25, points: 10, exponent: 0.9 },
      { value: 1.5, points: 18, exponent: 0.85 },
      { value: 1.75, points: 20, exponent: 0.8 }
    ],
    stressedCashFlowPlusOne: [
      { value: 0, points: 0 },
      { value: 50, points: 4, exponent: 0.95 },
      { value: 100, points: 7, exponent: 0.9 },
      { value: 150, points: 9, exponent: 0.85 },
      { value: 250, points: 10, exponent: 0.8 }
    ],
    stressedCashFlowPlusTwo: [
      { value: -100, points: 0 },
      { value: -25, points: 1.5, exponent: 0.95 },
      { value: 0, points: 3, exponent: 0.9 },
      { value: 50, points: 4.5, exponent: 0.85 },
      { value: 125, points: 5, exponent: 0.8 }
    ]
  },
  anchorThresholds: {
    monthlyCashFlow: {
      okay: 75,
      good: 150,
      strong: 300,
      exceptional: 500
    },
    cashOnCashReturn: {
      okay: 4,
      good: 8,
      strong: 12,
      exceptional: 20
    },
    interestCoverageRatio: {
      thin: 1.1,
      okay: 1.25,
      strong: 1.5
    },
    stressResilience: {
      plusOneWeak: 50,
      plusOneStrong: 75,
      plusTwoBreakEven: 0,
      plusTwoBadBreak: -150
    }
  },
  grossYieldSupport: {
    weak: 4.5,
    okay: 5,
    healthy: 6
  },
  stressPenaltyRules: {
    plusOne: {
      weak: 50,
      breakEven: 0,
      weakPenalty: 2,
      negativePenalty: 5
    },
    plusTwo: {
      badBreak: -150,
      breakEven: 0,
      badBreakPenalty: 4,
      negativePenalty: 2
    }
  },
  confidenceRules: {
    completenessWeights: {
      purchasePrice: 25,
      rentEstimate: 25,
      mortgageAssumptions: 20,
      ownershipCostReview: 10,
      additionalRecurringCostsLight: 10,
      additionalRecurringCostsStrong: 15,
      parsedDataLight: 5,
      parsedDataStrong: 10
    },
    thresholds: {
      high: 85,
      medium: 55
    },
    scoreCaps: {
      high: 100,
      medium: 98,
      low: 92
    },
    penaltyMultiplier: 0.12
  },
  verdictThresholds: {
    exceptional: {
      minimumScore: 92,
      minimumMonthlyCashFlow: 250,
      minimumCashOnCashReturn: 12,
      minimumInterestCoverageRatio: 1.4,
      minimumStressedCashFlowPlusOne: 75,
      minimumStressedCashFlowPlusTwo: 0
    },
    strong: {
      minimumScore: 80,
      minimumMonthlyCashFlow: 125,
      minimumCashOnCashReturn: 8,
      minimumInterestCoverageRatio: 1.25,
      minimumStressedCashFlowPlusOne: 0,
      minimumStressedCashFlowPlusTwo: -50
    },
    firm: {
      minimumScore: 62,
      minimumMonthlyCashFlow: 0,
      minimumCashOnCashReturn: 4,
      minimumInterestCoverageRatio: 1.1,
      minimumStressedCashFlowPlusOne: -50
    },
    borderline: {
      minimumScore: 45,
      minimumMonthlyCashFlow: -50,
      minimumCashOnCashReturn: 0,
      minimumStressedCashFlowPlusOne: -125
    }
  }
} as const;

function getScoreConfidence(input: ScoreInput, confidenceScore: number): ScoreConfidence {
  const hasCriticalFieldGap =
    !input.hasPurchasePrice || !input.hasRentEstimate || !input.hasMortgageAssumptions;
  const hasHighConfidenceCoverage =
    input.hasOwnershipCostReview || input.additionalRecurringCostReviewCount >= 1;

  if (
    !hasCriticalFieldGap &&
    confidenceScore >= INVESTOR_SCORE_CONFIG.confidenceRules.thresholds.high &&
    hasHighConfidenceCoverage
  ) {
    return "high";
  }

  if (!hasCriticalFieldGap && confidenceScore >= INVESTOR_SCORE_CONFIG.confidenceRules.thresholds.medium) {
    return "medium";
  }

  return "low";
}

function getInterestCoverageScore(interestCoverageRatio: number | null): number {
  if (interestCoverageRatio === null) {
    return INVESTOR_SCORE_CONFIG.weights.interestCoverageRatio;
  }

  return getScoreFromScale(
    interestCoverageRatio,
    INVESTOR_SCORE_CONFIG.anchorScales.interestCoverageRatio
  );
}

function getStressResilienceScore(
  stressedMonthlyCashFlowPlusOne: number,
  stressedMonthlyCashFlowPlusTwo: number
): number {
  const rawStressScore =
    getScoreFromScale(
      stressedMonthlyCashFlowPlusOne,
      INVESTOR_SCORE_CONFIG.anchorScales.stressedCashFlowPlusOne
    ) +
    getScoreFromScale(
      stressedMonthlyCashFlowPlusTwo,
      INVESTOR_SCORE_CONFIG.anchorScales.stressedCashFlowPlusTwo
    );

  let penalty = 0;

  if (stressedMonthlyCashFlowPlusOne < INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusOne.breakEven) {
    penalty += INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusOne.negativePenalty;
  } else if (stressedMonthlyCashFlowPlusOne < INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusOne.weak) {
    penalty += INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusOne.weakPenalty;
  }

  if (stressedMonthlyCashFlowPlusTwo < INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusTwo.badBreak) {
    penalty += INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusTwo.badBreakPenalty;
  } else if (stressedMonthlyCashFlowPlusTwo < INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusTwo.breakEven) {
    penalty += INVESTOR_SCORE_CONFIG.stressPenaltyRules.plusTwo.negativePenalty;
  }

  return clamp(
    rawStressScore - penalty,
    0,
    INVESTOR_SCORE_CONFIG.weights.stressResilience
  );
}

function getConfidenceScore(input: ScoreInput): number {
  const additionalRecurringCostScore =
    input.additionalRecurringCostReviewCount >= 2
      ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.additionalRecurringCostsStrong
      : input.additionalRecurringCostReviewCount >= 1
        ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.additionalRecurringCostsLight
        : 0;
  const parsedDataScore =
    input.parsedListingSignalCount >= 4
      ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.parsedDataStrong
      : input.parsedListingSignalCount >= 2
        ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.parsedDataLight
        : 0;

  return roundToWholeNumber(
    clamp(
      (input.hasPurchasePrice
        ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.purchasePrice
        : 0) +
        (input.hasRentEstimate
          ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.rentEstimate
          : 0) +
        (input.hasMortgageAssumptions
          ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.mortgageAssumptions
          : 0) +
        (input.hasOwnershipCostReview
          ? INVESTOR_SCORE_CONFIG.confidenceRules.completenessWeights.ownershipCostReview
          : 0) +
        additionalRecurringCostScore +
        parsedDataScore,
      0,
      100
    )
  );
}

export function calculateInvestorScore(input: ScoreInput): InvestorScoreResult {
  const monthlyCashFlowScore = getScoreFromScale(
    input.monthlyCashFlow,
    INVESTOR_SCORE_CONFIG.anchorScales.monthlyCashFlow
  );
  const cashOnCashScore = getScoreFromScale(
    input.cashOnCashReturn,
    INVESTOR_SCORE_CONFIG.anchorScales.cashOnCashReturn
  );
  const interestCoverageScore = getInterestCoverageScore(input.interestCoverageRatio);
  const stressResilienceScore = getStressResilienceScore(
    input.stressedMonthlyCashFlowPlusOne,
    input.stressedMonthlyCashFlowPlusTwo
  );

  const confidenceScore = getConfidenceScore(input);
  const scoreConfidence = getScoreConfidence(input, confidenceScore);
  const confidenceCap =
    scoreConfidence === "high"
      ? INVESTOR_SCORE_CONFIG.confidenceRules.scoreCaps.high
      : scoreConfidence === "medium"
        ? INVESTOR_SCORE_CONFIG.confidenceRules.scoreCaps.medium
        : INVESTOR_SCORE_CONFIG.confidenceRules.scoreCaps.low;
  const confidencePenalty =
    (100 - confidenceScore) * INVESTOR_SCORE_CONFIG.confidenceRules.penaltyMultiplier;

  const baseScore = roundToWholeNumber(
    clamp(
      monthlyCashFlowScore + cashOnCashScore + interestCoverageScore + stressResilienceScore,
      0,
      100
    )
  );
  const investorScore = roundToWholeNumber(
    clamp(Math.min(baseScore - confidencePenalty, confidenceCap), 0, 100)
  );

  const exceptionalThresholds = INVESTOR_SCORE_CONFIG.verdictThresholds.exceptional;
  const strongThresholds = INVESTOR_SCORE_CONFIG.verdictThresholds.strong;
  const firmThresholds = INVESTOR_SCORE_CONFIG.verdictThresholds.firm;
  const borderlineThresholds = INVESTOR_SCORE_CONFIG.verdictThresholds.borderline;

  if (
    investorScore >= exceptionalThresholds.minimumScore &&
    input.monthlyCashFlow >= exceptionalThresholds.minimumMonthlyCashFlow &&
    input.cashOnCashReturn >= exceptionalThresholds.minimumCashOnCashReturn &&
    hasMinimumInterestCoverage(
      input.interestCoverageRatio,
      exceptionalThresholds.minimumInterestCoverageRatio
    ) &&
    input.stressedMonthlyCashFlowPlusOne >= exceptionalThresholds.minimumStressedCashFlowPlusOne &&
    input.stressedMonthlyCashFlowPlusTwo >= exceptionalThresholds.minimumStressedCashFlowPlusTwo
  ) {
    return {
      investorScore,
      scoreConfidence,
      verdict: "exceptional"
    };
  }

  if (
    investorScore >= strongThresholds.minimumScore &&
    input.monthlyCashFlow >= strongThresholds.minimumMonthlyCashFlow &&
    input.cashOnCashReturn >= strongThresholds.minimumCashOnCashReturn &&
    hasMinimumInterestCoverage(input.interestCoverageRatio, strongThresholds.minimumInterestCoverageRatio) &&
    input.stressedMonthlyCashFlowPlusOne >= strongThresholds.minimumStressedCashFlowPlusOne &&
    input.stressedMonthlyCashFlowPlusTwo >= strongThresholds.minimumStressedCashFlowPlusTwo
  ) {
    return {
      investorScore,
      scoreConfidence,
      verdict: "strong"
    };
  }

  if (
    investorScore >= firmThresholds.minimumScore &&
    input.monthlyCashFlow >= firmThresholds.minimumMonthlyCashFlow &&
    input.cashOnCashReturn >= firmThresholds.minimumCashOnCashReturn &&
    hasMinimumInterestCoverage(input.interestCoverageRatio, firmThresholds.minimumInterestCoverageRatio) &&
    input.stressedMonthlyCashFlowPlusOne >= firmThresholds.minimumStressedCashFlowPlusOne
  ) {
    return {
      investorScore,
      scoreConfidence,
      verdict: "firm"
    };
  }

  if (
    investorScore >= borderlineThresholds.minimumScore &&
    input.monthlyCashFlow >= borderlineThresholds.minimumMonthlyCashFlow &&
    input.cashOnCashReturn >= borderlineThresholds.minimumCashOnCashReturn &&
    input.stressedMonthlyCashFlowPlusOne >= borderlineThresholds.minimumStressedCashFlowPlusOne
  ) {
    return {
      investorScore,
      scoreConfidence,
      verdict: "borderline"
    };
  }

  return {
    investorScore,
    scoreConfidence,
    verdict: "skip"
  };
}

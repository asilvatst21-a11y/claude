import type { MatchStage, PredictionResult } from "@prisma/client";

export type ScoringRules = {
  ptsExactScore: number;
  ptsCorrectDiff: number;
  ptsCorrectWinner: number;
  ptsCorrectDraw: number;
};

export const DEFAULT_RULES: ScoringRules = {
  ptsExactScore: 10,
  ptsCorrectDiff: 7,
  ptsCorrectWinner: 5,
  ptsCorrectDraw: 4,
};

type ScoreInput = {
  predHome: number;
  predAway: number;
  realHome: number;
  realAway: number;
  stage: MatchStage;
  rules?: ScoringRules;
};

export function calculatePoints({ predHome, predAway, realHome, realAway, rules }: ScoreInput): {
  result: PredictionResult;
  points: number;
  bonusPoints: number;
} {
  const r = rules ?? DEFAULT_RULES;

  if (predHome === realHome && predAway === realAway) {
    return { result: "EXACT_SCORE", points: r.ptsExactScore, bonusPoints: 0 };
  }

  const predDiff = predHome - predAway;
  const realDiff = realHome - realAway;
  const predWinner = Math.sign(predDiff);
  const realWinner = Math.sign(realDiff);

  if (predWinner === realWinner && predDiff === realDiff) {
    return { result: "CORRECT_RESULT_AND_DIFF", points: r.ptsCorrectDiff, bonusPoints: 0 };
  }

  if (predWinner !== 0 && predWinner === realWinner) {
    return { result: "CORRECT_WINNER", points: r.ptsCorrectWinner, bonusPoints: 0 };
  }

  if (predWinner === 0 && realWinner === 0) {
    return { result: "CORRECT_DRAW", points: r.ptsCorrectDraw, bonusPoints: 0 };
  }

  return { result: "WRONG", points: 0, bonusPoints: 0 };
}

// stage kept for API compatibility but no longer affects scoring
export function pointsFromResult(result: PredictionResult, _stage: MatchStage, rules: ScoringRules): number {
  switch (result) {
    case "EXACT_SCORE": return rules.ptsExactScore;
    case "CORRECT_RESULT_AND_DIFF": return rules.ptsCorrectDiff;
    case "CORRECT_WINNER": return rules.ptsCorrectWinner;
    case "CORRECT_DRAW": return rules.ptsCorrectDraw;
    default: return 0;
  }
}

export function isPredictionLocked(startsAt: Date): boolean {
  const cutoff = new Date(startsAt.getTime() - 5 * 60 * 1000);
  return new Date() >= cutoff;
}

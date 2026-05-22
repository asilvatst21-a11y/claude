import type { MatchStage, PredictionResult } from "@prisma/client";

export type ScoringRules = {
  ptsExactScore: number;
  ptsCorrectDiff: number;
  ptsCorrectWinner: number;
  ptsCorrectDraw: number;
  ptsKnockoutBonus: number;
};

export const DEFAULT_RULES: ScoringRules = {
  ptsExactScore: 10,
  ptsCorrectDiff: 7,
  ptsCorrectWinner: 5,
  ptsCorrectDraw: 4,
  ptsKnockoutBonus: 3,
};

const KNOCKOUT_STAGES: MatchStage[] = [
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "THIRD_PLACE",
  "FINAL",
];

type ScoreInput = {
  predHome: number;
  predAway: number;
  realHome: number;
  realAway: number;
  stage: MatchStage;
  rules?: ScoringRules;
};

export function calculatePoints({ predHome, predAway, realHome, realAway, stage, rules }: ScoreInput): {
  result: PredictionResult;
  points: number;
  bonusPoints: number;
} {
  const r = rules ?? DEFAULT_RULES;
  const isKnockout = KNOCKOUT_STAGES.includes(stage);
  const bonus = isKnockout ? r.ptsKnockoutBonus : 0;

  if (predHome === realHome && predAway === realAway) {
    return { result: "EXACT_SCORE", points: r.ptsExactScore, bonusPoints: bonus };
  }

  const predDiff = predHome - predAway;
  const realDiff = realHome - realAway;
  const predWinner = Math.sign(predDiff);
  const realWinner = Math.sign(realDiff);

  if (predWinner === realWinner && predDiff === realDiff) {
    return { result: "CORRECT_RESULT_AND_DIFF", points: r.ptsCorrectDiff, bonusPoints: bonus };
  }

  if (predWinner !== 0 && predWinner === realWinner) {
    return { result: "CORRECT_WINNER", points: r.ptsCorrectWinner, bonusPoints: bonus };
  }

  if (predWinner === 0 && realWinner === 0) {
    return { result: "CORRECT_DRAW", points: r.ptsCorrectDraw, bonusPoints: bonus };
  }

  return { result: "WRONG", points: 0, bonusPoints: 0 };
}

export function pointsFromResult(result: PredictionResult, stage: MatchStage, rules: ScoringRules): number {
  const isKnockout = KNOCKOUT_STAGES.includes(stage);
  const bonus = isKnockout ? rules.ptsKnockoutBonus : 0;
  switch (result) {
    case "EXACT_SCORE": return rules.ptsExactScore + bonus;
    case "CORRECT_RESULT_AND_DIFF": return rules.ptsCorrectDiff + bonus;
    case "CORRECT_WINNER": return rules.ptsCorrectWinner + bonus;
    case "CORRECT_DRAW": return rules.ptsCorrectDraw + bonus;
    default: return 0;
  }
}

export function isPredictionLocked(startsAt: Date): boolean {
  const cutoff = new Date(startsAt.getTime() - 3 * 60 * 1000);
  return new Date() >= cutoff;
}

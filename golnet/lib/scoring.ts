import type { MatchStage, PredictionResult } from "@prisma/client";

type ScoreInput = {
  predHome: number;
  predAway: number;
  realHome: number;
  realAway: number;
  stage: MatchStage;
};

const KNOCKOUT_STAGES: MatchStage[] = [
  "ROUND_OF_16",
  "QUARTER_FINAL",
  "SEMI_FINAL",
  "THIRD_PLACE",
  "FINAL",
];

export function calculatePoints({ predHome, predAway, realHome, realAway, stage }: ScoreInput): {
  result: PredictionResult;
  points: number;
  bonusPoints: number;
} {
  const isKnockout = KNOCKOUT_STAGES.includes(stage);
  const bonus = isKnockout ? 3 : 0;

  if (predHome === realHome && predAway === realAway) {
    return { result: "EXACT_SCORE", points: 10, bonusPoints: bonus };
  }

  const predDiff = predHome - predAway;
  const realDiff = realHome - realAway;
  const predWinner = Math.sign(predDiff);
  const realWinner = Math.sign(realDiff);

  if (predWinner === realWinner && predDiff === realDiff) {
    return { result: "CORRECT_RESULT_AND_DIFF", points: 7, bonusPoints: bonus };
  }

  if (predWinner !== 0 && predWinner === realWinner) {
    return { result: "CORRECT_WINNER", points: 5, bonusPoints: bonus };
  }

  if (predWinner === 0 && realWinner === 0) {
    return { result: "CORRECT_DRAW", points: 4, bonusPoints: bonus };
  }

  return { result: "WRONG", points: 0, bonusPoints: 0 };
}

export function isPredictionLocked(startsAt: Date): boolean {
  const cutoff = new Date(startsAt.getTime() - 5 * 60 * 1000);
  return new Date() >= cutoff;
}

import type {
  User,
  League,
  LeagueMember,
  Match,
  Prediction,
  Achievement,
  UserAchievement,
  LeagueRole,
  LeagueVisibility,
  MatchStatus,
  MatchStage,
  PredictionResult,
} from "@prisma/client";

export type {
  User,
  League,
  LeagueMember,
  Match,
  Prediction,
  Achievement,
  UserAchievement,
  LeagueRole,
  LeagueVisibility,
  MatchStatus,
  MatchStage,
  PredictionResult,
};

export type LeagueWithMembers = League & {
  members: (LeagueMember & { user: Pick<User, "id" | "name" | "image" | "username"> })[];
};

export type OtherPrediction = {
  userId: string;
  name: string | null;
  username: string | null;
  image: string | null;
  homeScore: number;
  awayScore: number;
  result: string | null;
  points: number;
  bonusPoints: number;
};

export type MatchWithPrediction = Match & {
  predictions?: Prediction[];
  otherPredictions?: OtherPrediction[];
};

export type RankingEntry = {
  userId: string;
  name: string | null;
  username: string | null;
  image: string | null;
  totalPoints: number;
  rank: number;
  exactScores: number;
  correctResults: number;
};

export type UserStats = {
  totalPoints: number;
  totalPredictions: number;
  exactScores: number;
  correctResults: number;
  correctWinners: number;
  accuracy: number;
};

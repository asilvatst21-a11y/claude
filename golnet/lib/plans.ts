export const PLANS = {
  FREE: {
    maxLeagues: 2,
    maxLeagueMembers: 10,
    maxOwnedLeagues: 1,
    hasH2H: false,
    hasRoundRanking: false,
    hasAllAchievements: false,
    showAds: true,
  },
  PRO: {
    maxLeagues: Infinity,
    maxLeagueMembers: Infinity,
    maxOwnedLeagues: Infinity,
    hasH2H: true,
    hasRoundRanking: true,
    hasAllAchievements: true,
    showAds: false,
  },
  ENTERPRISE: {
    maxLeagues: Infinity,
    maxLeagueMembers: 500,
    maxOwnedLeagues: Infinity,
    hasH2H: true,
    hasRoundRanking: true,
    hasAllAchievements: true,
    showAds: false,
  },
};

export function getUserPlan(plan: string) {
  return PLANS[plan as keyof typeof PLANS] ?? PLANS.FREE;
}

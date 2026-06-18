import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

const INTROS = [
  "Fechou a rodada e o bagulho ficou doido! 🔥",
  "Rodada encerrada, hora do acerto de contas! ⚽️",
  "Mais uma rodada no bolso, vamos à resenha! 🍿",
  "Apitou o fim, agora é hora de falar quem mandou bem e quem se escondeu. 🎙️",
];

const DONE_STATUSES = ["FINISHED", "POSTPONED", "CANCELLED"];

function displayName(user: { name: string | null; username: string | null }) {
  return user.name ?? (user.username ? `@${user.username}` : "Jogador misterioso");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function maybeGenerateRoundSummaries(affectedRounds: string[]) {
  const rounds = Array.from(new Set(affectedRounds.filter(Boolean)));
  for (const round of rounds) {
    await generateRoundSummaryIfComplete(round);
  }
}

async function generateRoundSummaryIfComplete(round: string) {
  const matches = await prisma.match.findMany({ where: { round } });
  if (matches.length === 0) return;
  if (!matches.every((m) => DONE_STATUSES.includes(m.status))) return;

  const leagues = await prisma.league.findMany();

  for (const league of leagues) {
    const exists = await prisma.roundSummary.findUnique({
      where: { leagueId_round: { leagueId: league.id, round } },
    });
    if (exists) continue;

    let leagueMatches = matches;
    if (league.competitionName) {
      leagueMatches = leagueMatches.filter((m) => m.leagueName === league.competitionName);
    }
    if (league.teamFilter.length > 0) {
      leagueMatches = leagueMatches.filter(
        (m) => league.teamFilter.includes(m.homeTeam) || league.teamFilter.includes(m.awayTeam)
      );
    }
    if (leagueMatches.length === 0) continue;

    const text = await buildSummaryText(league.id, round, leagueMatches.map((m) => m.id));
    if (!text) continue;

    await prisma.roundSummary.create({ data: { leagueId: league.id, round, text } });
    await notifyMembers(league.id, league.name, round);
  }
}

async function notifyMembers(leagueId: string, leagueName: string, round: string) {
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    select: { userId: true },
  });

  await Promise.allSettled(
    members.map((m) =>
      sendPushToUser(m.userId, {
        title: "Resumo da rodada saiu! 🍿",
        body: `${leagueName}: a resenha da Rodada ${round} já está disponível.`,
        url: `/leagues/${leagueId}?tab=Rodadas`,
      })
    )
  );
}

async function buildSummaryText(leagueId: string, round: string, matchIds: string[]): Promise<string | null> {
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: { select: { name: true, username: true } } },
  });
  if (members.length < 2) return null;

  const memberIds = members.map((m) => m.userId);

  const [roundRankings, exactScores] = await Promise.all([
    prisma.roundRanking.findMany({ where: { leagueId, round } }),
    prisma.prediction.findMany({
      where: { matchId: { in: matchIds }, userId: { in: memberIds }, result: "EXACT_SCORE" },
      select: { userId: true },
    }),
  ]);

  const roundPoints = Object.fromEntries(roundRankings.map((r) => [r.userId, r.points]));
  const exactScoreUserIds = new Set(exactScores.map((p) => p.userId));

  const rows = members.map((m) => {
    const thisRound = roundPoints[m.userId] ?? 0;
    const current = m.totalPoints;
    const previous = current - thisRound;
    return { userId: m.userId, name: displayName(m.user), current, previous, thisRound };
  });

  const byCurrent = [...rows].sort((a, b) => b.current - a.current);
  const byPrevious = [...rows].sort((a, b) => b.previous - a.previous);
  const currentRank = Object.fromEntries(byCurrent.map((r, i) => [r.userId, i + 1]));
  const previousRank = Object.fromEntries(byPrevious.map((r, i) => [r.userId, i + 1]));

  const withClimb = rows.map((r) => ({ ...r, climb: previousRank[r.userId] - currentRank[r.userId] }));

  const leader = byCurrent[0];
  const biggestClimber = [...withClimb].sort((a, b) => b.climb - a.climb)[0];
  const biggestFaller = [...withClimb].sort((a, b) => a.climb - b.climb)[0];
  const roundStar = [...rows].sort((a, b) => b.thisRound - a.thisRound)[0];
  const zeros = rows.filter((r) => r.thisRound === 0);

  const lines: string[] = [];
  lines.push(`🏆 Resenha da Rodada ${round}`);
  lines.push("");
  lines.push(pick(INTROS));
  lines.push("");
  lines.push(`🥇 ${leader.name} segue na liderança com ${leader.current} pontos.`);

  if (roundStar.thisRound > 0 && roundStar.userId !== leader.userId) {
    lines.push(`🔥 Mas o destaque da rodada foi ${roundStar.name}, que fez ${roundStar.thisRound} pontos e deu um show.`);
  } else if (roundStar.thisRound > 0) {
    lines.push(`🔥 E ainda mandou bem na rodada, somando mais ${roundStar.thisRound} pontos.`);
  }

  if (biggestClimber.climb > 0) {
    lines.push(
      `📈 ${biggestClimber.name} subiu ${biggestClimber.climb} posiç${biggestClimber.climb > 1 ? "ões" : "ão"} na tabela. Tá vindo com tudo!`
    );
  }

  if (biggestFaller.climb < 0 && biggestFaller.userId !== biggestClimber.userId) {
    lines.push(
      `📉 Já ${biggestFaller.name} não teve a mesma sorte e caiu ${Math.abs(biggestFaller.climb)} posiç${Math.abs(biggestFaller.climb) > 1 ? "ões" : "ão"}.`
    );
  }

  if (exactScoreUserIds.size > 0) {
    const names = rows.filter((r) => exactScoreUserIds.has(r.userId)).map((r) => r.name);
    lines.push(`🎯 Cravaram o placar exato nessa rodada: ${names.join(", ")}. Tiro certeiro!`);
  }

  if (zeros.length > 0 && zeros.length < rows.length) {
    const names = zeros.map((r) => r.name).slice(0, 3);
    lines.push(`💀 Rodada de zerar pra ${names.join(", ")}${zeros.length > 3 ? " e mais gente" : ""}. Bola pra frente!`);
  }

  lines.push("");
  lines.push("Bora pra próxima rodada! ⚽️");

  return lines.join("\n");
}

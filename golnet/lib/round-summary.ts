import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { PredictionResult } from "@prisma/client";

const INTROS = [
  "Fechou a rodada e o bagulho ficou doido! 🔥",
  "Rodada encerrada, hora do acerto de contas! ⚽️",
  "Mais uma rodada no bolso, vamos à resenha! 🍿",
  "Apitou o fim, agora é hora de falar quem mandou bem e quem se escondeu. 🎙️",
];

const LEADER_VERBS = [
  "disparou na liderança",
  "segue confortável na liderança",
  "mandou ver e ampliou a liderança",
];

const LEADER_FLAVORS = [
  "Tá jogando xadrez enquanto o resto joga dama.",
  "Time que tá ganhando não se mexe.",
  "Quem vai parar esse time?",
  "Tá sobrando esse campeonato.",
];

const DRAW_ADJECTIVES = ["chato", "movimentado", "nervoso", "travado"];

const CLIMBER_TEMPLATES: Array<(name: string, climb: number, posPhrase: string, tail: string) => string> = [
  (name, climb, posPhrase, tail) =>
    `📈 ${name} foi a sensação da rodada: subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
  (name, climb, posPhrase, tail) =>
    `🚀 ${name} deu um salto e tanto: pulou ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
  (name, climb, posPhrase, tail) =>
    `🔥 ${name} não tá de brincadeira: avançou ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
  (name, climb, posPhrase, tail) =>
    `⬆️ Renovou o fôlego: ${name} subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
];

const FALLER_TEMPLATES: Array<(name: string, pts: number, zeroedText: string, fallPhrase: string, tail: string) => string> = [
  (name, pts, zeroedText, fallPhrase, tail) =>
    `📉 Já ${name}… amigo, foram ${pts} ponto${pts === 1 ? "" : "s"} na rodada.${zeroedText} ${fallPhrase} ${tail}`,
  (name, pts, zeroedText, fallPhrase, tail) =>
    `😬 ${name} teve rodada pra esquecer: só ${pts} ponto${pts === 1 ? "" : "s"}.${zeroedText} ${fallPhrase} ${tail}`,
  (name, pts, zeroedText, fallPhrase, tail) =>
    `🥶 Gelou: ${name} fez apenas ${pts} ponto${pts === 1 ? "" : "s"} na rodada.${zeroedText} ${fallPhrase} ${tail}`,
  (name, pts, zeroedText, fallPhrase, tail) =>
    `🧊 Sextou mal pra ${name}: ${pts} ponto${pts === 1 ? "" : "s"} na rodada.${zeroedText} ${fallPhrase} ${tail}`,
];

const EXACT_SCORE_LEADINS: Array<(names: string, verb: string) => string> = [
  (names, verb) => `🎯 Placar exato da rodada: só ${names} ${verb} um cravado`,
  (names, verb) => `🎯 Sniper da rodada: ${names} ${verb} acerto cravado`,
  (names, verb) => `🎯 Tiro certo: ${names} ${verb} o placar na régua`,
  (names, verb) => `🎯 Mão de cirurgião: ${names} ${verb} o placar exato`,
];

const TIE_TEMPLATES: Array<(names: string, rank: number) => string> = [
  (names, rank) => `🤝 Empate geral entre ${names} na ${rank}ª posição — vai ser briga de foice na próxima rodada.`,
  (names, rank) => `🤝 ${names} empatados na ${rank}ª posição — ninguém quer ceder espaço.`,
  (names, rank) => `🤝 Quem desempata? ${names} estão emparelhados na ${rank}ª posição.`,
];

const CLOSING_LEADINS = ["Resumindo:", "Fechando a conta:", "Pra resumir:", "No fim das contas:"];

const FEMININE_TEAMS = new Set([
  "argentina", "frança", "franca", "france", "alemanha", "germany",
  "inglaterra", "england", "bélgica", "belgica", "belgium",
  "colômbia", "colombia", "coreia do sul", "coreia", "south korea", "korea republic", "korea",
  "croácia", "croacia", "croatia", "suíça", "suica", "switzerland",
  "itália", "italia", "italy", "espanha", "spain", "hungria", "hungary",
  "escócia", "escocia", "scotland", "polônia", "polonia", "poland",
  "irlanda", "ireland", "áustria", "austria", "romênia", "romania",
  "dinamarca", "denmark", "suécia", "suecia", "sweden", "noruega", "norway",
  "tunísia", "tunisia", "nova zelândia", "new zealand", "costa rica",
  "arábia saudita", "saudi arabia", "jamaica", "holanda",
]);

const DONE_STATUSES = ["FINISHED", "POSTPONED", "CANCELLED"];

function displayName(user: { name: string | null; username: string | null }) {
  return user.name ?? (user.username ? `@${user.username}` : "Jogador misterioso");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function article(team: string): string {
  const t = team.trim().toLowerCase();
  if (t === "eua" || t === "usa" || t === "united states" || t.startsWith("estados unidos")) return "dos";
  return FEMININE_TEAMS.has(t) ? "da" : "do";
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

type MatchInfo = { id: string; homeTeam: string; awayTeam: string };
type PredRow = { userId: string; matchId: string; homeScore: number; awayScore: number; result: PredictionResult };

const PICK_PRIORITY: Record<string, number> = {
  EXACT_SCORE: 0,
  CORRECT_DRAW: 1,
  CORRECT_RESULT_AND_DIFF: 2,
  CORRECT_WINNER: 3,
};

function describePick(pred: PredRow, match: MatchInfo): string | null {
  const team = match.homeTeam;
  const art = article(team);
  switch (pred.result) {
    case "EXACT_SCORE":
      return `cravou o ${pred.homeScore}x${pred.awayScore} ${art} ${team}`;
    case "CORRECT_DRAW":
      return `acertou o empate ${pick(DRAW_ADJECTIVES)} ${art} ${team}`;
    case "CORRECT_RESULT_AND_DIFF":
      return `acertou o resultado e o saldo ${art} ${team}`;
    case "CORRECT_WINNER":
      return `acertou o vencedor ${art} ${team}`;
    default:
      return null;
  }
}

function topPicks(preds: PredRow[], matchById: Record<string, MatchInfo>, limit: number): string[] {
  const candidates = preds
    .filter((p) => p.result in PICK_PRIORITY && matchById[p.matchId])
    .sort((a, b) => PICK_PRIORITY[a.result] - PICK_PRIORITY[b.result]);

  const phrases: string[] = [];
  for (const p of candidates) {
    const phrase = describePick(p, matchById[p.matchId]);
    if (phrase) phrases.push(phrase);
    if (phrases.length >= limit) break;
  }
  return phrases;
}

function joinPicks(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  return `${phrases[0]} e ainda ${phrases.slice(1).join(" e ainda ")}`;
}

function climbPositionPhrase(rank: number): string {
  if (rank === 1) return "chegou à liderança!";
  if (rank <= 3) return "chegou ao top 3";
  return `chegou à ${rank}ª posição`;
}

function findTie<T extends { userId: string; name: string; current: number }>(
  rows: T[],
  currentRank: Record<string, number>
): { names: string[]; rank: number } | null {
  const groups = new Map<number, T[]>();
  for (const r of rows) {
    if (!groups.has(r.current)) groups.set(r.current, []);
    groups.get(r.current)!.push(r);
  }

  let best: { names: string[]; rank: number } | null = null;
  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue;
    const rank = Math.min(...group.map((g) => currentRank[g.userId]));
    if (!best || rank < best.rank) best = { names: group.map((g) => g.name), rank };
  }
  return best;
}

type LeagueInfo = { id: string; name: string; competitionName: string | null; teamFilter: string[] };

export async function maybeGenerateRoundSummaries(affectedRounds: string[], options?: { notify?: boolean }) {
  const notify = options?.notify ?? true;
  const rounds = Array.from(new Set(affectedRounds.filter(Boolean)));
  if (rounds.length === 0) return;

  const leagues = await prisma.league.findMany({
    select: { id: true, name: true, competitionName: true, teamFilter: true },
  });

  for (const round of rounds) {
    await generateRoundSummaryIfComplete(round, notify, leagues);
  }
}

async function generateRoundSummaryIfComplete(round: string, notify: boolean, leagues: LeagueInfo[]) {
  const matches = await prisma.match.findMany({ where: { round } });
  if (matches.length === 0) return;
  if (!matches.every((m) => DONE_STATUSES.includes(m.status))) return;

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
    if (notify) await notifyMembers(league.id, league.name, round);
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

  const [roundRankings, preds, matches] = await Promise.all([
    prisma.roundRanking.findMany({ where: { leagueId, round } }),
    prisma.prediction.findMany({
      where: { matchId: { in: matchIds }, userId: { in: memberIds }, result: { not: null } },
      select: { userId: true, matchId: true, homeScore: true, awayScore: true, result: true },
    }),
    prisma.match.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, homeTeam: true, awayTeam: true },
    }),
  ]);

  const matchById = Object.fromEntries(matches.map((m) => [m.id, m]));
  const roundPoints = Object.fromEntries(roundRankings.map((r) => [r.userId, r.points]));

  const predsByUser: Record<string, PredRow[]> = {};
  for (const p of preds) {
    if (!p.result) continue;
    (predsByUser[p.userId] ??= []).push({ ...p, result: p.result });
  }

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

  const lines: string[] = [];
  lines.push(`🏆 Resenha da Rodada ${round}`);
  lines.push("");
  lines.push(pick(INTROS));
  lines.push("");

  // Leader
  const leaderPicks = topPicks(predsByUser[leader.userId] ?? [], matchById, 2);
  const leaderPickText = joinPicks(leaderPicks);
  lines.push(
    `🥇 ${leader.name} ${pick(LEADER_VERBS)} com ${leader.current} pontos${leaderPickText ? ` — ${leaderPickText}` : ""}. ${pick(LEADER_FLAVORS)}`
  );

  // Biggest climber
  if (biggestClimber.climb > 0) {
    const rank = currentRank[biggestClimber.userId];
    const partial = (predsByUser[biggestClimber.userId] ?? []).filter((p) => p.result === "CORRECT_RESULT_AND_DIFF").length;
    const tail = partial > 0
      ? `Bateu na trave ${partial > 1 ? `${partial} vezes` : "uma vez"} (placar parcial), mas o que importa é que ${biggestClimber.name} tá vindo com tudo.`
      : `${biggestClimber.name} tá vindo com tudo.`;
    lines.push(pick(CLIMBER_TEMPLATES)(biggestClimber.name, biggestClimber.climb, climbPositionPhrase(rank), tail));
  }

  // Biggest faller
  if (biggestFaller.climb < 0 && biggestFaller.userId !== biggestClimber.userId) {
    const rank = currentRank[biggestFaller.userId];
    const isLast = rank === rows.length;
    const zeroed = biggestFaller.thisRound === 0;
    const fallPhrase = isLast ? "Caiu pra última posição" : `Caiu pra ${rank}ª posição`;
    const tail = isLast
      ? "e agora tá numa zona de rebaixamento imaginária que só existe no nosso grupo do WhatsApp. 💀"
      : "na tabela.";
    lines.push(
      pick(FALLER_TEMPLATES)(biggestFaller.name, biggestFaller.thisRound, zeroed ? " Zerou tudo." : "", fallPhrase, tail)
    );
  }

  // Exact scores this round
  const exactRows = rows.filter((r) => (predsByUser[r.userId] ?? []).some((p) => p.result === "EXACT_SCORE"));
  if (exactRows.length > 0) {
    const names = exactRows.map((r) => r.name);
    const underdog = exactRows.find((r) => r.userId !== leader.userId);
    let underdogText = "";
    if (underdog) {
      const exactPred = predsByUser[underdog.userId]!.find((p) => p.result === "EXACT_SCORE")!;
      const match = matchById[exactPred.matchId];
      if (match) {
        underdogText = ` — ${underdog.name} pregou o ${exactPred.homeScore}x${exactPred.awayScore} ${article(match.homeTeam)} ${match.homeTeam} que ninguém via vindo`;
      }
    }
    const verb = names.length > 1 ? "acertaram" : "acertou";
    lines.push(`${pick(EXACT_SCORE_LEADINS)(joinNames(names), verb)}${underdogText}.`);
  }

  // Tie for a position
  const tie = findTie(rows, currentRank);
  if (tie) {
    lines.push(pick(TIE_TEMPLATES)(joinNames(tie.names), tie.rank));
  }

  // Closing
  const roundNum = Number(round);
  const isNumericRound = round.trim() !== "" && Number.isFinite(roundNum);
  const summaryParts = [`${leader.name} reina`];
  if (biggestClimber.climb > 0) summaryParts.push(`${biggestClimber.name} sobe igual foguete`);
  if (biggestFaller.climb < 0 && biggestFaller.userId !== biggestClimber.userId) {
    summaryParts.push(`${biggestFaller.name} precisa rever a vida (ou pelo menos os palpites)`);
  }
  const nextRoundText = isNumericRound ? `Bora pra rodada ${roundNum + 1}! ⚽️` : "Bora pra próxima rodada! ⚽️";

  lines.push("");
  lines.push(`${pick(CLOSING_LEADINS)} ${summaryParts.join(", ")}. ${nextRoundText}`);

  return lines.join("\n");
}

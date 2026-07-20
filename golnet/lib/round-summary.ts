import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { PredictionResult } from "@prisma/client";

const DRAW_ADJECTIVES = ["chato", "movimentado", "nervoso", "travado"];

// Each Tone is a self-contained voice for the whole recap — title, intro, every section
// template and the closing all come from the SAME tone, so a round doesn't just swap one
// sentence, it reads like a different writer altogether. One tone is picked per summary.
type Tone = {
  title: (round: string) => string;
  intros: string[];
  leaderTemplates: Array<(name: string, points: number, pickText: string) => string>;
  climberTemplates: Array<(name: string, climb: number, posPhrase: string, tail: string) => string>;
  fallerTemplates: Array<(name: string, pts: number, zeroedText: string, fallPhrase: string, tail: string) => string>;
  calmTemplates: string[];
  exactScoreLeadins: Array<(names: string, verb: string) => string>;
  tieTemplates: Array<(names: string, rank: number) => string>;
  closingLeadins: string[];
};

const TONES: Tone[] = [
  {
    title: (round) => `🏆 Resenha da Rodada ${round}`,
    intros: [
      "Apitou o fim, agora é hora de falar quem mandou bem e quem se escondeu. 🎙️",
      "Fechou a rodada e o bagulho ficou doido! 🔥",
      "Rodada encerrada, hora do acerto de contas! ⚽️",
    ],
    leaderTemplates: [
      (name, pts, pickText) => `🥇 ${name} segue confortável na liderança com ${pts} pontos${pickText ? ` — ${pickText}` : ""}. Time que tá ganhando não se mexe.`,
      (name, pts, pickText) => `🥇 ${name} disparou na liderança com ${pts} pontos${pickText ? ` — ${pickText}` : ""}. Tá sobrando esse campeonato.`,
      (name, pts, pickText) => `🥇 ${name} mandou ver e ampliou a liderança: foram ${pts} pontos${pickText ? ` — ${pickText}` : ""}. Quem vai parar esse time?`,
    ],
    climberTemplates: [
      (name, climb, posPhrase, tail) => `📈 ${name} foi a sensação da rodada: subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
      (name, climb, posPhrase, tail) => `🚀 ${name} deu um show: subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
    ],
    fallerTemplates: [
      (name, pts, zeroedText, fallPhrase, tail) => `📉 ${name} não teve a melhor rodada: só ${pts} ponto${pts === 1 ? "" : "s"}.${zeroedText} ${fallPhrase} ${tail}`,
      (name, pts, zeroedText, fallPhrase, tail) => `😬 ${name} teve rodada pra esquecer: só ${pts} ponto${pts === 1 ? "" : "s"}.${zeroedText} ${fallPhrase} ${tail}`,
    ],
    calmTemplates: [
      "😴 Rodada tranquila: ninguém se arriscou muito e a tabela ficou praticamente como estava.",
      "🤷 Rodada sem grandes emoções — todo mundo manteve a posição.",
    ],
    exactScoreLeadins: [
      (names, verb) => `🎯 Placar exato da rodada: só ${names} ${verb} um cravado`,
      (names, verb) => `🎯 Mão de cirurgião: ${names} ${verb} o placar exato`,
    ],
    tieTemplates: [
      (names, rank) => `🤝 Empate geral entre ${names} na ${rank}ª posição — vai ser briga de foice na próxima rodada.`,
    ],
    closingLeadins: ["Resumindo:", "Fechando a conta:"],
  },
  {
    title: (round) => `😏 Raio-X da Rodada ${round}`,
    intros: [
      "Rodada fechou e tem gente que não vai gostar do que vou contar. 😏",
      "Senta que lá vem resenha sem filtro dessa rodada. 🍿",
      "Ninguém me pagou pra ser gentil, então vamos direto ao ponto.",
    ],
    leaderTemplates: [
      (name, pts, pickText) => `👑 ${name} tá lá no topo de novo, ${pts} pontos${pickText ? ` (${pickText})` : ""}. Sorte? Talvez. Mas tá lá.`,
      (name, pts, pickText) => `👑 ${name} simplesmente não erra: ${pts} pontos${pickText ? ` (${pickText})` : ""} e segue mandando.`,
      (name, pts, pickText) => `👑 Mais uma rodada, mais uma vez ${name} na frente com ${pts} pontos${pickText ? ` (${pickText})` : ""}. Cansa só de ver.`,
    ],
    climberTemplates: [
      (name, climb, posPhrase, tail) => `⬆️ ${name} resolveu aparecer: subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
      (name, climb, posPhrase, tail) => `📈 Olha quem lembrou que joga: ${name} subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
    ],
    fallerTemplates: [
      (name, pts, zeroedText, fallPhrase, tail) => `💀 ${name} jogou pra perder mesmo: ${pts} ponto${pts === 1 ? "" : "s"} na rodada.${zeroedText} ${fallPhrase} ${tail}`,
      (name, pts, zeroedText, fallPhrase, tail) => `🧊 Gelou geral: ${name} com só ${pts} ponto${pts === 1 ? "" : "s"}.${zeroedText} ${fallPhrase} ${tail}`,
    ],
    calmTemplates: [
      "🙄 Rodada sem graça: ninguém arriscou e a tabela nem se importou.",
    ],
    exactScoreLeadins: [
      (names, verb) => `🎯 Pra constar: só ${names} ${verb} o cravado`,
      (names, verb) => `🎯 Detalhe que ninguém pediu: ${names} ${verb} o placar exato`,
    ],
    tieTemplates: [
      (names, rank) => `🤝 ${names} empatadinhos na ${rank}ª posição, que fofo.`,
    ],
    closingLeadins: ["Resumo sem enrolação:", "Pra fechar com estilo:"],
  },
  {
    title: (round) => `📣 Fofoca da Rodada ${round}`,
    intros: [
      "Gente, para tudo que essa rodada teve história! 📣",
      "Vocês não vão acreditar no que aconteceu nessa rodada... 👀",
      "Abre o grupo que a resenha da rodada chegou! 📲",
    ],
    leaderTemplates: [
      (name, pts, pickText) => `👑 Olha quem continua mandando: ${name}, com ${pts} pontos${pickText ? ` (${pickText})` : ""}. Já virou rotina.`,
      (name, pts, pickText) => `👑 Adivinha quem tá na frente outra vez? ${name}, com ${pts} pontos${pickText ? ` (${pickText})` : ""}.`,
    ],
    climberTemplates: [
      (name, climb, posPhrase, tail) => `📈 Gente, ${name} deu um salto e tanto: subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
      (name, climb, posPhrase, tail) => `🚀 Vocês viram ${name}? Subiu ${climb} posiç${climb > 1 ? "ões" : "ão"} e ${posPhrase} ${tail}`,
    ],
    fallerTemplates: [
      (name, pts, zeroedText, fallPhrase, tail) => `😱 Gente, ${name} despencou: só ${pts} ponto${pts === 1 ? "" : "s"} na rodada.${zeroedText} ${fallPhrase} ${tail}`,
      (name, pts, zeroedText, fallPhrase, tail) => `😨 Alguém avisa ${name} que a rodada foi ruim: ${pts} ponto${pts === 1 ? "" : "s"}.${zeroedText} ${fallPhrase} ${tail}`,
    ],
    calmTemplates: [
      "🤔 Pra ser sincero, nem teve fofoca essa rodada — a tabela ficou quase intacta.",
    ],
    exactScoreLeadins: [
      (names, verb) => `🎯 Mas gente, o ouro da rodada: ${names} ${verb} o placar exato`,
      (names, verb) => `🎯 Pausa pra aplaudir: ${names} ${verb} um cravado certinho`,
    ],
    tieTemplates: [
      (names, rank) => `🤝 Vocês viram esse empate? ${names} dividindo a ${rank}ª posição!`,
    ],
    closingLeadins: ["Resumo da fofoca:", "Pra quem chegou agora:"],
  },
];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

const KNOCKOUT_CLOSINGS = [
  "Fase de grupos acabou — agora é mata-mata! ⚔️",
  "Chega de grupo: a partir de agora, quem perde tá fora. Falta pouco pra final! 🏆",
  "Bola pro chaveamento, porque agora é tudo ou nada! 🔥",
];

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

  // If this round is entirely group-stage matches AND it contains the chronologically
  // last group-stage fixture for the competition AND knockout-round fixtures already
  // exist (i.e. the bracket has been drawn) — this is the round that closes out the
  // groups, so the summary should announce the transition into the knockout stage.
  let groupStageEnding = false;
  if (matches.every((m) => m.stage === "GROUP")) {
    const leagueNames = Array.from(new Set(matches.map((m) => m.leagueName))).filter(
      (n): n is string => n != null
    );
    const [knockoutCount, latestGroupMatch] = await Promise.all([
      prisma.match.count({ where: { leagueName: { in: leagueNames }, stage: { not: "GROUP" } } }),
      prisma.match.findFirst({
        where: { leagueName: { in: leagueNames }, stage: "GROUP" },
        orderBy: { startsAt: "desc" },
        select: { round: true },
      }),
    ]);
    groupStageEnding = knockoutCount > 0 && latestGroupMatch?.round === round;
  }

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

    const text = await buildSummaryText(league.id, round, leagueMatches.map((m) => m.id), groupStageEnding);
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

async function buildSummaryText(leagueId: string, round: string, matchIds: string[], groupStageEnding: boolean): Promise<string | null> {
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

  const tone = pick(TONES);

  const lines: string[] = [];
  lines.push(tone.title(round));
  lines.push("");
  lines.push(pick(tone.intros));
  lines.push("");

  // Leader
  const leaderPicks = topPicks(predsByUser[leader.userId] ?? [], matchById, 2);
  const leaderPickText = joinPicks(leaderPicks);
  lines.push(pick(tone.leaderTemplates)(leader.name, leader.current, leaderPickText));

  // Middle blocks (climber/faller/exact-score/tie) are shuffled so their order
  // varies round to round too, instead of always reading top-to-bottom the same way.
  const middleBlocks: string[] = [];

  // Biggest climber
  let hadClimber = false;
  if (biggestClimber.climb > 0) {
    hadClimber = true;
    const rank = currentRank[biggestClimber.userId];
    const partial = (predsByUser[biggestClimber.userId] ?? []).filter((p) => p.result === "CORRECT_RESULT_AND_DIFF").length;
    const tail = partial > 0
      ? `Bateu na trave ${partial > 1 ? `${partial} vezes` : "uma vez"} (placar parcial), mas o que importa é que ${biggestClimber.name} tá vindo com tudo.`
      : `${biggestClimber.name} tá vindo com tudo.`;
    middleBlocks.push(pick(tone.climberTemplates)(biggestClimber.name, biggestClimber.climb, climbPositionPhrase(rank), tail));
  }

  // Biggest faller
  let hadFaller = false;
  if (biggestFaller.climb < 0 && biggestFaller.userId !== biggestClimber.userId) {
    hadFaller = true;
    const rank = currentRank[biggestFaller.userId];
    const isLast = rank === rows.length;
    const zeroed = biggestFaller.thisRound === 0;
    const fallPhrase = isLast ? "Caiu pra última posição" : `Caiu pra ${rank}ª posição`;
    const tail = isLast
      ? "e agora tá numa zona de rebaixamento imaginária que só existe no nosso grupo do WhatsApp. 💀"
      : "na tabela.";
    middleBlocks.push(
      pick(tone.fallerTemplates)(biggestFaller.name, biggestFaller.thisRound, zeroed ? " Zerou tudo." : "", fallPhrase, tail)
    );
  }

  if (!hadClimber && !hadFaller) {
    middleBlocks.push(pick(tone.calmTemplates));
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
    middleBlocks.push(`${pick(tone.exactScoreLeadins)(joinNames(names), verb)}${underdogText}.`);
  }

  // Tie for a position
  const tie = findTie(rows, currentRank);
  if (tie) {
    middleBlocks.push(pick(tone.tieTemplates)(joinNames(tie.names), tie.rank));
  }

  lines.push(...shuffle(middleBlocks));

  // Closing
  const roundNum = Number(round);
  const isNumericRound = round.trim() !== "" && Number.isFinite(roundNum);
  const summaryParts = [`${leader.name} reina`];
  if (hadClimber) summaryParts.push(`${biggestClimber.name} sobe igual foguete`);
  if (hadFaller) {
    summaryParts.push(`${biggestFaller.name} precisa rever a vida (ou pelo menos os palpites)`);
  }
  const nextRoundText = groupStageEnding
    ? pick(KNOCKOUT_CLOSINGS)
    : isNumericRound ? `Bora pra rodada ${roundNum + 1}! ⚽️` : "Bora pra próxima rodada! ⚽️";

  lines.push("");
  lines.push(`${pick(tone.closingLeadins)} ${summaryParts.join(", ")}. ${nextRoundText}`);

  return lines.join("\n");
}

// ─── Championship Summary ─────────────────────────────────────────────────────

const CHAMP_INTROS = [
  "O apito final soou e o campeonato acabou. Chegou a hora do veredicto! 🏆",
  "Cabou! O torneio encerrou e é hora de coroar o campeão do bolão! 🥇",
  "Depois de tantos palpites, tantas emoções e uns sustos, o campeão do bolão está definido. 🎉",
  "Fim de papo, fim de torneio. Vamos ver quem mandou bem do começo ao fim! 🏁",
];

const CHAMP_TITLES = [
  "🏆 O Campeão do Bolão!",
  "🥇 Encerramento do Campeonato",
  "🎉 É Campeão!",
  "🏁 Fim de Torneio — O Veredicto Final",
];

const CHAMP_WINNER_TEMPLATES: Array<(name: string, pts: number) => string> = [
  (name, pts) => `👑 ${name} é o grande campeão do bolão com ${pts} pontos! Intocável do começo ao fim.`,
  (name, pts) => `🥇 ${name} dominou a temporada e fecha como campeão absoluto: ${pts} pontos. Parabéns!`,
  (name, pts) => `🏆 Ninguém chegou perto de ${name} — ${pts} pontos e o troféu vai pra ele(a). Absurdo!`,
  (name, pts) => `👑 A temporada foi longa, mas ${name} nunca vacilou: ${pts} pontos e título no bolso!`,
];

const CHAMP_PODIUM_TEMPLATES: Array<(second: string, third: string) => string> = [
  (second, third) => `🥈 ${second} fica com o vice e 🥉 ${third} completa o pódio. Honra!`,
  (second, third) => `O pódio: 🥈 ${second} e 🥉 ${third} na sequência. Quase lá!`,
  (second, third) => `🥈 ${second} e 🥉 ${third} no pódio — chegaram perto mas o troféu não era pra eles.`,
];

const CHAMP_BEST_ROUND_TEMPLATES: Array<(name: string, round: string, pts: number) => string> = [
  (name, round, pts) => `🔥 Maior pontuação de uma rodada foi de ${name}: ${pts} pts na rodada ${round}. Que rodada!`,
  (name, round, pts) => `💥 ${name} teve a melhor rodada do campeonato — ${pts} pts na rodada ${round}. Chapéu!`,
  (name, round, pts) => `🎯 Destaque de rodada: ${name} com ${pts} pontos na rodada ${round}. Impressionante!`,
];

const CHAMP_EXACT_TEMPLATES: Array<(name: string, count: number) => string> = [
  (name, count) => `🎯 Mão de ouro do campeonato: ${name} com ${count} placar${count > 1 ? "es exatos" : " exato"} ao longo do torneio. Monstro!`,
  (name, count) => `🏅 Craque dos cravados: ${name} acertou o placar exato ${count} vez${count > 1 ? "es" : ""}. Parabéns!`,
];

const CHAMP_CLOSINGS = [
  "Obrigado a todos pela participação. Até o próximo torneio! 👋⚽",
  "Foi incrível. Nos vemos no próximo campeonato! 🏆",
  "Grande temporada! Bora repetir essa dose no próximo torneio? 🔥",
  "Torneio encerrado com chave de ouro. Até a próxima! 🎊",
];

export async function maybeGenerateChampionshipSummaries(leagues?: { id: string; name: string; competitionName: string | null; teamFilter: string[] }[]) {
  const allLeagues = leagues ?? await prisma.league.findMany({
    select: { id: true, name: true, competitionName: true, teamFilter: true },
  });

  for (const league of allLeagues) {
    // Only generate once per league
    const exists = await prisma.championshipSummary.findUnique({ where: { leagueId: league.id } });
    if (exists) continue;

    // Find matches for this league's competition
    const whereBase = league.competitionName
      ? { leagueName: league.competitionName }
      : {};
    const teamFilter = league.teamFilter.length > 0
      ? { OR: [{ homeTeam: { in: league.teamFilter } }, { awayTeam: { in: league.teamFilter } }] }
      : {};

    const allMatches = await prisma.match.findMany({
      where: { ...whereBase, ...teamFilter },
      select: { id: true, status: true, stage: true },
    });

    if (allMatches.length === 0) continue;

    // Require ALL matches to be done, AND at least one FINAL stage match
    if (!allMatches.every((m) => DONE_STATUSES.includes(m.status))) continue;
    if (!allMatches.some((m) => m.stage === "FINAL")) continue;

    const text = await buildChampionshipText(league.id);
    if (!text) continue;

    await prisma.championshipSummary.create({ data: { leagueId: league.id, text } });
    await notifyMembers(league.id, league.name, "Encerramento");
  }
}

async function buildChampionshipText(leagueId: string): Promise<string | null> {
  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: { select: { name: true, username: true } } },
    orderBy: { totalPoints: "desc" },
  });
  if (members.length < 2) return null;

  const memberIds = members.map((m) => m.userId);
  const nameOf = (userId: string) =>
    displayName(members.find((m) => m.userId === userId)!.user);

  // Best single round
  const allRoundRankings = await prisma.roundRanking.findMany({
    where: { leagueId, userId: { in: memberIds } },
    orderBy: { points: "desc" },
  });
  const bestRound = allRoundRankings[0];

  // Most exact scores
  const exactCounts = await prisma.prediction.groupBy({
    by: ["userId"],
    where: { userId: { in: memberIds }, result: "EXACT_SCORE" },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  const topExact = exactCounts[0];

  const champion = members[0];
  const second = members[1];
  const third = members.length > 2 ? members[2] : null;

  const lines: string[] = [];
  lines.push(pick(CHAMP_TITLES));
  lines.push("");
  lines.push(pick(CHAMP_INTROS));
  lines.push("");
  lines.push(pick(CHAMP_WINNER_TEMPLATES)(displayName(champion.user), champion.totalPoints));
  if (second && third) {
    lines.push(pick(CHAMP_PODIUM_TEMPLATES)(displayName(second.user), displayName(third.user)));
  } else if (second) {
    lines.push(`🥈 ${displayName(second.user)} fica com o vice — chegou perto!`);
  }
  lines.push("");

  if (bestRound) {
    lines.push(pick(CHAMP_BEST_ROUND_TEMPLATES)(nameOf(bestRound.userId), bestRound.round, bestRound.points));
  }
  if (topExact && topExact._count.id > 0) {
    lines.push(pick(CHAMP_EXACT_TEMPLATES)(nameOf(topExact.userId), topExact._count.id));
  }

  lines.push("");
  lines.push(pick(CHAMP_CLOSINGS));

  return lines.join("\n");
}

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Match, Prediction, MatchStage } from "@/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const metadata = { title: "Chaveamento — PalpitaAí" };

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const KNOCKOUT_STAGES: { stage: MatchStage; label: string }[] = [
  { stage: "ROUND_OF_16", label: "Oitavas de Final" },
  { stage: "QUARTER_FINAL", label: "Quartas de Final" },
  { stage: "SEMI_FINAL", label: "Semifinal" },
  { stage: "FINAL", label: "Final" },
];

const resultBadge: Record<string, { bg: string; label: string }> = {
  EXACT_SCORE: { bg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", label: "Placar exato" },
  CORRECT_RESULT_AND_DIFF: { bg: "bg-green-500/20 text-green-400 border-green-500/40", label: "Resultado + saldo" },
  CORRECT_WINNER: { bg: "bg-blue-500/20 text-blue-400 border-blue-500/40", label: "Vencedor" },
  CORRECT_DRAW: { bg: "bg-blue-500/20 text-blue-400 border-blue-500/40", label: "Empate" },
  WRONG: { bg: "bg-red-500/20 text-red-400 border-red-500/40", label: "Errou" },
};

type MatchWithPrediction = Match & { predictions: Prediction[] };

function MatchCard({ match, prediction }: { match: MatchWithPrediction; prediction?: Prediction }) {
  const isFinished = match.status === "FINISHED";
  const badge = prediction?.result ? resultBadge[prediction.result] : null;

  return (
    <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 flex items-center gap-1.5">
          {match.homeTeamFlag && (
            <img src={match.homeTeamFlag} alt="" className="w-5 h-5 object-contain shrink-0" />
          )}
          <span className="text-white font-medium truncate">{match.homeTeam}</span>
        </div>

        <div className="shrink-0 text-center">
          {isFinished && match.homeScore !== null && match.awayScore !== null ? (
            <span className="text-white font-bold">{match.homeScore}–{match.awayScore}</span>
          ) : (
            <span className="text-zinc-500 text-xs">
              {format(new Date(match.startsAt), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>

        <div className="flex-1 flex items-center justify-end gap-1.5">
          <span className="text-white font-medium truncate text-right">{match.awayTeam}</span>
          {match.awayTeamFlag && (
            <img src={match.awayTeamFlag} alt="" className="w-5 h-5 object-contain shrink-0" />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-1">
        {prediction ? (
          <span className="text-xs text-zinc-400">
            Palpite: {prediction.homeScore}–{prediction.awayScore}
          </span>
        ) : (
          <span className="text-xs text-zinc-600">Sem palpite</span>
        )}
        {badge ? (
          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badge.bg}`}>
            {badge.label}
          </span>
        ) : prediction ? (
          <span className="text-xs px-1.5 py-0.5 rounded border bg-zinc-700/50 text-zinc-400 border-zinc-600">
            Aguardando
          </span>
        ) : null}
      </div>
    </div>
  );
}

function KnockoutSlot({ match, prediction }: { match?: MatchWithPrediction; prediction?: Prediction }) {
  if (!match) return null;

  const isFinished = match.status === "FINISHED";

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm min-w-[200px]">
      <div className="flex items-center gap-2 mb-1">
        {match.homeTeamFlag && (
          <img src={match.homeTeamFlag} alt="" className="w-5 h-5 object-contain shrink-0" />
        )}
        <span className="text-white text-xs font-medium flex-1 truncate">{match.homeTeam}</span>
        {isFinished && match.homeScore !== null && (
          <span className="text-white font-bold text-xs">{match.homeScore}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {match.awayTeamFlag && (
          <img src={match.awayTeamFlag} alt="" className="w-5 h-5 object-contain shrink-0" />
        )}
        <span className="text-white text-xs font-medium flex-1 truncate">{match.awayTeam}</span>
        {isFinished && match.awayScore !== null && (
          <span className="text-white font-bold text-xs">{match.awayScore}</span>
        )}
      </div>
      {!isFinished && (
        <div className="text-zinc-500 text-xs mt-1 text-center">
          {format(new Date(match.startsAt), "dd/MM HH:mm", { locale: ptBR })}
        </div>
      )}
      {prediction && (
        <div className="mt-1 pt-1 border-t border-zinc-700 text-xs text-zinc-400">
          Palpite: {prediction.homeScore}–{prediction.awayScore}
          {prediction.result && resultBadge[prediction.result] && (
            <span className={`ml-1 px-1 py-0.5 rounded border font-medium text-xs ${resultBadge[prediction.result].bg}`}>
              {resultBadge[prediction.result].label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TBDSlot() {
  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded-lg p-3 text-sm min-w-[200px] opacity-50">
      <div className="text-zinc-500 text-xs text-center py-1">A definir</div>
    </div>
  );
}

export default async function BracketPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const [matches, predictions] = await Promise.all([
    prisma.match.findMany({
      orderBy: [{ stage: "asc" }, { group: "asc" }, { startsAt: "asc" }],
    }),
    prisma.prediction.findMany({
      where: { userId },
    }),
  ]);

  const predByMatch = new Map(predictions.map((p) => [p.matchId, p]));

  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  const knockoutMatches = matches.filter((m) => m.stage !== "GROUP");

  // Group phase: group by group letter
  const groupMap = new Map<string, MatchWithPrediction[]>();
  for (const group of GROUPS) {
    groupMap.set(
      group,
      groupMatches
        .filter((m) => m.group === group)
        .map((m) => ({ ...m, predictions: predByMatch.has(m.id) ? [predByMatch.get(m.id)!] : [] }))
    );
  }

  // Knockout phase: group by stage
  const stageMap = new Map<MatchStage, MatchWithPrediction[]>();
  for (const { stage } of KNOCKOUT_STAGES) {
    stageMap.set(
      stage,
      knockoutMatches
        .filter((m) => m.stage === stage)
        .map((m) => ({ ...m, predictions: predByMatch.has(m.id) ? [predByMatch.get(m.id)!] : [] }))
    );
  }

  const hasGroupMatches = groupMatches.length > 0;
  const hasKnockoutMatches = knockoutMatches.length > 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Chaveamento</h1>
      <p className="text-zinc-400 mb-8 text-sm">Todos os jogos</p>

      {/* Fase de Grupos */}
      {hasGroupMatches && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <span>⚽</span> Fase de Grupos
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {GROUPS.map((group) => {
              const gm = groupMap.get(group) ?? [];
              if (gm.length === 0) return null;
              return (
                <div key={group} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">
                      {group}
                    </span>
                    <span className="text-white font-semibold text-sm">Grupo {group}</span>
                    <span className="text-zinc-500 text-xs ml-auto">{gm.length} jogos</span>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    {gm.map((m) => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        prediction={predByMatch.get(m.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mata-mata */}
      {hasKnockoutMatches && (
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <span>🏆</span> Mata-mata
          </h2>
          <div className="flex gap-6 overflow-x-auto pb-4">
            {KNOCKOUT_STAGES.map(({ stage, label }) => {
              const sm = stageMap.get(stage) ?? [];
              // Count expected matches per stage
              const expectedCounts: Partial<Record<MatchStage, number>> = {
                ROUND_OF_16: 8,
                QUARTER_FINAL: 4,
                SEMI_FINAL: 2,
                FINAL: 1,
              };
              const expected = expectedCounts[stage] ?? 0;
              const slots = Array.from({ length: expected }, (_, i) => sm[i]);

              return (
                <div key={stage} className="flex flex-col shrink-0" style={{ minWidth: 220 }}>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-3 text-center">{label}</h3>
                  <div className="flex flex-col gap-2 justify-around h-full">
                    {slots.map((match, i) =>
                      match ? (
                        <KnockoutSlot
                          key={match.id}
                          match={match}
                          prediction={predByMatch.get(match.id)}
                        />
                      ) : (
                        <TBDSlot key={i} />
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!hasGroupMatches && !hasKnockoutMatches && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-5xl mb-4">🏆</p>
          <p className="text-lg font-medium text-white">Nenhum jogo cadastrado ainda.</p>
          <p className="text-sm mt-2">O chaveamento aparecerá aqui quando os jogos forem importados.</p>
        </div>
      )}

      {hasGroupMatches && !hasKnockoutMatches && (
        <section className="mb-6">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <span>🏆</span> Mata-mata
          </h2>
          <div className="text-center text-zinc-500 py-12 bg-zinc-900 border border-zinc-800 rounded-xl">
            <p className="text-4xl mb-3">⏳</p>
            <p className="text-zinc-300 font-medium">Mata-mata ainda não definido</p>
            <p className="text-sm mt-2">As fases eliminatórias serão exibidas aqui após a fase de grupos.</p>
          </div>
        </section>
      )}
    </div>
  );
}

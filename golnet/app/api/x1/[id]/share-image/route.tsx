import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const RESULT_EMOJI: Record<string, string> = {
  EXACT_SCORE: "🎯",
  CORRECT_DIFF: "✅",
  CORRECT_WINNER: "✅",
  CORRECT_DRAW: "✅",
  WRONG: "❌",
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const duel = await prisma.duel.findUnique({
    where: { id: params.id },
    include: {
      creator:  { select: { name: true, username: true } },
      opponent: { select: { name: true, username: true } },
      winner:   { select: { id: true } },
      matches: {
        include: {
          match: {
            select: {
              homeTeam: true, awayTeam: true,
              homeScore: true, awayScore: true,
            },
          },
        },
        orderBy: { match: { startsAt: "asc" } },
      },
      predictions: true,
    },
  });

  if (!duel || duel.status !== "FINISHED") {
    return new Response("Not found", { status: 404 });
  }

  const sum = (uid: string) =>
    duel.predictions
      .filter((p) => p.userId === uid)
      .reduce((s, p) => s + p.points + p.bonusPoints, 0);

  const creatorScore  = sum(duel.creatorId);
  const opponentScore = duel.opponentId ? sum(duel.opponentId) : 0;
  const isDraw        = !duel.winnerId;
  const creatorWon    = duel.winnerId === duel.creatorId;

  const creatorName  = duel.creator.name  ?? duel.creator.username  ?? "Jogador 1";
  const opponentName = duel.opponent?.name ?? duel.opponent?.username ?? "Jogador 2";

  const matchRows = duel.matches.map((dm) => {
    const m = dm.match;
    const cp = duel.predictions.find((p) => p.matchId === dm.matchId && p.userId === duel.creatorId);
    const op = duel.predictions.find((p) => p.matchId === dm.matchId && p.userId === (duel.opponentId ?? ""));
    return { match: m, creatorPred: cp, opponentPred: op };
  });

  const W = 800;
  const H = 480 + matchRows.length * 118;

  const winColor  = "#4ade80";
  const loseColor = "#71717a";
  const drawColor = "#facc15";

  const creatorColor  = isDraw ? drawColor : creatorWon  ? winColor : loseColor;
  const opponentColor = isDraw ? drawColor : !creatorWon ? winColor : loseColor;

  const badge = (won: boolean) =>
    isDraw ? "EMPATE" : won ? "VENCEDOR" : "ELIMINADO";

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          backgroundColor: "#09090b",
          display: "flex",
          flexDirection: "column",
          padding: "36px",
          fontFamily: "sans-serif",
          color: "white",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>
              <span style={{ color: "#22c55e" }}>Palpita</span>
              <span style={{ color: "white" }}>Aí</span>
              <span style={{ color: "#71717a", fontSize: 18, fontWeight: 400, marginLeft: 10, marginTop: 6 }}>
                ⚔️ Duelo X1
              </span>
            </div>
          </div>
        </div>

        {/* Players banner */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#18181b",
            borderRadius: 16,
            padding: "24px 32px",
            marginBottom: "20px",
          }}
        >
          {/* Creator */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }}>
            <div style={{ fontSize: 19, fontWeight: "bold", color: "white" }}>{creatorName}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 52, fontWeight: 800, color: creatorColor, lineHeight: 1 }}>
                {creatorScore}
              </span>
              <span style={{ fontSize: 16, color: "#71717a" }}>pts</span>
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: "bold",
                letterSpacing: 2,
                color: creatorColor,
                backgroundColor: `${creatorColor}18`,
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              {isDraw ? "🤝" : creatorWon ? "🏆" : "💀"} {badge(creatorWon)}
            </div>
          </div>

          {/* VS */}
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#3f3f46",
              margin: "0 20px",
              display: "flex",
            }}
          >
            VS
          </div>

          {/* Opponent */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }}>
            <div style={{ fontSize: 19, fontWeight: "bold", color: "white" }}>{opponentName}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 52, fontWeight: 800, color: opponentColor, lineHeight: 1 }}>
                {opponentScore}
              </span>
              <span style={{ fontSize: 16, color: "#71717a" }}>pts</span>
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: "bold",
                letterSpacing: 2,
                color: opponentColor,
                backgroundColor: `${opponentColor}18`,
                padding: "4px 10px",
                borderRadius: 6,
              }}
            >
              {isDraw ? "🤝" : !creatorWon ? "🏆" : "💀"} {badge(!creatorWon)}
            </div>
          </div>
        </div>

        {/* Match rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {matchRows.map(({ match: m, creatorPred: cp, opponentPred: op }, i) => {
            const resultLabel =
              m.homeScore !== null && m.awayScore !== null
                ? `${m.homeScore} × ${m.awayScore}`
                : "? × ?";

            const cpPts = cp ? (cp.points + cp.bonusPoints) : null;
            const opPts = op ? (op.points + op.bonusPoints) : null;

            return (
              <div
                key={i}
                style={{
                  backgroundColor: "#18181b",
                  borderRadius: 12,
                  padding: "14px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {/* Match name + result */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 14,
                  }}
                >
                  <span style={{ color: "#d4d4d8", fontWeight: "bold" }}>{m.homeTeam}</span>
                  <span
                    style={{
                      backgroundColor: "#27272a",
                      color: "white",
                      fontWeight: 800,
                      fontSize: 16,
                      padding: "3px 14px",
                      borderRadius: 8,
                    }}
                  >
                    {resultLabel}
                  </span>
                  <span style={{ color: "#d4d4d8", fontWeight: "bold" }}>{m.awayTeam}</span>
                </div>

                {/* Predictions row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {/* Creator pred */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-start" }}>
                    <span style={{ fontSize: 12, color: "#71717a" }}>{creatorName.split(" ")[0]}:</span>
                    <span style={{ fontSize: 16, fontWeight: "bold", color: "#a1a1aa" }}>
                      {cp ? `${cp.homeScore}×${cp.awayScore}` : "—"}
                    </span>
                    {cp && (
                      <span style={{ fontSize: 13 }}>
                        {RESULT_EMOJI[cp.result ?? ""] ?? "—"}
                      </span>
                    )}
                    {cpPts !== null && (
                      <span style={{ fontSize: 12, color: cpPts > 0 ? "#4ade80" : "#ef4444", fontWeight: "bold" }}>
                        {cpPts > 0 ? `+${cpPts}` : "0"}pts
                      </span>
                    )}
                  </div>

                  <div style={{ width: 1, backgroundColor: "#27272a", height: 24, margin: "0 12px", display: "flex" }} />

                  {/* Opponent pred */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
                    {opPts !== null && (
                      <span style={{ fontSize: 12, color: opPts > 0 ? "#4ade80" : "#ef4444", fontWeight: "bold" }}>
                        {opPts > 0 ? `+${opPts}` : "0"}pts
                      </span>
                    )}
                    {op && (
                      <span style={{ fontSize: 13 }}>
                        {RESULT_EMOJI[op.result ?? ""] ?? "—"}
                      </span>
                    )}
                    <span style={{ fontSize: 16, fontWeight: "bold", color: "#a1a1aa" }}>
                      {op ? `${op.homeScore}×${op.awayScore}` : "—"}
                    </span>
                    <span style={{ fontSize: 12, color: "#71717a" }}>{opponentName.split(" ")[0]}:</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "auto",
            paddingTop: 20,
            color: "#3f3f46",
            fontSize: 13,
          }}
        >
          palpitaai.vercel.app
        </div>
      </div>
    ),
    { width: W, height: H }
  );
}

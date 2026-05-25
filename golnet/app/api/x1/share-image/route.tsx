import { ImageResponse } from "next/og";

export const runtime = "edge";

// Data shape encoded as base64url in ?d= query param
interface ShareData {
  p1: string;          // creator name
  p2: string;          // opponent name
  s1: number;          // creator score
  s2: number;          // opponent score
  w: 0 | 1 | 2;       // 0=draw, 1=creator won, 2=opponent won
  m: Array<{
    ht: string;                        // homeTeam
    at: string;                        // awayTeam
    rh: number | null;                 // real homeScore
    ra: number | null;                 // real awayScore
    p1: [number, number, number, string | null];  // [pred_h, pred_a, pts, result]
    p2: [number, number, number, string | null];
  }>;
}

const RESULT_EMOJI: Record<string, string> = {
  EXACT_SCORE: "🎯",
  CORRECT_DIFF: "✅",
  CORRECT_WINNER: "✅",
  CORRECT_DRAW: "✅",
  WRONG: "❌",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("d");
  if (!raw) return new Response("Missing data", { status: 400 });

  let data: ShareData;
  try {
    data = JSON.parse(atob(raw));
  } catch {
    return new Response("Invalid data", { status: 400 });
  }

  const { p1, p2, s1, s2, w, m } = data;
  const isDraw    = w === 0;
  const creatorWon = w === 1;

  const winColor  = "#4ade80";
  const loseColor = "#52525b";
  const drawColor = "#facc15";

  const c1Color = isDraw ? drawColor : creatorWon  ? winColor : loseColor;
  const c2Color = isDraw ? drawColor : !creatorWon ? winColor : loseColor;

  const W = 800;
  const H = 460 + m.length * 120;

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
          gap: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 800 }}>
              <span style={{ color: "#22c55e" }}>Palpita</span>
              <span style={{ color: "white" }}>Aí</span>
            </div>
            <span style={{ color: "#52525b", fontSize: 18 }}>·</span>
            <span style={{ color: "#71717a", fontSize: 17 }}>⚔️ Duelo X1</span>
          </div>
        </div>

        {/* Players */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#18181b",
            borderRadius: 16,
            padding: "22px 32px",
            marginBottom: 18,
          }}
        >
          {/* Player 1 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: "bold", color: "white" }}>{p1}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 50, fontWeight: 800, color: c1Color, lineHeight: "1" }}>{s1}</span>
              <span style={{ fontSize: 15, color: "#71717a" }}>pts</span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 11,
                fontWeight: "bold",
                letterSpacing: 2,
                color: c1Color,
                backgroundColor: isDraw ? "#facc1520" : creatorWon ? "#4ade8020" : "#52525b20",
                padding: "3px 10px",
                borderRadius: 6,
              }}
            >
              {isDraw ? "🤝 EMPATE" : creatorWon ? "🏆 VENCEDOR" : "💀 ELIMINADO"}
            </div>
          </div>

          {/* VS */}
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: "#27272a", margin: "0 16px" }}>VS</div>

          {/* Player 2 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: "bold", color: "white" }}>{p2}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 50, fontWeight: 800, color: c2Color, lineHeight: "1" }}>{s2}</span>
              <span style={{ fontSize: 15, color: "#71717a" }}>pts</span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 11,
                fontWeight: "bold",
                letterSpacing: 2,
                color: c2Color,
                backgroundColor: isDraw ? "#facc1520" : !creatorWon ? "#4ade8020" : "#52525b20",
                padding: "3px 10px",
                borderRadius: 6,
              }}
            >
              {isDraw ? "🤝 EMPATE" : !creatorWon ? "🏆 VENCEDOR" : "💀 ELIMINADO"}
            </div>
          </div>
        </div>

        {/* Matches */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {m.map((row, i) => {
            const [p1h, p1a, p1pts, p1r] = row.p1;
            const [p2h, p2a, p2pts, p2r] = row.p2;
            const scoreLabel =
              row.rh !== null && row.ra !== null
                ? `${row.rh} × ${row.ra}`
                : "? × ?";

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  backgroundColor: "#18181b",
                  borderRadius: 12,
                  padding: "14px 20px",
                  gap: 10,
                }}
              >
                {/* Teams + score */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: "bold", color: "#d4d4d8" }}>{row.ht}</span>
                  <div
                    style={{
                      display: "flex",
                      backgroundColor: "#27272a",
                      borderRadius: 8,
                      padding: "3px 14px",
                      fontSize: 16,
                      fontWeight: 800,
                      color: "white",
                    }}
                  >
                    {scoreLabel}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: "bold", color: "#d4d4d8" }}>{row.at}</span>
                </div>

                {/* Predictions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {/* P1 pred */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                    <span style={{ fontSize: 12, color: "#71717a" }}>{p1.split(" ")[0]}:</span>
                    <span style={{ fontSize: 16, fontWeight: "bold", color: "#a1a1aa" }}>{p1h}×{p1a}</span>
                    <span style={{ fontSize: 14 }}>{p1r ? (RESULT_EMOJI[p1r] ?? "—") : "—"}</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: "bold",
                        color: p1pts > 0 ? "#4ade80" : "#71717a",
                      }}
                    >
                      {p1pts > 0 ? `+${p1pts}` : "0"}pts
                    </span>
                  </div>

                  {/* Divider */}
                  <div style={{ display: "flex", width: 1, height: 22, backgroundColor: "#27272a", margin: "0 12px" }} />

                  {/* P2 pred (right-aligned) */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: "bold",
                        color: p2pts > 0 ? "#4ade80" : "#71717a",
                      }}
                    >
                      {p2pts > 0 ? `+${p2pts}` : "0"}pts
                    </span>
                    <span style={{ fontSize: 14 }}>{p2r ? (RESULT_EMOJI[p2r] ?? "—") : "—"}</span>
                    <span style={{ fontSize: 16, fontWeight: "bold", color: "#a1a1aa" }}>{p2h}×{p2a}</span>
                    <span style={{ fontSize: 12, color: "#71717a" }}>{p2.split(" ")[0]}:</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 22, color: "#3f3f46", fontSize: 13 }}>
          palpitaai.vercel.app
        </div>
      </div>
    ),
    { width: W, height: H }
  );
}

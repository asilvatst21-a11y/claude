import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#09090b",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        {/* Green glow */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
          }}
        />

        {/* Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "9999px",
            padding: "8px 20px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#22c55e",
              display: "flex",
            }}
          />
          <span style={{ color: "#4ade80", fontSize: "20px", fontWeight: 600 }}>
            Copa do Mundo 2026
          </span>
        </div>

        {/* Logo */}
        <div style={{ display: "flex", fontSize: "96px", fontWeight: 800, letterSpacing: "-2px" }}>
          <span style={{ color: "#22c55e" }}>Palpita</span>
          <span style={{ color: "#ffffff" }}>Aí</span>
        </div>

        {/* Tagline */}
        <p
          style={{
            color: "#a1a1aa",
            fontSize: "28px",
            marginTop: "16px",
            textAlign: "center",
            maxWidth: "700px",
          }}
        >
          Faça seus palpites, crie ligas e dispute com amigos
        </p>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "48px", marginTop: "48px" }}>
          {[
            { icon: "⚽", label: "Palpites" },
            { icon: "🏆", label: "Ligas" },
            { icon: "🎯", label: "Placares exatos" },
          ].map(({ icon, label }) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span style={{ fontSize: "36px" }}>{icon}</span>
              <span style={{ color: "#71717a", fontSize: "18px" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}

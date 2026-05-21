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

        {/* Logo */}
        <div style={{ display: "flex", fontSize: "96px", fontWeight: 800, letterSpacing: "-2px", marginBottom: "16px" }}>
          <span style={{ color: "#22c55e" }}>Palpita</span>
          <span style={{ color: "#ffffff" }}>Aí</span>
        </div>

        {/* Tagline */}
        <p
          style={{
            color: "#a1a1aa",
            fontSize: "28px",
            textAlign: "center",
            maxWidth: "700px",
            margin: "0",
          }}
        >
          Seu bolão de palpites favorito
        </p>

        <p
          style={{
            color: "#52525b",
            fontSize: "20px",
            textAlign: "center",
            maxWidth: "600px",
            marginTop: "12px",
          }}
        >
          Crie ligas, convide amigos e dispute o ranking em tempo real
        </p>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "48px", marginTop: "48px" }}>
          {[
            { icon: "🎯", label: "Palpites" },
            { icon: "🏆", label: "Ligas" },
            { icon: "📊", label: "Rankings" },
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

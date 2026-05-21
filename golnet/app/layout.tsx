import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = "https://claude-one-peach.vercel.app";

export const metadata: Metadata = {
  title: "PalpitaAí — Bolão da Copa do Mundo 2026",
  description: "Faça seus palpites, crie ligas e dispute com amigos na Copa do Mundo 2026. Ranking em tempo real, H2H e muito mais.",
  manifest: "/manifest.json",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: "PalpitaAí — Bolão da Copa do Mundo 2026",
    description: "Faça seus palpites, crie ligas e dispute com amigos na Copa do Mundo 2026.",
    url: BASE_URL,
    siteName: "PalpitaAí",
    type: "website",
    locale: "pt_BR",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "PalpitaAí — Bolão da Copa do Mundo 2026",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PalpitaAí — Bolão da Copa do Mundo 2026",
    description: "Faça seus palpites, crie ligas e dispute com amigos na Copa do Mundo 2026.",
    images: ["/api/og"],
  },
  keywords: ["bolão", "copa do mundo", "2026", "palpites", "futebol", "liga"],
};

export const viewport: Viewport = {
  themeColor: "#22c55e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-zinc-950 text-white antialiased`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

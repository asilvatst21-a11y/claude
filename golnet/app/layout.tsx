import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const BASE_URL = "https://palpitai.vercel.app";

export const metadata: Metadata = {
  title: "PalpitaAí — Bolão de Palpites",
  description: "Crie ligas, faça palpites e dispute com amigos em tempo real. O seu bolão favorito.",
  manifest: "/manifest.json",
  metadataBase: new URL(BASE_URL),
  openGraph: {
    title: "PalpitaAí — Bolão de Palpites",
    description: "Crie ligas, faça palpites e dispute com amigos em tempo real.",
    url: BASE_URL,
    siteName: "PalpitaAí",
    type: "website",
    locale: "pt_BR",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "PalpitaAí — Bolão de Palpites",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PalpitaAí — Bolão de Palpites",
    description: "Crie ligas, faça palpites e dispute com amigos em tempo real.",
    images: ["/api/og"],
  },
  keywords: ["bolão", "palpites", "ligas", "ranking", "futebol", "esportes"],
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

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GolNet — Bolão da Copa do Mundo",
  description: "Faça seus palpites, crie ligas e dispute com amigos na Copa do Mundo 2026.",
  manifest: "/manifest.json",
  openGraph: {
    title: "GolNet — Bolão da Copa",
    description: "O melhor bolão da Copa do Mundo 2026.",
    type: "website",
  },
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

import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-6xl font-bold text-white mb-4">
          <span className="text-green-400">Palpita</span>Aí
        </h1>
        <p className="text-xl text-zinc-400 mb-2">
          O bolão oficial da Copa do Mundo 2026
        </p>
        <p className="text-zinc-500 mb-10">
          Palpite nos jogos, crie ligas com amigos e suba no ranking.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors"
          >
            Começar agora
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors"
          >
            Entrar
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 text-left">
          {[
            { icon: "⚽", title: "Palpite nos jogos", desc: "Placar exato rende 10 pontos + bônus no mata-mata" },
            { icon: "🏆", title: "Crie sua liga", desc: "Convide amigos com código exclusivo e dispute o título" },
            { icon: "📊", title: "Ranking em tempo real", desc: "Acompanhe sua posição atualizada após cada jogo" },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-semibold text-white mb-1">{title}</h3>
              <p className="text-sm text-zinc-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

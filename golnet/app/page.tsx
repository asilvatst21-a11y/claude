import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-20">
        <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight mb-4">
          <span className="text-green-400">Palpita</span>Aí
        </h1>

        <p className="text-xl sm:text-2xl text-zinc-300 font-medium mb-4">
          Seu bolão de palpites favorito
        </p>

        <p className="text-zinc-500 max-w-xl mb-10 text-lg">
          Faça seus palpites, dispute com amigos e acompanhe o ranking em tempo real
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="px-8 py-3.5 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-xl transition-colors text-base shadow-lg shadow-green-500/20"
          >
            Criar conta grátis
          </Link>
          <Link
            href="/login"
            className="px-8 py-3.5 bg-transparent border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-semibold rounded-xl transition-colors text-base"
          >
            Fazer login
          </Link>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section className="px-6 pb-20 max-w-5xl mx-auto">
        <h2 className="text-center text-2xl font-bold text-white mb-10">
          Tudo que você precisa para o bolão perfeito
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              icon: "⚽",
              title: "Palpites em tempo real",
              desc: "Faça seus palpites antes de cada jogo e acompanhe o placar ao vivo",
            },
            {
              icon: "🏆",
              title: "Crie sua liga",
              desc: "Monte seu grupo de amigos ou colegas de trabalho e dispute o título",
            },
            {
              icon: "📊",
              title: "Ranking detalhado",
              desc: "Veja quem está na frente e acompanhe sua evolução rodada a rodada",
            },
          ].map(({ icon, title, desc }) => (
            <div
              key={title}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-6 transition-colors"
            >
              <div className="text-4xl mb-4">{icon}</div>
              <h3 className="font-semibold text-white text-lg mb-2">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section className="px-6 pb-20 max-w-3xl mx-auto">
        <h2 className="text-center text-2xl font-bold text-white mb-10">
          Como funciona
        </h2>
        <div className="flex flex-col gap-4">
          {[
            { step: 1, text: "Crie sua conta grátis" },
            { step: 2, text: "Entre ou crie uma liga" },
            { step: 3, text: "Faça seus palpites antes do jogo" },
            { step: 4, text: "Acompanhe os pontos em tempo real" },
          ].map(({ step, text }) => (
            <div
              key={step}
              className="flex items-center gap-5 bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-4"
            >
              <span className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400 font-bold text-lg shrink-0">
                {step}
              </span>
              <p className="text-white font-medium">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Plans teaser ─────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 max-w-5xl mx-auto">
        <h2 className="text-center text-2xl font-bold text-white mb-2">
          Planos para todo mundo
        </h2>
        <p className="text-center text-zinc-500 mb-10">
          Comece de graça e faça upgrade quando quiser
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {[
            {
              name: "Free",
              price: "R$&nbsp;0",
              period: "/sempre",
              desc: "Palpites ilimitados e acesso ao ranking básico",
              highlight: false,
            },
            {
              name: "Pro",
              price: "R$&nbsp;14,90",
              period: "/mês",
              desc: "H2H, rankings por rodada e estatísticas avançadas",
              highlight: true,
            },
            {
              name: "Empresarial",
              price: "R$&nbsp;49,90",
              period: "/mês",
              desc: "Ligas privadas ilimitadas e painel administrativo",
              highlight: false,
            },
          ].map(({ name, price, period, desc, highlight }) => (
            <div
              key={name}
              className={`rounded-2xl p-6 border ${
                highlight
                  ? "bg-green-500/10 border-green-500/40 ring-1 ring-green-500/30"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              {highlight && (
                <span className="inline-block text-xs font-semibold text-green-400 bg-green-500/20 rounded-full px-3 py-0.5 mb-3">
                  Mais popular
                </span>
              )}
              <h3 className="font-bold text-white text-xl mb-1">{name}</h3>
              <p className="text-2xl font-extrabold text-white mb-0.5">
                <span dangerouslySetInnerHTML={{ __html: price }} />
                <span className="text-sm font-normal text-zinc-500">{period}</span>
              </p>
              <p className="text-sm text-zinc-400 mt-3">{desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            href="/pricing"
            className="inline-block px-6 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-semibold rounded-xl transition-colors"
          >
            Ver todos os planos
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800 py-8 text-center text-zinc-500 text-sm">
        &copy; 2026 PalpitaAí &mdash; Feito com ❤️ para quem ama um bolão
      </footer>
    </main>
  );
}

export const metadata = { title: "Regras — PalpitaAí" };

const rules = [
  {
    title: "Como funciona",
    content:
      "Você palpita no placar exato de cada jogo da Copa. Seus pontos são calculados automaticamente após cada partida encerrada.",
  },
  {
    title: "Prazo dos palpites",
    content:
      "Os palpites podem ser feitos ou editados até 5 minutos antes do início de cada jogo. Após isso, o palpite fica bloqueado (ícone de cadeado).",
  },
  {
    title: "Sistema de pontuação",
    items: [
      { pts: "10 pts", desc: "Placar exato (ex: palpitou 2×1 e foi 2×1)" },
      { pts: "7 pts", desc: "Resultado correto + mesmo saldo de gols (ex: palpitou 2×0, foi 3×1 — ambos por 2)" },
      { pts: "5 pts", desc: "Acertou só o vencedor (ex: palpitou 2×0, foi 1×0)" },
      { pts: "4 pts", desc: "Acertou empate sem placar exato (ex: palpitou 2×2, foi 1×1)" },
      { pts: "+3 pts", desc: "Bônus para qualquer acerto em jogos eliminatórios (oitavas, quartas, semi e final)" },
      { pts: "0 pts", desc: "Nenhum acerto" },
    ],
  },
  {
    title: "Ligas",
    content:
      "Você pode criar ligas públicas ou privadas e convidar amigos com um código único. Em cada liga há um ranking interno com a pontuação de todos os membros.",
  },
  {
    title: "Conquistas",
    content:
      "Desbloqueie badges ao atingir metas: 3 placares exatos, campeão de liga, rodada perfeita e muito mais.",
  },
];

export default function RulesPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-2">Regras do bolão</h1>
      <p className="text-zinc-400 mb-8">Tudo que você precisa saber para jogar no PalpitaAí.</p>

      <div className="flex flex-col gap-6">
        {rules.map((section) => (
          <div key={section.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="font-semibold text-white mb-3">{section.title}</h2>
            {section.content && <p className="text-sm text-zinc-400 leading-relaxed">{section.content}</p>}
            {section.items && (
              <div className="flex flex-col gap-2 mt-1">
                {section.items.map(({ pts, desc }) => (
                  <div key={pts} className="flex items-start gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
                    <span className="font-bold text-green-400 w-12 shrink-0 text-sm">{pts}</span>
                    <span className="text-sm text-zinc-300">{desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

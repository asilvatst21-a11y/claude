import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MatchCard } from "@/components/predictions/match-card";

export const metadata = { title: "Palpites — GolNet" };

export default async function PredictionsPage() {
  const session = await auth();

  const matches = await prisma.match.findMany({
    include: {
      predictions: { where: { userId: session?.user?.id ?? "" }, take: 1 },
    },
    orderBy: { startsAt: "asc" },
  });

  const upcoming = matches.filter((m) => m.status === "SCHEDULED" || m.status === "LIVE");
  const finished = matches.filter((m) => m.status === "FINISHED");

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Palpites</h1>

      {upcoming.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            Próximos jogos ({upcoming.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">
            Jogos encerrados ({finished.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {finished.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {matches.length === 0 && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">⚽</p>
          <p className="text-lg">Nenhum jogo cadastrado ainda.</p>
          <p className="text-sm mt-2">Os jogos aparecerão aqui quando forem importados.</p>
        </div>
      )}
    </div>
  );
}

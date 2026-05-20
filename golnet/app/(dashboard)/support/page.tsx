import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SupportForm } from "@/components/support/support-form";

export const metadata = { title: "Suporte — GolNet" };

export default async function SupportPage() {
  const session = await auth();

  const tickets = session?.user?.id
    ? await prisma.supportTicket.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Suporte</h1>
        <p className="text-zinc-400 text-sm">
          Tem alguma dúvida ou problema? Entre em contato com nossa equipe.
        </p>
      </div>

      <SupportForm />

      {tickets.length > 0 && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Seus chamados</h2>
          <ul className="space-y-3">
            {tickets.map((ticket) => (
              <li
                key={ticket.id}
                className="flex items-start justify-between bg-zinc-800 rounded-lg px-4 py-3 gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{ticket.subject}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    ticket.status === "OPEN"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : ticket.status === "IN_PROGRESS"
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-green-500/20 text-green-400"
                  }`}
                >
                  {ticket.status === "OPEN"
                    ? "Aberto"
                    : ticket.status === "IN_PROGRESS"
                    ? "Em andamento"
                    : "Resolvido"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

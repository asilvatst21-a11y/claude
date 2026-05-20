import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = { title: "Planos — PalpitaAí" };

const plans = [
  {
    key: "FREE",
    name: "Free",
    price: "R$ 0",
    period: "para sempre",
    description: "Comece a jogar sem pagar nada",
    borderColor: "border-zinc-700",
    headerBg: "bg-zinc-800",
    badge: null,
    features: [
      { label: "Até 2 ligas", ok: true },
      { label: "Criar 1 liga (máx. 10 membros)", ok: true },
      { label: "3 conquistas básicas", ok: true },
      { label: "Anúncios exibidos", ok: false },
      { label: "Estatísticas H2H", ok: false },
      { label: "Ranking por rodada", ok: false },
      { label: "Todas as conquistas", ok: false },
      { label: "Badge exclusivo", ok: false },
    ],
    cta: "Plano atual",
    ctaHref: null,
    planKey: "FREE",
  },
  {
    key: "PRO",
    name: "Pro",
    price: "R$ 5,99",
    period: "/mês",
    description: "Para quem leva o bolão a sério",
    borderColor: "border-green-500",
    headerBg: "bg-green-500/10",
    badge: "Mais popular",
    badgeColor: "bg-green-500",
    features: [
      { label: "Ligas ilimitadas", ok: true },
      { label: "Criação ilimitada de ligas", ok: true },
      { label: "Membros ilimitados por liga", ok: true },
      { label: "Todas as conquistas", ok: true },
      { label: "Estatísticas H2H", ok: true },
      { label: "Ranking por rodada", ok: true },
      { label: "Badge Pro ⭐", ok: true },
      { label: "Sem anúncios", ok: true },
    ],
    cta: "Assinar Pro",
    ctaHref: "/api/stripe/checkout?plan=pro",
    planKey: "PRO",
  },
  {
    key: "ENTERPRISE",
    name: "Empresarial",
    price: "R$ 49,99",
    period: "/mês",
    description: "Para empresas e grandes comunidades",
    borderColor: "border-purple-500",
    headerBg: "bg-purple-500/10",
    badge: "Empresas",
    badgeColor: "bg-purple-500",
    features: [
      { label: "Tudo do plano Pro", ok: true },
      { label: "Até 500 membros por liga", ok: true },
      { label: "Logo da empresa na liga", ok: true },
      { label: "Badge Empresarial 🏢", ok: true },
      { label: "Suporte prioritário", ok: true },
      { label: "Painel de administração", ok: true },
    ],
    cta: "Assinar Empresarial",
    ctaHref: "/api/stripe/checkout?plan=enterprise",
    planKey: "ENTERPRISE",
  },
];

export default async function PricingPage() {
  const session = await auth();
  let userPlan = "FREE";

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    userPlan = user?.plan ?? "FREE";
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-white mb-3">Escolha seu plano</h1>
        <p className="text-zinc-400 text-lg">
          Desbloqueie recursos avançados e leve sua experiência ao próximo nível
        </p>
        {userPlan !== "FREE" && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full">
            <span className="text-green-400 text-sm font-medium">
              Plano atual: {userPlan === "PRO" ? "Pro ⭐" : "Empresarial 🏢"}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = userPlan === plan.planKey;

          return (
            <div
              key={plan.key}
              className={`relative flex flex-col bg-zinc-900 border-2 ${plan.borderColor} rounded-2xl overflow-hidden ${
                isCurrent ? "ring-2 ring-offset-2 ring-offset-zinc-950 ring-green-500/50" : ""
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute top-4 right-4">
                  <span
                    className={`${plan.badgeColor} text-white text-xs font-semibold px-2.5 py-1 rounded-full`}
                  >
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Header */}
              <div className={`${plan.headerBg} px-6 py-6 border-b border-zinc-800`}>
                <h2 className="text-xl font-bold text-white mb-1">{plan.name}</h2>
                <p className="text-zinc-400 text-sm mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-zinc-400 text-sm">{plan.period}</span>
                </div>
              </div>

              {/* Features */}
              <div className="flex-1 px-6 py-6">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature.label} className="flex items-start gap-3">
                      <span className="mt-0.5 text-base">
                        {feature.ok ? "✅" : "❌"}
                      </span>
                      <span
                        className={`text-sm ${
                          feature.ok ? "text-zinc-200" : "text-zinc-500"
                        }`}
                      >
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="px-6 pb-6">
                {isCurrent ? (
                  <div className="w-full text-center py-2.5 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold">
                    ✓ Seu plano atual
                  </div>
                ) : plan.ctaHref ? (
                  <Link
                    href={plan.ctaHref}
                    className={`w-full block text-center py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      plan.key === "PRO"
                        ? "bg-green-600 hover:bg-green-500 text-white"
                        : "bg-purple-600 hover:bg-purple-500 text-white"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <div className="w-full text-center py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-semibold">
                    {plan.cta}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQ / Note */}
      <div className="mt-10 bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
        <p className="text-zinc-400 text-sm">
          Tem dúvidas sobre os planos?{" "}
          <Link href="/support" className="text-green-400 hover:text-green-300 underline">
            Fale com nosso suporte
          </Link>
          . Pagamentos processados com segurança via Stripe.
        </p>
      </div>
    </div>
  );
}

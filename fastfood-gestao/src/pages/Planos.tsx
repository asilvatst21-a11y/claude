import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, MessageCircle, ChevronDown, UtensilsCrossed } from 'lucide-react'

const WHATSAPP_MSG = encodeURIComponent('Olá, tenho interesse no plano Rede do FastFood Gestão')
const WHATSAPP_URL = `https://wa.me/5522997457197?text=${WHATSAPP_MSG}`

const MP_STARTER = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=59ecf64a203546d09535317d47a5e4ae'
const MP_PRO     = 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=ffb6736c2a1d48ba8c55ad93deb4f777'

const benefits = [
  'Cada venda abate o estoque automaticamente — sem planilha, sem surpresa',
  'DRE protegido por senha: só você vê o financeiro do seu negócio',
  'Funciona em qualquer celular ou computador, sem instalar nada',
  'Dados do seu estabelecimento isolados — nenhum outro acesso ao que é seu',
]

const plans = [
  {
    name: 'Starter',
    price: 'R$97',
    period: '/mês',
    badge: null,
    tagline: 'Para quem está começando a ter controle de verdade',
    desc: 'Chega de anotação no papel e planilha desatualizada. Registre cada venda, acompanhe o estoque em tempo real e saiba exatamente quanto entrou no caixa — tudo protegido com senha só sua.',
    audience: 'Ideal para lanchonetes, trailers e estabelecimentos com 1 ponto de venda.',
    items: [
      'PDV completo',
      'Controle de estoque',
      'DRE com proteção por senha',
      'Suporte por e-mail (resposta em até 24h)',
    ],
    cta: 'Quero começar →',
    ctaHref: MP_STARTER,
    footnote: '7 dias grátis. Sem cartão.',
    highlight: false,
  },
  {
    name: 'Pro',
    price: 'R$197',
    period: '/mês',
    badge: '⭐ Mais escolhido por quem tem mais de 1 filial',
    tagline: 'Para quem já vende bem e quer escalar sem perder o controle',
    desc: 'Gerencie até 3 filiais, distribua acesso entre operadores sem expor o financeiro, lance despesas variáveis direto no DRE e tenha visão real do lucro por unidade.',
    audience: 'Ideal para hamburguerias, pizzarias e redes pequenas em expansão.',
    items: [
      'Tudo do Starter',
      'Até 3 filiais',
      'Múltiplos operadores',
      'Despesas variáveis (luz, água, gás)',
      'Relatórios avançados',
      'Suporte prioritário',
    ],
    cta: 'Escolher o Pro →',
    ctaHref: MP_PRO,
    footnote: null,
    highlight: true,
  },
  {
    name: 'Rede',
    price: 'R$397',
    period: '/mês',
    badge: null,
    tagline: 'Para quem gerencia múltiplas unidades e precisa de visão centralizada',
    desc: 'Todas as filiais em um dashboard consolidado. Acompanhe o desempenho de cada unidade e conte com onboarding dedicado para colocar toda a equipe no ritmo.',
    audience: 'Ideal para redes de franquias, dark kitchens e grupos com operação distribuída.',
    items: [
      'Tudo do Pro',
      'Filiais ilimitadas',
      'Dashboard consolidado',
      'Onboarding dedicado',
      'Canal de suporte exclusivo',
    ],
    cta: 'Falar com vendas →',
    ctaHref: WHATSAPP_URL,
    footnote: 'Resposta em até 2 horas no horário comercial.',
    highlight: false,
  },
]

const faqs = [
  {
    q: 'Preciso instalar alguma coisa no computador?',
    a: 'Não. O FastFood Gestão é 100% web — abre no navegador de qualquer computador, tablet ou celular. Sem download, sem atualização manual, sem técnico de TI.',
  },
  {
    q: 'Meus dados ficam seguros? Um concorrente pode ver minha movimentação?',
    a: 'Impossível. Cada estabelecimento tem os dados completamente isolados. O DRE ainda tem camada extra de proteção por senha, exigida a cada acesso.',
  },
  {
    q: 'E se um funcionário tentar acessar o DRE?',
    a: 'Operadores só acessam o PDV e o estoque. O DRE é protegido por senha exclusiva do administrador — reset só funciona via e-mail do dono da conta.',
  },
  {
    q: 'Posso testar antes de pagar?',
    a: 'Sim. São 7 dias grátis, sem precisar cadastrar cartão. Sistema completo, sem limitação.',
  },
  {
    q: 'Se eu cancelar, perco meus dados?',
    a: 'Seus dados ficam disponíveis por 30 dias após o cancelamento para exportar. Sem pegadinha.',
  },
  {
    q: 'Funciona para mais de um ponto de venda?',
    a: 'Sim. Plano Pro suporta até 3 filiais, plano Rede é ilimitado. Cada unidade com dados próprios, visão centralizada para o dono.',
  },
  {
    q: 'O sistema é difícil de usar? Minha equipe vai conseguir operar?',
    a: 'Foi pensado para operador de caixa. Tela do PDV simples, com modo tela cheia. A maioria aprende em menos de 15 minutos.',
  },
  {
    q: 'Como funciona o suporte?',
    a: 'Starter: e-mail, resposta em até 24h. Pro: atendimento prioritário. Rede: canal dedicado, resposta em até 2h no horário comercial.',
  },
  {
    q: 'Posso mudar de plano depois?',
    a: 'Sim, a qualquer momento. Upgrade sem burocracia e sem perder dados.',
  },
  {
    q: 'Aceita PIX e boleto?',
    a: 'Sim. PIX, boleto e cartão de crédito em até 12x.',
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-semibold text-white">{q}</span>
        <ChevronDown
          size={16}
          className="shrink-0 transition-transform duration-200"
          style={{ color: '#F5C542', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {open && (
        <p className="pb-4 text-sm text-gray-400 leading-relaxed">{a}</p>
      )}
    </div>
  )
}

function PlanCard({ plan }: { plan: typeof plans[0] }) {
  const btn = plan.ctaHref.startsWith('https://wa.me') ? (
    <a
      href={plan.ctaHref}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors"
      style={plan.highlight ? { background: '#F5C542', color: '#0F0F0F' } : { border: '2px solid #F5C542', color: '#F5C542' }}
    >
      <MessageCircle size={14} /> {plan.cta}
    </a>
  ) : (
    <a
      href={plan.ctaHref}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 w-full flex items-center justify-center py-3 rounded-xl font-bold text-sm transition-colors"
      style={plan.highlight ? { background: '#F5C542', color: '#0F0F0F' } : { border: '2px solid #F5C542', color: '#F5C542' }}
    >
      {plan.cta}
    </a>
  )

  return (
    <div
      className="relative flex flex-col rounded-2xl p-6"
      style={
        plan.highlight
          ? { background: '#1a1a1a', border: '2px solid #F5C542', boxShadow: '0 0 40px rgba(245,197,66,0.15)' }
          : { background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)' }
      }
    >
      {plan.badge && (
        <span
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-black px-4 py-1 rounded-full whitespace-nowrap"
          style={{ background: '#F5C542', color: '#0F0F0F' }}
        >
          {plan.badge}
        </span>
      )}

      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#F5C542' }}>{plan.name}</p>
      <p className="text-4xl font-black text-white mb-0.5">{plan.price}<span className="text-base font-normal text-gray-400">{plan.period}</span></p>
      <p className="text-xs text-gray-400 mb-3 italic">{plan.tagline}</p>
      <p className="text-xs text-gray-400 leading-relaxed mb-2">{plan.desc}</p>
      <p className="text-xs font-semibold mb-4" style={{ color: '#F5C542' }}>{plan.audience}</p>

      <div className="h-px mb-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

      <ul className="space-y-2.5 flex-1">
        {plan.items.map(item => (
          <li key={item} className="flex items-start gap-2">
            <Check size={14} className="mt-0.5 shrink-0" style={{ color: '#F5C542' }} />
            <span className="text-sm text-gray-300">{item}</span>
          </li>
        ))}
      </ul>

      {btn}

      {plan.footnote && (
        <p className="mt-3 text-center text-xs text-gray-500">{plan.footnote}</p>
      )}
    </div>
  )
}

export default function Planos() {
  return (
    <div className="min-h-screen" style={{ background: '#0F0F0F' }}>

      {/* Barra de acesso */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <UtensilsCrossed size={16} style={{ color: '#F5C542' }} />
            <span className="text-sm font-bold">FastFood Gestão</span>
          </div>
          <Link
            to="/login"
            className="text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
            style={{ color: '#F5C542', border: '1px solid rgba(245,197,66,0.3)' }}
          >
            Entrar →
          </Link>
        </div>
      </div>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div
          className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full mb-8 uppercase tracking-widest"
          style={{ background: 'rgba(245,197,66,0.1)', border: '1px solid rgba(245,197,66,0.2)', color: '#F5C542' }}
        >
          <UtensilsCrossed size={11} /> Sistema de Gestão para Fastfood
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mb-5">
          Seu fastfood no controle.<br />
          <span style={{ color: '#F5C542' }}>Do pedido ao lucro</span>, em um só sistema.
        </h1>

        <p className="text-gray-400 text-base max-w-xl mx-auto mb-10">
          PDV, estoque e DRE integrados — com segurança de dados real e interface que qualquer operador aprende em minutos.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-14">
          <Link
            to="/cadastro"
            className="font-bold px-7 py-3.5 rounded-xl text-sm transition-colors"
            style={{ background: '#F5C542', color: '#0F0F0F' }}
          >
            Teste grátis por 7 dias — sem cartão de crédito
          </Link>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 font-semibold px-7 py-3.5 rounded-xl text-sm transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#ccc' }}
          >
            <MessageCircle size={15} /> Ver demonstração em vídeo
          </a>
        </div>

        {/* Benefícios */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-2xl mx-auto">
          {benefits.map(b => (
            <div key={b} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 font-black text-sm" style={{ color: '#F5C542' }}>✦</span>
              <span className="text-sm text-gray-400">{b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#111' }} className="py-16" id="planos">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-xs font-black uppercase tracking-widest mb-3 text-center" style={{ color: '#F5C542' }}>Planos</p>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-2 text-center">Preço justo para cada tamanho</h2>
          <p className="text-gray-500 text-sm text-center mb-12">7 dias grátis — sem cartão de crédito, sem burocracia.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {plans.map(plan => <PlanCard key={plan.name} plan={plan} />)}
          </div>

          <div className="mt-10 text-center space-y-2">
            <p className="text-sm text-gray-400">Cancele quando quiser. Sem fidelidade, sem multa. Só resultados.</p>
            <p className="text-xs text-gray-600">Mais de 40 estabelecimentos já controlam o caixa com o FastFood Gestão.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-6 py-16">
        <p className="text-xs font-black uppercase tracking-widest mb-3 text-center" style={{ color: '#F5C542' }}>FAQ</p>
        <h2 className="text-2xl font-black text-white mb-10 text-center">Perguntas frequentes</h2>
        <div>
          {faqs.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 className="text-2xl md:text-3xl font-black text-white mb-3">
          Pronto para ter controle do seu negócio?
        </h2>
        <p className="text-gray-400 text-sm mb-8">7 dias grátis — sem cartão de crédito, sem burocracia.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/cadastro"
            className="inline-flex items-center justify-center font-bold px-8 py-3.5 rounded-xl text-sm transition-colors"
            style={{ background: '#F5C542', color: '#0F0F0F' }}
          >
            Criar minha conta grátis →
          </Link>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 font-semibold px-8 py-3.5 rounded-xl text-sm transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.15)', color: '#ccc' }}
          >
            <MessageCircle size={15} /> Ver demonstração
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs" style={{ color: '#444', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        FastFood Gestão ·{' '}
        <Link to="/cadastro" className="hover:text-yellow-400 transition-colors">Criar conta</Link>
        {' '}·{' '}
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-yellow-400 transition-colors">Falar com vendas</a>
      </footer>

    </div>
  )
}

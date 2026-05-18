import { Link } from 'react-router-dom'
import {
  UtensilsCrossed, Check, MessageCircle, ShieldCheck,
  BarChart2, Users, Zap, Globe, Star, Package,
} from 'lucide-react'

const WHATSAPP_MSG = encodeURIComponent('Olá, tenho interesse no plano Rede do FastFood Gestão')
const WHATSAPP_URL = `https://wa.me?text=${WHATSAPP_MSG}`

const problems = [
  { icon: '📦', title: 'Estoque descontrolado', desc: 'Ingredientes acabam sem aviso, pedidos são cancelados.' },
  { icon: '📊', title: 'Sem visão financeira', desc: 'Não sabe se o mês fechou no lucro ou no prejuízo.' },
  { icon: '🔓', title: 'Dados expostos', desc: 'Qualquer funcionário acessa o DRE e as informações financeiras.' },
  { icon: '💸', title: 'Sistemas caros e complexos', desc: 'ERPs custam R$800+/mês e ainda precisam de treinamento.' },
]

const features = [
  {
    icon: Zap,
    title: 'PDV Completo',
    desc: 'Venda com facilidade, retire ingredientes por item e registre direto no PDV. Cada venda abate automaticamente do estoque.',
    tags: ['Tela cheia', 'Sem bacon', 'Scroll no modal'],
  },
  {
    icon: Package,
    title: 'Estoque Inteligente',
    desc: 'Cadastro de ingredientes vinculado ao PDV. Controle real de entradas, saídas e fornecedores.',
    tags: ['Cadastros', 'Controle real'],
  },
  {
    icon: ShieldCheck,
    title: 'DRE Protegido',
    desc: 'Senha por sessão, sem cache. Reset via e-mail com OTP de 8 dígitos. Operadores não acessam.',
    tags: ['Senha por acesso', 'Reset OTP'],
  },
  {
    icon: BarChart2,
    title: 'Despesas Variáveis',
    desc: 'Lance luz, água e gás por mês diretamente no DRE. Custos fixos e variáveis separados.',
    tags: ['Luz', 'Água', 'Gás'],
  },
  {
    icon: Users,
    title: 'Multi-tenant Seguro',
    desc: 'Cada estabelecimento tem dados 100% isolados via Supabase RLS. Zero acesso cruzado.',
    tags: ['Google OAuth', 'RLS'],
  },
  {
    icon: Globe,
    title: 'Interface Intuitiva',
    desc: 'Menu recolhível, logout acessível, dashboard limpo. Funciona no celular e no computador.',
    tags: ['Responsivo', 'localStorage'],
  },
]

type Plan = {
  name: string
  price: string
  period: string
  highlight?: boolean
  badge?: string
  items: string[]
  cta: string
  ctaStyle: string
  action: 'cadastro' | 'whatsapp'
}

const plans: Plan[] = [
  {
    name: 'Starter',
    price: 'R$97',
    period: '/mês · 1 estabelecimento',
    items: [
      'PDV completo',
      'Controle de estoque',
      'DRE com proteção por senha',
      'Suporte por e-mail',
    ],
    cta: 'Começar agora',
    ctaStyle: 'border-2 border-orange-500 text-orange-600 hover:bg-orange-50',
    action: 'cadastro',
  },
  {
    name: 'Pro',
    price: 'R$197',
    period: '/mês · até 3 filiais',
    highlight: true,
    badge: 'Mais Popular',
    items: [
      'Tudo do Starter',
      'Múltiplos operadores',
      'Despesas variáveis (luz, água, gás)',
      'Relatórios avançados',
      'Suporte prioritário',
    ],
    cta: 'Escolher Pro',
    ctaStyle: 'bg-orange-500 hover:bg-orange-600 text-white',
    action: 'cadastro',
  },
  {
    name: 'Rede',
    price: 'R$397',
    period: '/mês · filiais ilimitadas',
    items: [
      'Tudo do Pro',
      'Dashboard consolidado',
      'Onboarding dedicado',
      'Gestão centralizada',
    ],
    cta: 'Falar com vendas',
    ctaStyle: 'border-2 border-orange-500 text-orange-600 hover:bg-orange-50',
    action: 'whatsapp',
  },
]

function PlanCard({ plan }: { plan: Plan }) {
  const btn = plan.action === 'whatsapp'
    ? <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
        className={`mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors ${plan.ctaStyle}`}>
        <MessageCircle size={15} /> {plan.cta}
      </a>
    : <Link to="/cadastro"
        className={`mt-6 w-full flex items-center justify-center py-3 rounded-xl font-bold text-sm transition-colors ${plan.ctaStyle}`}>
        {plan.cta}
      </Link>

  return (
    <div className={`relative flex flex-col rounded-2xl p-6 ${
      plan.highlight
        ? 'bg-orange-500 text-white shadow-2xl scale-105 ring-4 ring-orange-300'
        : 'bg-white border border-gray-100 shadow-sm'
    }`}>
      {plan.badge && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-white text-orange-600 text-xs font-black px-4 py-1 rounded-full shadow border border-orange-100">
          ★ {plan.badge}
        </span>
      )}
      <p className={`text-sm font-semibold mb-1 ${plan.highlight ? 'text-orange-100' : 'text-gray-400'}`}>
        {plan.name}
      </p>
      <p className={`text-4xl font-black mb-1 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
        {plan.price}
      </p>
      <p className={`text-xs mb-5 ${plan.highlight ? 'text-orange-100' : 'text-gray-400'}`}>
        {plan.period}
      </p>
      <div className={`h-px mb-5 ${plan.highlight ? 'bg-orange-400' : 'bg-gray-100'}`} />
      <ul className="space-y-2.5 flex-1">
        {plan.items.map(item => (
          <li key={item} className="flex items-start gap-2">
            <Check size={15} className={`mt-0.5 shrink-0 ${plan.highlight ? 'text-white' : 'text-orange-500'}`} />
            <span className={`text-sm ${plan.highlight ? 'text-white' : 'text-gray-600'}`}>{item}</span>
          </li>
        ))}
      </ul>
      {btn}
    </div>
  )
}

export default function Planos() {
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Hero */}
      <section className="bg-[#1c1410] text-white">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-widest">
            <UtensilsCrossed size={12} /> Software de Gestão
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight mb-4">
            FastFood Gestão<br />
            <span className="text-orange-500">Controle total</span> no seu estabelecimento
          </h1>
          <p className="text-gray-400 text-base max-w-xl mx-auto mb-8">
            PDV, estoque, DRE e muito mais — tudo integrado, seguro e isolado por conta. Feito para quem não tem tempo a perder.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cadastro"
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors">
              Ver demonstração ↗
            </Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
              className="border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              <MessageCircle size={15} /> Falar com vendas
            </a>
          </div>
          <div className="mt-12 grid grid-cols-3 gap-6 border-t border-gray-700 pt-10 max-w-lg mx-auto">
            {[
              { value: '100%', label: 'Web — acesse de qualquer lugar' },
              { value: 'Multi', label: 'Tenant com dados isolados' },
              { value: 'DRE', label: 'Com proteção por senha' },
            ].map(s => (
              <div key={s.value} className="text-center">
                <p className="text-xl font-black text-white">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problema */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3">O Problema</p>
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-3">
          Você ainda gerencia seu fastfood<br className="hidden md:block" /> no caderno ou na planilha?
        </h2>
        <p className="text-gray-500 text-sm mb-10 max-w-xl">
          A maioria dos pequenos estabelecimentos perde dinheiro por falta de controle. Não é falta de esforço — é falta de ferramenta.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {problems.map(p => (
            <div key={p.title} className="flex gap-4 bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <span className="text-2xl shrink-0">{p.icon}</span>
              <div>
                <p className="font-bold text-gray-800 text-sm">{p.title}</p>
                <p className="text-gray-500 text-xs mt-0.5">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Solução */}
      <section className="bg-white border-y border-gray-100 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3">A Solução</p>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-10">
            Tudo que um fastfood precisa, em um só lugar
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {features.map(f => (
              <div key={f.title} className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
                  <f.icon size={18} className="text-orange-500" />
                </div>
                <p className="font-bold text-gray-800 text-sm mb-1">{f.title}</p>
                <p className="text-gray-500 text-xs leading-relaxed mb-3">{f.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {f.tags.map(t => (
                    <span key={t} className="bg-white border border-gray-200 text-gray-500 text-xs px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimento */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <Star size={20} className="text-orange-400 mx-auto mb-5" />
        <blockquote className="text-lg md:text-xl font-semibold text-gray-800 leading-relaxed mb-6">
          "Antes eu não sabia se estava tendo lucro ou prejuízo. Com o FastFood Gestão, em uma semana já vi onde estava perdendo dinheiro. A proteção do DRE foi o que me convenceu — meu caixa agora só eu acesso."
        </blockquote>
        <div>
          <p className="font-bold text-gray-900 text-sm">Carlos M.</p>
          <p className="text-gray-400 text-xs">Proprietário — Hamburgueria em SP</p>
        </div>
      </section>

      {/* Planos */}
      <section className="bg-white border-y border-gray-100 py-16" id="planos">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-orange-500 text-xs font-black uppercase tracking-widest mb-3 text-center">Planos</p>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2 text-center">
            Preço justo para cada tamanho
          </h2>
          <p className="text-gray-500 text-sm text-center mb-12">7 dias grátis — sem cartão de crédito, sem burocracia.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {plans.map(plan => <PlanCard key={plan.name} plan={plan} />)}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-orange-500 py-14 text-center">
        <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
          Pronto para ter controle do seu negócio?
        </h2>
        <p className="text-orange-100 text-sm mb-7">7 dias grátis — sem cartão de crédito, sem burocracia.</p>
        <Link to="/cadastro"
          className="inline-flex items-center gap-2 bg-white text-orange-600 hover:bg-orange-50 font-bold px-8 py-3.5 rounded-xl text-sm transition-colors shadow-lg">
          Criar conta grátis ↗
        </Link>
      </section>

      {/* Footer mínimo */}
      <footer className="text-center py-6 text-xs text-gray-400">
        FastFood Gestão · <Link to="/cadastro" className="hover:text-orange-500">Criar conta</Link> · <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-orange-500">Falar com vendas</a>
      </footer>

    </div>
  )
}

import { useState } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, DollarSign, Users,
  Settings, TrendingUp, FileText, BarChart2, ChevronDown,
  ChevronUp, Lightbulb, CheckCircle2, Search, BookOpen,
} from 'lucide-react'

interface Step { text: string }
interface Tip { text: string }
interface Section {
  id: string
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  border: string
  desc: string
  steps: Step[]
  tips: Tip[]
}

const SECTIONS: Section[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={22} />,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    desc: 'Visão geral do negócio em tempo real — vendas, receita, estoque crítico e metas do mês.',
    steps: [
      { text: 'Ao abrir o sistema você já cai no Dashboard com os números de hoje.' },
      { text: 'Use os botões "7 dias / 30 dias / Este mês / Tudo" para mudar o período dos gráficos.' },
      { text: 'Filtre por produto específico no dropdown para ver apenas a performance daquele item.' },
      { text: 'No card "Metas do Mês", clique em "Definir metas" para informar a receita-alvo e o EBITDA-alvo. As barras de progresso atualizam conforme as vendas chegam.' },
      { text: 'O gráfico de "Horários de Pico" mostra em quais horas você vende mais — útil para escalar equipe.' },
      { text: 'O card "Estoque Crítico" lista ingredientes abaixo do mínimo configurado.' },
    ],
    tips: [
      { text: 'Defina metas no começo de cada mês para ter referência visual diária.' },
      { text: 'Horários com mais pedidos = vale ter mais gente na cozinha ou balcão.' },
    ],
  },
  {
    id: 'vendas',
    label: 'Vendas',
    icon: <ShoppingCart size={22} />,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    desc: 'Registre cada venda, aplique cashback de clientes e acompanhe o histórico.',
    steps: [
      { text: 'Clique em "Nova Venda" no canto superior direito.' },
      { text: 'Adicione produtos clicando sobre eles na lista ou buscando pelo nome. Ajuste a quantidade com "+" e "−".' },
      { text: 'Se quiser associar um cliente (para cashback), clique em "Adicionar cliente" e busque pelo nome ou telefone.' },
      { text: 'Se o cliente tiver saldo de cashback, o sistema mostrará o valor disponível — ative o toggle para usar.' },
      { text: 'Selecione a forma de pagamento (Dinheiro / PIX / Débito / Crédito) e clique em "Confirmar Venda".' },
      { text: 'A venda aparece no histórico abaixo. Clique no ícone de lixeira para excluir se necessário.' },
    ],
    tips: [
      { text: 'Cadastre os produtos antes de tentar vender (módulo Cadastros).' },
      { text: 'Vendas em Dinheiro entram automaticamente no Controle de Caixa do dia.' },
      { text: 'O cashback é calculado automaticamente sobre o total da venda.' },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    icon: <Package size={22} />,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    desc: 'Controle entradas de mercadoria, validade por lote, desvio de consumo e contagem física.',
    steps: [
      { text: 'Aba "Compras": registre toda entrada de mercadoria. Para cada item, informe data de validade — o sistema alertará quando estiver próxima de vencer.' },
      { text: 'Aba "Desvio": veja alertas de validade (≤ 7 dias), faça contagem física informando o que está no estoque real, e compare consumo teórico vs real por ingrediente.' },
      { text: 'Aba "Ingredientes": cadastre ou edite ingredientes. Defina o estoque mínimo para receber alertas no Dashboard.' },
      { text: 'Aba "Fornecedores": cadastre os dados de contato de cada fornecedor. Ao registrar uma compra, selecione o fornecedor.' },
      { text: 'Aba "Comparativo": compare preços de compra por período para identificar inflação de insumos.' },
      { text: 'Faça contagem física periodicamente (semanal ou quinzenal) para manter o estoque preciso.' },
    ],
    tips: [
      { text: 'O desvio de consumo alto indica possível perda, desperdício ou furto.' },
      { text: 'Configure estoque mínimo realista — quantidade suficiente para 2 dias de operação.' },
      { text: 'Produtos próximos do vencimento aparecem em vermelho na aba Desvio.' },
    ],
  },
  {
    id: 'caixa',
    label: 'Caixa',
    icon: <DollarSign size={22} />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    desc: 'Controle diário do caixa físico: abertura, saídas, fechamento e conferência.',
    steps: [
      { text: 'Ao iniciar o dia, vá em Caixa e clique "Abrir Caixa". Informe o troco inicial (dinheiro que já estava no caixa).' },
      { text: 'Durante o dia as vendas em Dinheiro são somadas automaticamente ao saldo esperado.' },
      { text: 'Para registrar saídas (ex: compra de gás, troco para entregador), use o formulário "Registrar Saída de Caixa".' },
      { text: 'Ao fechar, clique "Fechar Caixa". Conte fisicamente o dinheiro em caixa e informe o valor.' },
      { text: 'O sistema calcula: Troco Inicial + Vendas em Dinheiro − Saídas = Saldo Esperado. Se a diferença for zero, aparece "✓ Correto".' },
      { text: 'Sobra ou falta fica registrada no histórico. Acesse na aba "Histórico" para ver dias anteriores.' },
    ],
    tips: [
      { text: 'Sobra recorrente pode indicar erro no troco. Falta recorrente pode indicar desvio.' },
      { text: 'Adicione observações no fechamento para explicar diferenças pontuais.' },
      { text: 'Apenas vendas em Dinheiro entram no saldo do caixa físico. PIX e cartão vão direto para a conta.' },
    ],
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: <Users size={22} />,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    desc: 'Cadastro de clientes com programa de cashback e histórico de compras.',
    steps: [
      { text: 'Acesse Clientes e clique "Novo Cliente". Informe nome, telefone e data de aniversário.' },
      { text: 'O cliente também pode se cadastrar pelo link público (compartilhe /cadastro ou o QR Code).' },
      { text: 'Ao registrar uma venda, busque o cliente pelo nome para associar a compra.' },
      { text: 'O cashback é creditado automaticamente após a venda (configure o % em Cadastros → Cashback).' },
      { text: 'Na próxima compra, o saldo de cashback aparece disponível e o cliente pode optar por usar.' },
      { text: 'Use o filtro de aniversariantes para criar ações promocionais no mês do aniversário.' },
    ],
    tips: [
      { text: 'Cashback fideliza e incentiva o cliente a voltar. Comece com 2–5%.' },
      { text: 'Clientes com aniversário no mês são um ótimo canal para ação promocional via WhatsApp.' },
      { text: 'O link /cadastro pode ser colocado como QR Code impresso no balcão.' },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    icon: <Settings size={22} />,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    desc: 'Configure o cardápio, ingredientes, fichas técnicas e cashback.',
    steps: [
      { text: 'Aba "Produtos": cadastre cada item do cardápio com nome, categoria e preço de venda. Ative/desative para controlar o que aparece nas vendas.' },
      { text: 'Aba "Ingredientes": informe nome, unidade (kg, un, L) e estoque mínimo de cada insumo.' },
      { text: 'Aba "Fichas Técnicas": associe ingredientes a cada produto com a quantidade usada por porção. Isso alimenta o CMV e o controle de desvio.' },
      { text: 'Aba "Fornecedores": cadastre nome, contato e observações de cada fornecedor.' },
      { text: 'Aba "Cashback": ative o programa e defina o percentual de retorno sobre cada venda.' },
    ],
    tips: [
      { text: 'Fichas técnicas bem preenchidas são a base para o cálculo de CMV e precificação correta.' },
      { text: 'Você pode desativar um produto sem excluir — útil para itens sazonais.' },
      { text: 'Unidades devem ser consistentes: se o ingrediente é cadastrado em "kg", a ficha técnica deve usar "kg".' },
    ],
  },
  {
    id: 'precificacao',
    label: 'Precificação',
    icon: <TrendingUp size={22} />,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    desc: 'Calcule o custo real de cada produto e valide se o preço de venda é adequado.',
    steps: [
      { text: 'Acesse Precificação para ver todos os produtos com custo calculado automaticamente.' },
      { text: 'O custo é calculado somando o custo de cada ingrediente da ficha técnica, baseado no último preço de compra registrado.' },
      { text: 'O sistema mostra: Custo, Preço de Venda, Margem de Contribuição (%) e Markup.' },
      { text: 'Produtos com margem abaixo do saudável aparecem sinalizados — considere revisar o preço ou reduzir o custo.' },
      { text: 'Para ajustar o preço, acesse Cadastros → Produtos e edite o preço de venda.' },
    ],
    tips: [
      { text: 'Margem de contribuição saudável para food service: acima de 60%.' },
      { text: 'Revise a precificação sempre que tiver alta de preço de insumos.' },
      { text: 'O custo só é preciso se as fichas técnicas e os preços de compra estiverem atualizados.' },
    ],
  },
  {
    id: 'dre',
    label: 'DRE — Resultado',
    icon: <FileText size={22} />,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    desc: 'Demonstração do resultado do mês: receita, custos, EBITDA, impostos e lucro líquido.',
    steps: [
      { text: 'Primeiro, cadastre os custos fixos mensais no painel da direita (aluguel, pró-labore, energia, água, etc.).' },
      { text: 'Selecione o mês e ano no seletor de período. O DRE é calculado automaticamente com as vendas e compras do período.' },
      { text: 'Leia o DRE de cima para baixo: Receita → CMV → Lucro Bruto → Custos Fixos → EBITDA → Impostos → Lucro Líquido.' },
      { text: 'Clique no ícone (?) ao lado de cada linha para ver uma explicação do que significa.' },
      { text: 'Em "Configurar" ajuste a taxa de imposto (Simples Nacional ≈ 6%) e a depreciação mensal de equipamentos.' },
      { text: 'Use "Simular Cenário" para ver quanto precisaria faturar para atingir um EBITDA-alvo — a tabela mostra Real vs Projetado.' },
      { text: 'Se houver compras antigas de simulação, o botão "Limpar compras de simulação" aparece para removê-las.' },
    ],
    tips: [
      { text: 'EBITDA acima de 15% é considerado saudável para food service.' },
      { text: 'Se o CMV ultrapassar 35–40%, revise preços de compra ou fichas técnicas.' },
      { text: 'O DRE reflete dados reais — quanto mais completo o lançamento de vendas e compras, mais preciso o resultado.' },
    ],
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    icon: <BarChart2 size={22} />,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    desc: 'Análise anual e mensal com gráficos de faturamento, produtos mais vendidos e formas de pagamento.',
    steps: [
      { text: 'Selecione o ano no canto superior direito para ver o painel anual.' },
      { text: 'O gráfico "Receita vs Compras Mensais" mostra a evolução mês a mês — identifique sazonalidade.' },
      { text: 'O gráfico de "Forma de Pagamento" mostra a distribuição do faturamento por método no ano.' },
      { text: 'O "Ticket Médio por Dia da Semana" mostra quais dias têm o ticket mais alto.' },
      { text: 'No "Ranking de Produtos por Mês" selecione o mês/ano desejado para ver os itens mais vendidos com: quantidade, faturamento, % do total e ticket médio por item.' },
      { text: 'Alterne entre "Por qtd." e "Por receita" para ordenar o ranking de forma diferente.' },
      { text: 'A tabela "Resumo Mensal" mostra todos os meses do ano em uma só visão.' },
    ],
    tips: [
      { text: 'Use o ranking para decidir promoções: itens no topo do ranking são os mais pedidos — itens no meio têm potencial a explorar.' },
      { text: 'Compare o ticket médio por dia da semana para ajustar combos e promoções nos dias mais fracos.' },
    ],
  },
]

export default function Ajuda() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = SECTIONS.filter(s =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.desc.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string) {
    setOpenId(prev => prev === id ? null : id)
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={24} className="text-orange-500" />
          <h1 className="text-2xl font-bold text-gray-800">Manual do Sistema</h1>
        </div>
        <p className="text-gray-500 text-sm">Guia de uso de cada módulo do FastFood Gestão</p>
      </div>

      {/* Busca */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar módulo ou função..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 bg-white"
        />
      </div>

      {/* Módulos */}
      <div className="space-y-3">
        {filtered.map(section => {
          const isOpen = openId === section.id
          return (
            <div
              key={section.id}
              className={`rounded-xl border transition-all ${isOpen ? section.border : 'border-gray-200'} bg-white overflow-hidden`}
            >
              {/* Header do card */}
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => toggle(section.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${section.bg} ${section.color} flex items-center justify-center shrink-0`}>
                    {section.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{section.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{section.desc}</p>
                  </div>
                </div>
                <div className="ml-3 shrink-0 text-gray-400">
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {/* Conteúdo expandido */}
              {isOpen && (
                <div className={`px-4 pb-5 border-t ${section.border}`}>
                  {/* Passo a passo */}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-3">
                    Passo a passo
                  </p>
                  <ol className="space-y-2.5">
                    {section.steps.map((step, i) => (
                      <li key={i} className="flex gap-3">
                        <span className={`w-6 h-6 rounded-full ${section.bg} ${section.color} text-xs font-bold flex items-center justify-center shrink-0 mt-0.5`}>
                          {i + 1}
                        </span>
                        <span className="text-sm text-gray-700 leading-relaxed">{step.text}</span>
                      </li>
                    ))}
                  </ol>

                  {/* Dicas */}
                  {section.tips.length > 0 && (
                    <>
                      <div className={`mt-4 rounded-xl ${section.bg} ${section.border} border p-3`}>
                        <p className={`text-xs font-semibold ${section.color} flex items-center gap-1.5 mb-2`}>
                          <Lightbulb size={13} /> Dicas
                        </p>
                        <ul className="space-y-1.5">
                          {section.tips.map((tip, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                              <CheckCircle2 size={13} className={`${section.color} mt-0.5 shrink-0`} />
                              {tip.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Search size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum módulo encontrado para "{search}"</p>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-300 mt-8">FastFood Gestão · v1.0</p>
    </div>
  )
}

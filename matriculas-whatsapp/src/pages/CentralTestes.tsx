import { useState } from 'react'
import {
  Send, Loader2, CheckCircle2, XCircle, TestTube2, Truck, Route, ShieldAlert,
  ClipboardList, Gavel, PackageSearch, Radar, PackageCheck, Warehouse, Car, Send as SendIcon,
  GraduationCap, Clock3,
} from 'lucide-react'
import { formatarDataBR } from '../lib/utils'
import { enviarMensagemWhatsApp, enviarListaOpcoesWhatsApp, variarTexto, formatarMensagem } from '../lib/zapi'
import { montarMensagemTml } from './DistribuicaoTML'
import { montarMensagemFixacaoMotorista, type TerritorioMotoristaInfo } from '../lib/frota'
import { montarMensagemAberturaMotorista } from '../lib/tmlConversaMotorista'
import {
  montarMensagemJornadaSala, montarMensagemIvSala, montarMensagemAderenciaSala, montarMensagemAlertaAderenciaMotorista,
  type LinhaJornada,
} from '../lib/jornada'
import { montarMensagemDivergencia, type ItemConf } from '../lib/conferencia'
import { montarMensagemAlertaRota } from '../lib/telemetriaHotspot'
import { montarMensagemAgendamentoVisita, montarMensagemAvisoMotoristaPdv } from '../lib/pdvSeguranca'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function daquiDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function linhaJornadaExemplo(overrides: Partial<LinhaJornada> = {}): LinhaJornada {
  return {
    mapa: 279861, placa: 'ABC1D23', matricula: 12345, nome: 'João da Silva (exemplo)',
    sala: 'INTERIOR', tempoPrevMin: 480, horaSaidaPrev: '06:30', horaSaidaReal: '07:10',
    previsaoChegada: '15:30', previsaoChegadaDinamica: '16:10', statusPrevisao: 'atrasado',
    trRealMin: 520, situacao: 'nao_bate', entregasPrevistas: 40, realizadas: 25,
    pendentes: 15, repasse: 1, devolucao: 2, devForaRaio: 1, entregaForaRaio: 2,
    menos4min: 3, not10s: 1, aderencia: 0.85, percConclusao: 0.6, tempoDirigindoMin: 300,
    mpdStatus: null, rotaFinalizada: false, telefone: null,
    ...overrides,
  }
}

function montarMensagemPendentesCdd(): string {
  const lista = [
    { mapa: 279861, placa: 'ABC1D23', nome: 'João da Silva (exemplo)' },
    { mapa: 279862, placa: 'DEF4E56', nome: 'Maria Souza (exemplo)' },
  ]
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  let msg = `${variarTexto(['🚛 *PENDENTES NO CDD', '🚛 *AINDA NO CDD', '📍 *MAPAS PENDENTES NO CDD'])} — ${hora}*\n`
  msg += `COLORADO — ${lista.length} ainda não saíram:\n\n`
  for (const p of lista) msg += `• Mapa ${p.mapa} — ${p.placa} — ${p.nome}\n`
  return msg
}

function montarMensagemGsdpqExemplo(): string {
  const lista = [
    { colaborador: { nome: 'João da Silva (exemplo)' }, info: { diasRestantes: -2, cicloDias: 90 } },
    { colaborador: { nome: 'Maria Souza (exemplo)' }, info: { diasRestantes: 5, cicloDias: 90 } },
  ]
  const linhas = lista.map((v) => {
    const dr = v.info.diasRestantes
    const status = dr <= 0 ? `vencido há ${Math.abs(dr)}d` : `faltam ${dr}d`
    return `👤 ${v.colaborador.nome} — ${status} (ciclo ${v.info.cicloDias}d)`
  }).join('\n')
  return (
    `${variarTexto(['🔔 *Vencimentos de GSD', '🔔 *GSD a vencer/vencido', '📋 *Aplicações de GSD pendentes'])} — Equipe A*\n\n${linhas}\n\n` +
    `${variarTexto(['Favor agendar a aplicação do GSD para os colaboradores acima.', 'Por favor, agende a aplicação do GSD pra esses colaboradores.', 'Pede pra agendar a aplicação do GSD pra essa turma acima.'])}`
  )
}

function montarMensagemFluxoExemplo(): string {
  const itens = ['Atraso não justificado', 'Descumprimento de procedimento de segurança']
  const lista = itens.map((l, i) => `${i + 1}. ${l}`).join('\n')
  return (
    `🔔 *Solicitação de Fluxo Punitivo*\n📍 Filial: Exemplo\n👤 Colaborador: João da Silva (exemplo)\n` +
    `📋 Origem: Relatos\n🗓️ Data: ${formatarDataBR(hojeISO())}\n⚠️ Ocorrências (${itens.length}):\n${lista}\n` +
    `✍️ Solicitado por: Central de Testes`
  )
}

function montarMensagemValesExemplo(): string {
  const linhas = [
    '🔎 *Validação de Reposição* — 000123 (exemplo)',
    '🔁 Tipo: Falta',
    '📦 Embalagem: Caixa',
    '👤 Motorista: João da Silva (exemplo)',
    '🏪 PDV: 279861',
    '🗺️ Mapa: 279861',
    '📋 Produto: Refrigerante 2L',
    '📊 Qtde: 5',
  ]
  linhas.push('\nValidar? Toque em *OK* / *NOK* ou responda *OK* para aprovar ou *NOK* para negar.')
  return linhas.join('\n')
}

function montarMensagemArmazemExemplo(): string {
  return '⚠️ Anomalia registrada no Armazém\n\nColaborador: João da Silva (exemplo)\nAtividade: Separação de pedidos\nDescrição: Empilhadeira com barulho anormal'
}

function montarMensagemTreinamentoExemplo(): string {
  return (
    '📋 Hoje na matinal tivemos o treinamento *Direção Defensiva (exemplo)*.\n' +
    'Quem ficou com alguma dúvida, me chama aqui no privado dizendo algo como *"fiquei com dúvida no treinamento"* — eu já te ajudo a tirar.'
  )
}

function montarMensagemRvTurnoExemplo(): string {
  return variarTexto([
    '👋 Oi, João (exemplo)! O Turno Manhã está fechando — não esquece de lançar as atividades do dia na RV por Turno.',
    '⏰ João (exemplo), chegou a hora do fechamento do Turno Manhã. Lança as atividades de hoje na RV por Turno, por favor.',
    'Oi, João (exemplo)! Lembrete do Turno Manhã: falta lançar as atividades de hoje na RV por Turno antes de fechar.',
  ])
}

const territorioExemplo: TerritorioMotoristaInfo = {
  status: 'divergente', territorioProgramado: 'Zona Sul', regiaoExecutada: 'Zona Norte',
}

const itemConfExemplo: ItemConf = {
  id: 'exemplo-1', sequencia: 1, codigo: '12345', descricao: 'Refrigerante 2L', tipo: 'bebida',
  quantidade: 10, unidade: 'CX', conferido: true, divergencia: true, tipoDivergencia: 'falta',
  qtdReal: 8, obs: 'Faltaram 2 caixas',
}

interface ItemTeste {
  id: string
  titulo: string
  quandoDispara: string
  destino: string
  gerar: () => string
  lista?: { titulo: string; botaoLabel: string; opcoes: { id: string; title: string }[] }
}

interface SessaoTeste {
  nome: string
  icon: typeof Truck
  itens: ItemTeste[]
}

const SESSOES: SessaoTeste[] = [
  {
    nome: 'TML — Alertas ao motorista/supervisor',
    icon: Truck,
    itens: [
      {
        id: 'tml-perdido',
        titulo: 'TML perdido → supervisor da sala',
        quandoDispara: 'Enviado quando um mapa sai da portaria depois do horário limite do TML, ao clicar em "Enviar" no alerta gerado pelo import da planilha de saída.',
        destino: 'Supervisores da sala (cadastro em Supervisores TML)',
        gerar: () => montarMensagemTml({
          mapa: 279861, placa: 'ABC1D23', nome: 'João da Silva (exemplo)', matricula: 12345,
          sala: 'COLORADO', horario_limite: '06:30', horario_saida: '07:10', atraso_minutos: 40,
        }),
      },
      {
        id: 'tml-pendentes-cdd',
        titulo: 'Pendentes no CDD → supervisor',
        quandoDispara: 'Automático a cada import da planilha de saída — lista mapas escalados que ainda não saíram do CDD.',
        destino: 'Supervisores da sala',
        gerar: montarMensagemPendentesCdd,
      },
      {
        id: 'tml-abertura-motorista',
        titulo: 'Abertura de conversa sobre o TML → motorista',
        quandoDispara: 'Ao clicar em "Iniciar conversa" no alerta de TML — pergunta ao motorista o motivo do atraso.',
        destino: 'Celular do motorista',
        gerar: () => montarMensagemAberturaMotorista({ nome: 'João da Silva (exemplo)', mapa: 279861, atraso_minutos: 40 }),
      },
      {
        id: 'tml-lista-justificativa',
        titulo: 'Lista de motivos de justificativa (áreas/UGC)',
        quandoDispara: 'Teste já existente na tela de TML — motorista escolhe a área do motivo numa lista interativa do WhatsApp.',
        destino: 'Número avulso (teste)',
        gerar: () => '🧪 *TESTE — Justificativa de TML*\nEscolha a área para ver os motivos. Nenhum alerta real será alterado.',
        lista: {
          titulo: 'Área do motivo', botaoLabel: 'Escolher área',
          opcoes: [
            { id: 'tmltesteugc:exemplo:OPERAÇÃO', title: 'OPERAÇÃO' },
            { id: 'tmltesteugc:exemplo:MANUTENÇÃO', title: 'MANUTENÇÃO' },
            { id: 'tmltesteugc:exemplo:SEGURANÇA', title: 'SEGURANÇA' },
          ],
        },
      },
    ],
  },
  {
    nome: 'Jornada e Tempo em Rota',
    icon: Route,
    itens: [
      {
        id: 'jornada-sala',
        titulo: 'Previsão de atraso da sala → supervisor',
        quandoDispara: 'A cada import do BEES (Tracking) — lista mapas com previsão de chegada atrasada.',
        destino: 'Supervisor da sala',
        gerar: () => montarMensagemJornadaSala('INTERIOR', [linhaJornadaExemplo()], hojeISO()) ?? '(sem atraso na amostra — ajuste os dados de exemplo)',
      },
      {
        id: 'jornada-iv',
        titulo: 'IV / Devolução da sala → supervisor',
        quandoDispara: 'A cada import do BEES — resumo de devolução e repasse da sala.',
        destino: 'Supervisor da sala',
        gerar: () => montarMensagemIvSala('INTERIOR', [linhaJornadaExemplo()], hojeISO()),
      },
      {
        id: 'jornada-aderencia-sala',
        titulo: 'Aderência da sala → supervisor',
        quandoDispara: 'A cada import do BEES — motoristas com aderência abaixo do mínimo (95%).',
        destino: 'Supervisor da sala + números extras cadastrados',
        gerar: () => montarMensagemAderenciaSala('INTERIOR', [linhaJornadaExemplo()], hojeISO()),
      },
      {
        id: 'jornada-alerta-motorista',
        titulo: 'Alerta de aderência baixa → MOTORISTA',
        quandoDispara: 'A cada import do BEES, quando a aderência do motorista fica abaixo de 95% e a rota ainda não terminou.',
        destino: 'Celular do motorista',
        gerar: () => montarMensagemAlertaAderenciaMotorista(linhaJornadaExemplo(), hojeISO()),
      },
    ],
  },
  {
    nome: 'PDV Crítico (Segurança)',
    icon: ShieldAlert,
    itens: [
      {
        id: 'pdv-agendamento',
        titulo: 'Agendamento de visita → supervisor',
        quandoDispara: 'Ao clicar em "Agendar e enviar WhatsApp" no painel do PDV Crítico, escolhendo o supervisor.',
        destino: 'Supervisor selecionado',
        gerar: () => montarMensagemAgendamentoVisita(
          {
            codigoPdv: '279861', subgrupo: 'Acesso / Escada / Rampa irregular', nivel: 'medio',
            prazoVisita: daquiDias(5), instrucaoRegistrada: 'Motorista relatou rampa quebrada na entrada (exemplo)',
          },
          `${window.location.origin}/pdv-critico/visita?token=exemplo-teste`
        ),
      },
      {
        id: 'pdv-aviso-motorista',
        titulo: 'Aviso de PDV crítico na rota → motorista',
        quandoDispara: 'A cada import do BEES em Jornada e Rota, quando o mapa do motorista passa por um PDV com caso aprovado.',
        destino: 'Celular do motorista',
        gerar: () => montarMensagemAvisoMotoristaPdv('279861', 'Acesso / Escada / Rampa irregular (exemplo)'),
      },
    ],
  },
  {
    nome: 'GSDPQ',
    icon: ClipboardList,
    itens: [
      {
        id: 'gsdpq-vencimento',
        titulo: 'Vencimento de GSD → supervisor da equipe',
        quandoDispara: 'Rotina de verificação de vencimento de GSD por colaborador.',
        destino: 'Supervisor da equipe',
        gerar: montarMensagemGsdpqExemplo,
      },
    ],
  },
  {
    nome: 'Fluxo Punitivo',
    icon: Gavel,
    itens: [
      {
        id: 'fluxo-punitivo',
        titulo: 'Solicitação de Fluxo Punitivo → grupo',
        quandoDispara: 'Ao registrar ocorrências em Relatos, DTO ou Vales que pedem abertura de fluxo punitivo.',
        destino: 'Grupo de Fluxo Punitivo (mesmo texto nas 3 origens)',
        gerar: montarMensagemFluxoExemplo,
      },
    ],
  },
  {
    nome: 'Conferência Digital',
    icon: PackageSearch,
    itens: [
      {
        id: 'conferencia-divergencia',
        titulo: 'Divergência de conferência → grupo',
        quandoDispara: 'Ao confirmar falta, sobra ou avaria de um item numa baia.',
        destino: 'Grupo de Conferência',
        gerar: () => montarMensagemDivergencia({
          mapa: 279861, baiaRotulo: 'Baia 03', item: itemConfExemplo, conferente: 'Maria Souza (exemplo)', data: hojeISO(),
        }),
      },
    ],
  },
  {
    nome: 'Telemetria',
    icon: Radar,
    itens: [
      {
        id: 'telemetria-hotspot',
        titulo: 'Alerta de rota em hotspot → motorista',
        quandoDispara: 'Ao importar a escala, quando o motorista tem cidades de risco no roteiro.',
        destino: 'Celular do motorista',
        gerar: () => montarMensagemAlertaRota('João da Silva (exemplo)', [{ cidade: 'Centro', eventos: 5 }, { cidade: 'Zona Norte', eventos: 3 }]),
      },
    ],
  },
  {
    nome: 'Vales / Reposições',
    icon: PackageCheck,
    itens: [
      {
        id: 'vales-validacao',
        titulo: 'Validação de reposição → grupo (OK/NOK)',
        quandoDispara: 'Ao enviar uma reposição pra validação. No real sai com botões interativos OK/NOK num grupo — aqui o texto vem sem os botões.',
        destino: 'Grupo de Validação',
        gerar: montarMensagemValesExemplo,
      },
    ],
  },
  {
    nome: 'Armazém',
    icon: Warehouse,
    itens: [
      {
        id: 'armazem-anomalia',
        titulo: 'Anomalia registrada → grupo',
        quandoDispara: 'Quando um operador registra uma anomalia numa atividade do Armazém.',
        destino: 'Grupo do Armazém',
        gerar: montarMensagemArmazemExemplo,
      },
    ],
  },
  {
    nome: 'Frota — Fixação de Motorista',
    icon: Car,
    itens: [
      {
        id: 'frota-fixacao',
        titulo: 'Divergência de fixação → supervisor (lista de motivos)',
        quandoDispara: 'A cada import de saída, quando a placa roda com motorista diferente do fixado.',
        destino: 'Supervisor da sala',
        gerar: () => montarMensagemFixacaoMotorista({
          placa: 'ABC1D23', data: hojeISO(), sala: 'COLORADO',
          nomeExecutou: 'Pedro Lima (exemplo)', nomeEsperada1: 'João da Silva (exemplo)', nomeEsperada2: null,
          territorio: territorioExemplo,
        }),
      },
    ],
  },
  {
    nome: 'Disparos (cruzamento de vendas)',
    icon: SendIcon,
    itens: [
      {
        id: 'disparos-cruzamento',
        titulo: 'Disparo por cruzamento vendas × escala → motorista',
        quandoDispara: 'Ao rodar o cruzamento de vendas com a escala do dia e disparar pros motoristas com pendência.',
        destino: 'Celular do motorista',
        gerar: () => formatarMensagem(
          'Olá {{nomeMotorista}}, no cliente {{nomeCliente}} (cód. {{codigoCliente}}) do mapa {{mapa}}: {{observacoes}}',
          {
            matricula: '12345', nomeMotorista: 'João da Silva (exemplo)', mapa: '279861',
            codigoCliente: '9001', nomeCliente: 'Mercado Boa Compra (exemplo)',
            observacoes: 'Confirmar recebimento com o gerente',
          }
        ),
      },
    ],
  },
  {
    nome: 'Treinamentos / Matinal',
    icon: GraduationCap,
    itens: [
      {
        id: 'treinamento-matinal',
        titulo: 'Aviso de treinamento → grupo da sala',
        quandoDispara: 'Ao registrar o treinamento realizado na matinal do dia.',
        destino: 'Grupo da sala (matinal)',
        gerar: montarMensagemTreinamentoExemplo,
      },
    ],
  },
  {
    nome: 'Variável / RV por Turno',
    icon: Clock3,
    itens: [
      {
        id: 'rv-turno',
        titulo: 'Lembrete de fechamento de turno → conferente',
        quandoDispara: 'Rotina automática (cron) próxima do fechamento de cada turno.',
        destino: 'Celular do conferente RV',
        gerar: montarMensagemRvTurnoExemplo,
      },
    ],
  },
]

function CardTeste({ item, telefone }: { item: ItemTeste; telefone: string }) {
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ sucesso: boolean; erro?: string } | null>(null)
  const mensagem = item.gerar()

  async function handleEnviar() {
    if (!telefone.trim()) return
    setEnviando(true)
    setResultado(null)
    const r = item.lista
      ? await enviarListaOpcoesWhatsApp(telefone.trim(), mensagem, item.lista.titulo, item.lista.botaoLabel, item.lista.opcoes)
      : await enviarMensagemWhatsApp(telefone.trim(), mensagem)
    setEnviando(false)
    setResultado({ sucesso: r.sucesso, erro: r.erro })
  }

  return (
    <div className="border rounded-lg bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{item.titulo}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{item.quandoDispara}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Destino real: {item.destino}</p>
        </div>
        <button
          onClick={handleEnviar}
          disabled={enviando || !telefone.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-accent-500 text-white disabled:opacity-40 hover:bg-accent-600 whitespace-nowrap"
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Enviar teste
        </button>
      </div>
      <pre className="bg-slate-50 border rounded-md p-3 text-xs whitespace-pre-wrap font-sans">{mensagem}</pre>
      {resultado && (
        <div className={`flex items-center gap-1.5 text-xs font-medium ${resultado.sucesso ? 'text-green-700' : 'text-red-600'}`}>
          {resultado.sucesso ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {resultado.sucesso ? 'Enviado com sucesso.' : `Falha: ${resultado.erro ?? 'erro desconhecido'}`}
        </div>
      )}
    </div>
  )
}

export default function CentralTestes() {
  const [telefone, setTelefone] = useState('')

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <TestTube2 className="h-6 w-6 text-primary" /> Central de Testes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Todas as mensagens automáticas que o sistema envia hoje, separadas por sessão — com os dados reais de
          exemplo já preenchidos. Digite um número e envie qualquer uma pra ver exatamente o que o bot manda em cada
          situação, sem precisar importar nenhuma planilha real.
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          Envia mesmo — é o WhatsApp de verdade, só que pro número que você digitar em vez do destinatário real.
          Relatórios em imagem (Carta de Controle, Farol de Críticos, Fechamento do Dia etc.) não estão nessa
          primeira versão — dependem de dados reais renderizados em gráfico/print.
        </p>
      </div>

      <div className="sticky top-0 z-10 bg-white border rounded-lg p-3 shadow-sm">
        <label className="block text-xs text-muted-foreground mb-1">Número de WhatsApp pra receber os testes</label>
        <input
          type="text"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="Ex.: 11999999999"
          className="w-full sm:w-72 border rounded-md px-3 py-2 text-sm"
        />
      </div>

      {SESSOES.map((sessao) => (
        <div key={sessao.nome} className="space-y-3">
          <h2 className="text-sm font-bold flex items-center gap-2 pt-2">
            <sessao.icon className="h-4 w-4 text-primary" /> {sessao.nome}
          </h2>
          <div className="space-y-3">
            {sessao.itens.map((item) => <CardTeste key={item.id} item={item} telefone={telefone} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

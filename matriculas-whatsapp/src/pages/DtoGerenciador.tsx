import { Fragment, forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2, RefreshCw, Loader2, CalendarClock, AlertTriangle, ListChecks,
  Users, Download, ChevronDown, ChevronUp, Database, Zap, TrendingUp, TrendingDown, Minus, Image,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { DtoAtividade, DtoAtividadeAlias, DtoAvaliador, DtoObservacao, Relato } from '../types'

// ── Seed: base de atividades (Calendarização Armazém + Oficina da planilha oficial) ──

const SEED_ATIVIDADES: { area: string; nome: string; frequencia: string; criticidade_base: string }[] = [
  { area: 'Armazém', nome: 'ARMAZENAGEM CONFORME LAYOUT E FEFO', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'BLITZ DE CARREGAMENTO', frequencia: '1x no dia', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'BLITZ DE EMPURRADA', frequencia: '1x no dia', criticidade_base: 'Alto' },
  { area: 'Armazém', nome: 'BLITZ DE REFUGO', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'CARREGAMENTO DE AG CAMINHÃO DA EMPURRADA', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'CARREGAMENTO DE EMPILHADEIRA / MÁQUINA DE LIMPEZA - ELÉTRICA', frequencia: 'Varias vezes no dia', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'CARREGAMENTO FROTA FIXA - CAMINHÃO', frequencia: 'Diariamente no TC', criticidade_base: 'Médio' },
  { area: 'Armazém', nome: 'CARREGAMENTO FROTA FIXA - VAN/FIORINO', frequencia: 'Diariamente no TC', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'CONTAGEM DIÁRIA E MENSAL', frequencia: 'Diariamente no TC', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'DESCARREGAMENTO DE EMPURRADA', frequencia: 'Sob Demanda', criticidade_base: 'Médio' },
  { area: 'Armazém', nome: 'DESCARREGAMENTO DE MARKET PLACE - OUTROS MODAIS', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'DESCARREGAMENTO FRETEIRO', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'DESCARREGAMENTO FROTA FIXA - CAMINHÃO', frequencia: 'Diariamente no TB', criticidade_base: 'Alto' },
  { area: 'Armazém', nome: 'DESCARREGAMENTO FROTA FIXA - VAN/FIORINO', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'ESTOCAGEM DE CHOPP CONFORME FEFO E LAYOUT', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'ESTOCAGEM DE PRODUTOS EM RACKS', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'ESTOCAGEM DE PRODUTOS MARKET PLACE', frequencia: '1x no dia', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'FECHAMENTO DE MAPA', frequencia: 'Diariamente no TC', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'FLUXO DE ENTRADA DE CARRETAS DA EMPURRADA', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'FLUXO DE FULFILMENT', frequencia: '1x no dia', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'FLUXO PNC', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'MONTAGEM AG (SAROBA)', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'MONTAGEM DE MOLHO', frequencia: 'Diariamente no TC', criticidade_base: 'Médio' },
  { area: 'Armazém', nome: 'PICK & PACK', frequencia: 'Diariamente no TC', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'PRÉ-PICKING - CHOPP', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'PRÉ-PICKING - MARKET PLACE', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'PRESTAÇÃO DE CONTA FÍSICA E CONTÁBIL', frequencia: 'Diariamente no TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'PROCESSO DE REPACK', frequencia: 'Diariamente no TA e TB', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'REABASTECIMENTO PICKING DURANTE O CARREGAMENTO - TC', frequencia: 'Diariamente no TC', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'RECOLHA QUEBRA AG E PA', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'REINTEGRALIZAÇÃO DE DEVOLUÇÃO', frequencia: 'Diariamente no TA', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'RESSUPRIMENTO DE PICKING', frequencia: 'Diariamente no TA', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'SEPARAÇÃO DE RESIDUOS', frequencia: 'Sob Demanda', criticidade_base: 'Baixo' },
  { area: 'Armazém', nome: 'ABASTECIMENTO EMPILHADEIRA/ MÁQUINA DE LIMPEZA - GÁS P20', frequencia: 'Diariamente', criticidade_base: 'Alto' },
  { area: 'Armazém', nome: 'ABASTECIMENTO FROTA FIXA (INTERNO)', frequencia: 'Diariamente', criticidade_base: 'Alto' },
  { area: 'Armazém', nome: 'CARREGAMENTO FRETEIRO - CARGA SECA', frequencia: 'Diariamente', criticidade_base: 'Alto' },
  { area: 'Oficina', nome: 'CHECKLIST DE EQUIPAMENTOS DE ELEVAÇÃO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE PNEU', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'REMENDO DE PNEU', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'MONTAGEM DE PNEU', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'DESMONTAGEM DE PNEU', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'CALIBRAGEM', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'MELIMETRAGEM', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'MARCAÇÃO DE PNEUS', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'INSPEÇÃO PRÉ USO DE FERRAMENTAS', frequencia: 'Varias vezes ao dia', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE LÂMPADAS BUZINA E LANTERNA', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE FUZIVEIS', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'ELIMIAÇÃO DE CURTOS', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE BATERIA', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE SENSOR DE CINTO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'INSTALAÇÃO DE SIRENE DE RÉ', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE FILTROS', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE ÓLEO DE MOTO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE ÓLEO DE CÂMBIO E DIFERÊNCIAL', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'ELIMINAR VAZAMENTO DE ÓLEO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'ELIMINAR VAZAMENTO DE AR', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE FREIOS', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'REGULAGE DE FREIOS', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE CINTO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE FECHADURA', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE BANCO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TROCA DE CÂMBIO DE EMBREAGEM', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'RECARGA DE BATERIAS', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TRAVA MECÂNICA', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'SUPORTE DE ESTEPE', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'PORTA DA BAIA', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'CONTRA BALANÇO', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'LEVANTA FIO E TOMADA DE AR', frequencia: 'sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'BORRACHA DA BAIA', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'LUBRIFICAR TRILHOS', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'PUXADOR DE BAIA E ALÇA DE APOIO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'KIT ERGONÔMICO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'SOLDA DAS DIVISORIAS', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'ANTI GUILHOTINA', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'TRAVA DA PLATAFORMA', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'ESTRIBOS E PONTOS DE APOIO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'PASSA FIO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
  { area: 'Oficina', nome: 'SUPORTE DE CARRINHO', frequencia: 'Sob demanda', criticidade_base: 'Baixo' },
]

// ── Motor de cálculo (funções puras que replicam a Memória de cálculo) ──────────────────

const NIVEIS = ['Trivial', 'Baixo', 'Médio', 'Alto', 'Crítico'] as const
type Nivel = typeof NIVEIS[number]

const NIVEL_CSS: Record<string, string> = {
  Trivial:  'bg-gray-100 text-gray-600 border-gray-300',
  Baixo:    'bg-green-100 text-green-800 border-green-300',
  Médio:    'bg-yellow-100 text-yellow-800 border-yellow-300',
  Alto:     'bg-orange-100 text-orange-800 border-orange-300',
  Crítico:  'bg-red-100 text-red-700 border-red-300',
}

function nivelIdx(n: string) { const i = NIVEIS.indexOf(n as Nivel); return i < 0 ? 1 : i }
function subir(n: string, by = 1) { return NIVEIS[Math.min(NIVEIS.length - 1, nivelIdx(n) + by)] }
function descer(n: string, by = 1) { return NIVEIS[Math.max(0, nivelIdx(n) - by)] }

/** Criticidade inicial: desvios DTO 25=0→Baixo, 26≤25→Médio, senão→Alto. Base = piso. */
function criticidadeInicial(d25: number, d26: number, base: string): string {
  const c = d25 === 0 ? 'Baixo' : d26 <= d25 ? 'Médio' : 'Alto'
  return nivelIdx(base) > nivelIdx(c) ? base : c
}
/** Gatilho dispara quando os atos inseguros dos 2 meses recentes superam os 2 meses anteriores (intra-ano). */
function calcGatilho(atosAnt: number, atosRec: number): 'S' | 'N' { return atosRec > atosAnt ? 'S' : 'N' }
/** Risco final: gatilho S→sobe 1; abordagem≥atos→desce 1; senão mantém. */
function riscoFinal(cInicial: string, gat: 'S' | 'N', abordPos: number, atos: number): string {
  if (gat === 'S') return subir(cInicial)
  if (abordPos >= atos) return descer(cInicial)
  return cInicial
}
function periodicidadeDias(risco: string): number {
  return ({ Crítico: 15, Alto: 30, Médio: 45, Baixo: 60, Trivial: 60 } as Record<string, number>)[risco] ?? 60
}

// ── Normalização e datas ────────────────────────────────────────────────────────────────

function norm(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}
function parseData(s: string | null | undefined): Date | null {
  if (!s) return null
  const str = String(s).trim()
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
  const br = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) return new Date(+br[3], +br[2] - 1, +br[1])
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}
function anoDe(s: string | null | undefined): number | null {
  const d = parseData(s)
  if (d) return d.getFullYear()
  const m = String(s ?? '').match(/(20\d{2})/)
  return m ? +m[1] : null
}
function fmtData(d: Date | null): string {
  return d ? d.toLocaleDateString('pt-BR') : '—'
}
function semanaAtual(): { seg: Date; dom: Date } {
  const hoje = new Date()
  const dow = hoje.getDay()
  const seg = new Date(hoje); seg.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1))
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6)
  return { seg, dom }
}

// ── Tipos derivados ─────────────────────────────────────────────────────────────────────

interface LinhaCalc {
  ativ: DtoAtividade
  d25: number; d26: number
  atosRecentes: number; atosAnteriores: number; abordPos: number
  cInicial: string
  gatilho: 'S' | 'N'
  risco: string
  periodicidade: number
  ultimoDTO: Date | null
  vencimento: Date | null
  diasRestantes: number | null
  status: 'Vencido' | 'A vencer' | 'Em dia' | 'Nunca'
}

const ANO_ATUAL = new Date().getFullYear()
const ANO_ANTERIOR = ANO_ATUAL - 1
const HOJE = new Date(); HOJE.setHours(0, 0, 0, 0)
const MES_ATUAL = new Date().getMonth() + 1 // 1–12
const MESES_RECENTES   = [MES_ATUAL - 2, MES_ATUAL - 1].filter(m => m > 0)
const MESES_ANTERIORES = [MES_ATUAL - 4, MES_ATUAL - 3].filter(m => m > 0)
const NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const labelJanela = (meses: number[]) =>
  meses.length === 0 ? '—' : meses.map(m => NOMES_MESES[m - 1]).join('–') + `/${ANO_ATUAL}`
const LABEL_RECENTE  = labelJanela(MESES_RECENTES)
const LABEL_ANTERIOR = labelJanela(MESES_ANTERIORES)

function ehAtoInseguro(classificacao: string | null): boolean {
  return norm(classificacao).includes('ATO INSEGURO')
}
function ehAbordagemPositiva(classificacao: string | null): boolean {
  return norm(classificacao).includes('POSITIV')
}

// ── Badges ──────────────────────────────────────────────────────────────────────────────

function NivelBadge({ nivel }: { nivel: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${NIVEL_CSS[nivel] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>
      {nivel}
    </span>
  )
}
function StatusBadge({ status, dias }: { status: LinhaCalc['status']; dias: number | null }) {
  const map = {
    Vencido:    'bg-red-100 text-red-700 border-red-300',
    'A vencer': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'Em dia':   'bg-green-100 text-green-800 border-green-300',
    Nunca:      'bg-purple-100 text-purple-800 border-purple-300',
  }
  const txt = status === 'Nunca' ? 'Nunca realizado'
    : status === 'Vencido' ? `Vencido há ${Math.abs(dias ?? 0)}d`
    : status === 'A vencer' ? `Vence em ${dias}d`
    : `Em dia (${dias}d)`
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${map[status]}`}>{txt}</span>
}

function LinhaVincular({ nome, qtd, opcoes, vinculando, onVincular }: {
  nome: string; qtd: number; opcoes: string[]; vinculando: boolean
  onVincular: (alias: string, nomeAtividade: string) => void
}) {
  const [destino, setDestino] = useState('')
  const semBranco = nome !== '(atividade em branco)'
  return (
    <li className="flex flex-wrap items-center gap-2 py-1">
      <span>• <strong>{nome}</strong> — {qtd} observação(ões)</span>
      {semBranco && (
        <>
          <select
            value={destino}
            onChange={e => setDestino(e.target.value)}
            className="text-xs border border-orange-300 rounded px-1.5 py-0.5 bg-white text-orange-900"
          >
            <option value="">vincular a...</option>
            {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <button
            disabled={!destino || vinculando}
            onClick={() => onVincular(nome, destino)}
            className="text-xs font-medium px-2 py-0.5 rounded bg-orange-600 text-white disabled:opacity-40 hover:bg-orange-700"
          >
            {vinculando ? 'Vinculando...' : 'Vincular'}
          </button>
        </>
      )}
    </li>
  )
}

// ── Componente principal ────────────────────────────────────────────────────────────────

export default function DtoGerenciador() {
  const { usuario } = useAuth()
  const [atividades, setAtividades] = useState<DtoAtividade[]>([])
  const [observacoes, setObservacoes] = useState<DtoObservacao[]>([])
  const [relatos, setRelatos] = useState<Relato[]>([])
  const [avaliadores, setAvaliadores] = useState<DtoAvaliador[]>([])
  const [aliases, setAliases] = useState<DtoAtividadeAlias[]>([])
  const [vinculando, setVinculando] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [semeando, setSemeando] = useState(false)
  const [aba, setAba] = useState<'calendario' | 'fila' | 'responsavel' | 'cadastro'>('calendario')
  const [filtroArea, setFiltroArea] = useState('Todas')
  const [filtroStatus, setFiltroStatus] = useState<'Todos' | LinhaCalc['status']>('Todos')
  const [expand, setExpand] = useState<string | null>(null)
  const [exportandoImg, setExportandoImg] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [filtroFilaArea, setFiltroFilaArea] = useState('Todas')
  const [filtroFilaResp, setFiltroFilaResp] = useState('Todos')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [sincronizando, setSincronizando] = useState(false)

  async function sincronizarDatas() {
    setSincronizando(true)
    const pendentes = atividades.filter(a => !a.ultimo_dto_manual)
    const updates: { id: string; ultimo_dto_manual: string }[] = []
    for (const ativ of pendentes) {
      const dto = dtoPorAtividade.get(norm(ativ.nome_atividade))
      if (dto?.ultimo) {
        updates.push({ id: ativ.id, ultimo_dto_manual: dto.ultimo.toISOString().split('T')[0] })
      }
    }
    for (const u of updates) {
      await supabase.from('dto_atividades').update({ ultimo_dto_manual: u.ultimo_dto_manual }).eq('id', u.id)
    }
    setSincronizando(false)
    await carregar()
    alert(`${updates.length} de ${pendentes.length} atividade(s) atualizada(s) com o último DTO encontrado nas observações.`)
  }

  function exportarCSV() {
    const header = ['#', 'Atividade', 'Área', 'Responsável', 'Risco Final', 'Periodicidade (dias)', 'Status', 'Último DTO', 'Vencimento']
    const rows = filaExport.map((l, i) => [
      i + 1,
      l.ativ.nome_atividade,
      l.ativ.area,
      l.ativ.responsavel ?? '',
      l.risco,
      l.periodicidade,
      l.status + (l.diasRestantes !== null ? ` (${Math.abs(l.diasRestantes)}d)` : ''),
      fmtData(l.ultimoDTO),
      fmtData(l.vencimento),
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const { seg } = semanaAtual()
    a.download = `DTO_Fila_${seg.toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportarImagem() {
    if (!exportRef.current) return
    setExportandoImg(true)
    try {
      const canvas = await html2canvas(exportRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      const { seg, dom } = semanaAtual()
      a.download = `DTO_Semana_${seg.toLocaleDateString('pt-BR').replace(/\//g,'-')}_${dom.toLocaleDateString('pt-BR').replace(/\//g,'-')}.png`
      a.click()
    } finally {
      setExportandoImg(false)
    }
  }

  async function carregar() {
    if (!usuario) return
    setCarregando(true)
    const [{ data: ativ }, { data: obs }, { data: rel }, { data: av }, { data: ali }] = await Promise.all([
      supabase.from('dto_atividades').select('*').eq('filial', usuario.filial).order('area').order('nome_atividade'),
      supabase.from('dto_observacoes').select('*').eq('filial', usuario.filial),
      supabase.from('relatos').select('*').eq('filial', usuario.filial),
      supabase.from('dto_avaliadores').select('*').eq('filial', usuario.filial).eq('ativo', true).order('nome'),
      supabase.from('dto_atividade_aliases').select('*').eq('filial', usuario.filial),
    ])
    setAtividades(ativ ?? [])
    setObservacoes(obs ?? [])
    setAvaliadores(av ?? [])
    setRelatos(rel ?? [])
    setAliases(ali ?? [])
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [usuario?.filial])

  async function vincularAlias(alias: string, nomeAtividade: string) {
    if (!usuario) return
    setVinculando(alias)
    const { error } = await supabase.from('dto_atividade_aliases')
      .upsert({ filial: usuario.filial, alias, nome_atividade: nomeAtividade }, { onConflict: 'filial,alias' })
    if (error) {
      alert(`Não foi possível vincular "${alias}": ${error.message}`)
      setVinculando(null)
      return
    }
    await carregar()
    setVinculando(null)
  }

  async function semearBase() {
    if (!usuario) return
    setSemeando(true)
    const linhas = SEED_ATIVIDADES.map(s => ({
      filial: usuario.filial,
      area: s.area,
      nome_atividade: s.nome,
      frequencia_atividade: s.frequencia,
      criticidade_base: s.criticidade_base,
    }))
    for (let i = 0; i < linhas.length; i += 50) {
      await supabase.from('dto_atividades').upsert(linhas.slice(i, i + 50), { onConflict: 'filial,area,nome_atividade', ignoreDuplicates: true })
    }
    setSemeando(false)
    carregar()
  }

  async function atualizarAtiv(id: string, patch: Partial<DtoAtividade>) {
    await supabase.from('dto_atividades').update(patch).eq('id', id)
    setAtividades(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  }

  // ── Apelidos: nomes divergentes nas observações/relatos (acento, grafia) que apontam
  // para o nome oficial cadastrado em dto_atividades ──
  const aliasMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of aliases) m.set(norm(a.alias), a.nome_atividade)
    return m
  }, [aliases])
  function resolverNome(nome: string | null | undefined): string {
    const n = norm(nome)
    return n ? (aliasMap.get(n) ?? nome ?? '') : ''
  }

  // ── Agregados de relato por ATIVIDADE — janela móvel intra-2026 (2 meses recentes vs 2 anteriores) ──
  const relatoPorAtividade = useMemo(() => {
    const m = new Map<string, { atosRecentes: number; atosAnteriores: number; abordPos: number }>()
    for (const r of relatos) {
      const key = norm(resolverNome(r.atividade))
      if (!key) continue
      const d = parseData(r.data_ocorrencia)
      if (!d) continue
      const ano = d.getFullYear()
      const mes = d.getMonth() + 1
      if (!m.has(key)) m.set(key, { atosRecentes: 0, atosAnteriores: 0, abordPos: 0 })
      const acc = m.get(key)!
      if (ehAtoInseguro(r.classificacao)) {
        if (ano === ANO_ATUAL && MESES_RECENTES.includes(mes)) acc.atosRecentes++
        else if (ano === ANO_ATUAL && MESES_ANTERIORES.includes(mes)) acc.atosAnteriores++
      } else if (ehAbordagemPositiva(r.classificacao) && ano === ANO_ATUAL && MESES_RECENTES.includes(mes)) {
        acc.abordPos++
      }
    }
    return m
  }, [relatos, aliasMap])

  // ── Desvios DTO + último DTO por atividade (match por nome normalizado, com apelidos) ──
  const dtoPorAtividade = useMemo(() => {
    const m = new Map<string, { d25: number; d26: number; ultimo: Date | null }>()
    for (const o of observacoes) {
      const key = norm(resolverNome(o.atividade))
      if (!key) continue
      if (!m.has(key)) m.set(key, { d25: 0, d26: 0, ultimo: null })
      const acc = m.get(key)!
      const ano = anoDe(o.data_aplicacao)
      const desvio = norm(o.houve_desvio) === 'SIM'
      if (desvio && ano === ANO_ANTERIOR) acc.d25++
      else if (desvio && ano === ANO_ATUAL) acc.d26++
      const d = parseData(o.data_aplicacao)
      if (d && (!acc.ultimo || d > acc.ultimo)) acc.ultimo = d
    }
    return m
  }, [observacoes, aliasMap])

  // ── Observações cuja atividade não bate com nenhum cadastro ativo, mesmo após aplicar
  // os apelidos (nome divergente sem apelido, atividade desativada/excluída ou em branco) ──
  const observacoesNaoReconhecidas = useMemo(() => {
    const nomesAtivos = new Set(atividades.filter(a => a.ativo).map(a => norm(a.nome_atividade)))
    const m = new Map<string, number>()
    for (const o of observacoes) {
      const key = norm(resolverNome(o.atividade))
      if (key && nomesAtivos.has(key)) continue
      const nome = o.atividade?.trim() || '(atividade em branco)'
      m.set(nome, (m.get(nome) ?? 0) + 1)
    }
    return Array.from(m.entries()).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd)
  }, [observacoes, atividades, aliasMap])

  const nomesAtividadesAtivas = useMemo(
    () => Array.from(new Set(atividades.filter(a => a.ativo).map(a => a.nome_atividade))).sort(),
    [atividades]
  )

  // ── Cálculo final por atividade ──
  const linhas = useMemo<LinhaCalc[]>(() => {
    return atividades.filter(a => a.ativo).map(ativ => {
      const dto = dtoPorAtividade.get(norm(ativ.nome_atividade)) ?? { d25: 0, d26: 0, ultimo: null }
      const rel = relatoPorAtividade.get(norm(ativ.nome_atividade)) ?? { atosRecentes: 0, atosAnteriores: 0, abordPos: 0 }
      const cInicial = criticidadeInicial(dto.d25, dto.d26, ativ.criticidade_base)
      const gatilho = calcGatilho(rel.atosAnteriores, rel.atosRecentes)
      const risco = riscoFinal(cInicial, gatilho, rel.abordPos, rel.atosRecentes)
      const periodicidade = periodicidadeDias(risco)
      const ultimoDTO = ativ.ultimo_dto_manual ? parseData(ativ.ultimo_dto_manual) : dto.ultimo
      let vencimento: Date | null = null
      let diasRestantes: number | null = null
      let status: LinhaCalc['status'] = 'Nunca'
      if (ultimoDTO) {
        vencimento = new Date(ultimoDTO); vencimento.setDate(vencimento.getDate() + periodicidade)
        diasRestantes = Math.round((vencimento.getTime() - HOJE.getTime()) / 86400000)
        status = diasRestantes < 0 ? 'Vencido' : diasRestantes <= 7 ? 'A vencer' : 'Em dia'
      }
      return { ativ, d25: dto.d25, d26: dto.d26, atosRecentes: rel.atosRecentes, atosAnteriores: rel.atosAnteriores, abordPos: rel.abordPos, cInicial, gatilho, risco, periodicidade, ultimoDTO, vencimento, diasRestantes, status }
    })
  }, [atividades, dtoPorAtividade, relatoPorAtividade])

  const areas = ['Todas', ...Array.from(new Set(atividades.map(a => a.area)))]

  // ordena: status (Nunca/Vencido primeiro) → risco desc → dias asc
  const ordemStatus = { Nunca: 0, Vencido: 1, 'A vencer': 2, 'Em dia': 3 }
  const linhasOrdenadas = [...linhas].sort((a, b) =>
    ordemStatus[a.status] - ordemStatus[b.status] ||
    nivelIdx(b.risco) - nivelIdx(a.risco) ||
    (a.diasRestantes ?? -9999) - (b.diasRestantes ?? -9999)
  )
  const linhasFiltradas = linhasOrdenadas.filter(l =>
    (filtroArea === 'Todas' || l.ativ.area === filtroArea) &&
    (filtroStatus === 'Todos' || l.status === filtroStatus)
  )

  // KPIs
  const totalAtiv = linhas.length
  const vencidos = linhas.filter(l => l.status === 'Vencido' || l.status === 'Nunca').length
  const aVencer = linhas.filter(l => l.status === 'A vencer').length
  const criticos = linhas.filter(l => l.risco === 'Crítico' || l.risco === 'Alto').length

  // Fila da semana = vencidos + a vencer
  const fila = linhasOrdenadas.filter(l => l.status === 'Vencido' || l.status === 'Nunca' || l.status === 'A vencer')

  // Fila filtrada (usada na aba e nos exports)
  const areasNaFila = ['Todas', ...Array.from(new Set(fila.map(l => l.ativ.area)))]
  const respsNaFila = ['Todos', ...Array.from(new Set(fila.map(l => l.ativ.responsavel?.trim() || 'Sem responsável')))]
  const filaFiltrada = fila.filter(l =>
    (filtroFilaArea === 'Todas' || l.ativ.area === filtroFilaArea) &&
    (filtroFilaResp === 'Todos' || (l.ativ.responsavel?.trim() || 'Sem responsável') === filtroFilaResp)
  )
  const filaExport = selecionados.size > 0
    ? filaFiltrada.filter(l => selecionados.has(l.ativ.id))
    : filaFiltrada

  // Por responsável
  const porResp = useMemo(() => {
    const m = new Map<string, LinhaCalc[]>()
    for (const l of fila) {
      const r = l.ativ.responsavel?.trim() || 'Sem responsável'
      if (!m.has(r)) m.set(r, [])
      m.get(r)!.push(l)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [fila])

  function exportar() {
    const dados = linhasOrdenadas.map(l => ({
      'Área': l.ativ.area, 'Atividade': l.ativ.nome_atividade,
      'Criticidade Base': l.ativ.criticidade_base, 'Criticidade Inicial': l.cInicial,
      ['Desvios DTO ' + ANO_ANTERIOR]: l.d25, ['Desvios DTO ' + ANO_ATUAL]: l.d26,
      ['Atos Inseguros ' + LABEL_ANTERIOR]: l.atosAnteriores, ['Atos Inseguros ' + LABEL_RECENTE]: l.atosRecentes,
      ['Abordagem Positiva ' + LABEL_RECENTE]: l.abordPos, 'Gatilho': l.gatilho,
      'Risco Final': l.risco, 'Periodicidade (dias)': l.periodicidade,
      'Último DTO': fmtData(l.ultimoDTO), 'Vencimento': fmtData(l.vencimento),
      'Status': l.status, 'Responsável': l.ativ.responsavel ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(dados); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Gerenciador DTO')
    XLSX.writeFile(wb, `Gerenciador_DTO_${usuario?.filial}_${HOJE.toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  }

  if (!usuario) return null

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gerenciador de DTOs</h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial} · criticidade e calendarização automáticas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} disabled={carregando} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
          {atividades.length > 0 && (
            <button onClick={exportar} className="flex items-center gap-2 text-sm text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50">
              <Download size={14} /> Exportar
            </button>
          )}
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 size={24} className="animate-spin mr-2" /> Carregando...</div>
      ) : atividades.length === 0 ? (
        <div className="text-center py-16">
          <Database size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500 mb-4">Nenhuma atividade cadastrada. Importe a base oficial (Armazém + Oficina) para começar.</p>
          <button onClick={semearBase} disabled={semeando} className="inline-flex items-center gap-2 bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-60">
            {semeando ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
            Importar base de atividades ({SEED_ATIVIDADES.length})
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { lb: 'Atividades', value: totalAtiv, icon: ListChecks, cor: 'text-gray-900' },
              { lb: 'Vencidos / Nunca', value: vencidos, icon: AlertTriangle, cor: vencidos > 0 ? 'text-red-600' : 'text-gray-900' },
              { lb: 'A vencer (7d)', value: aVencer, icon: CalendarClock, cor: aVencer > 0 ? 'text-yellow-600' : 'text-gray-900' },
              { lb: 'Alto / Crítico', value: criticos, icon: Zap, cor: criticos > 0 ? 'text-orange-600' : 'text-gray-900' },
            ].map(({ lb, value, icon: Icon, cor }) => (
              <div key={lb} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-gray-50 text-gray-500"><Icon size={20} /></div>
                <div>
                  <p className="text-xs text-gray-500">{lb}</p>
                  <p className={`text-2xl font-bold ${cor}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Observações não reconhecidas — explica divergência de totais com a tela de Análise DTO */}
          {observacoesNaoReconhecidas.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-orange-900">
                    {observacoesNaoReconhecidas.reduce((s, d) => s + d.qtd, 0)} observação(ões) não entram nos cálculos acima
                  </p>
                  <p className="text-xs text-orange-800">
                    O nome da atividade na observação não bate com nenhuma atividade ativa cadastrada — por acento/grafia diferente,
                    atividade desativada ou campo em branco. Vincule abaixo ao nome oficial do cadastro (vale para sempre, não precisa
                    repetir quando a mesma planilha vier de novo) ou cadastre como atividade nova em "Cadastro".
                  </p>
                  <ul className="text-xs text-orange-800 space-y-0.5 pt-1">
                    {observacoesNaoReconhecidas.slice(0, 15).map(d => (
                      <LinhaVincular
                        key={d.nome}
                        nome={d.nome}
                        qtd={d.qtd}
                        opcoes={nomesAtividadesAtivas}
                        vinculando={vinculando === d.nome}
                        onVincular={vincularAlias}
                      />
                    ))}
                  </ul>
                  {observacoesNaoReconhecidas.length > 15 && (
                    <p className="text-xs text-orange-700">e mais {observacoesNaoReconhecidas.length - 15} nome(s)...</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
            {([
              ['calendario', 'Calendário', null],
              ['fila', 'Fila da Semana', fila.length],
              ['responsavel', 'Por Responsável', null],
              ['cadastro', 'Cadastro', null],
            ] as const).map(([id, label, badge]) => (
              <button key={id} onClick={() => setAba(id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5 ${aba === id ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
                {badge != null && badge > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">{badge}</span>}
              </button>
            ))}
          </div>

          {/* ── Calendário ── */}
          {aba === 'calendario' && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Área:</span>
                {areas.map(a => (
                  <button key={a} onClick={() => setFiltroArea(a)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroArea === a ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{a}</button>
                ))}
                <span className="text-xs text-gray-500 font-medium ml-3">Status:</span>
                {(['Todos', 'Vencido', 'Nunca', 'A vencer', 'Em dia'] as const).map(s => (
                  <button key={s} onClick={() => setFiltroStatus(s)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroStatus === s ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Atividade</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Crit. Inicial</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Gatilho</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Risco Final</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Periodic.</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Último DTO</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">Nenhuma atividade neste filtro</td></tr>}
                    {linhasFiltradas.map(l => {
                      const isExp = expand === l.ativ.id
                      return (
                        <Fragment key={l.ativ.id}>
                          <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setExpand(isExp ? null : l.ativ.id)}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                {isExp ? <ChevronUp size={12} className="text-gray-400 shrink-0" /> : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{l.ativ.nome_atividade}</p>
                                  <p className="text-xs text-gray-400">{l.ativ.area}{l.ativ.responsavel ? ` · ${l.ativ.responsavel}` : ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center"><NivelBadge nivel={l.cInicial} /></td>
                            <td className="px-3 py-2.5 text-center">
                              {l.gatilho === 'S'
                                ? <span className="inline-flex items-center gap-0.5 text-xs font-bold text-red-600"><Zap size={11} /> S</span>
                                : <span className="text-xs text-gray-400">N</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center"><NivelBadge nivel={l.risco} /></td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">{l.periodicidade}d</td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">{fmtData(l.ultimoDTO)}</td>
                            <td className="px-3 py-2.5 text-center"><StatusBadge status={l.status} dias={l.diasRestantes} /></td>
                          </tr>
                          {isExp && (
                            <tr>
                              <td colSpan={7} className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                  <MemoBox titulo={`Desvios DTO ${ANO_ANTERIOR} → ${ANO_ATUAL}`} val={`${l.d25} → ${l.d26}`} trend={l.d26 - l.d25} />
                                  <MemoBox titulo={`Atos inseguros ${LABEL_ANTERIOR} → ${LABEL_RECENTE}`} val={`${l.atosAnteriores} → ${l.atosRecentes}`} trend={l.atosRecentes - l.atosAnteriores} />
                                  <MemoBox titulo={`Abordagem positiva (${LABEL_RECENTE})`} val={String(l.abordPos)} trend={-l.abordPos} />
                                  <MemoBox titulo="Vencimento previsto" val={fmtData(l.vencimento)} />
                                </div>
                                <div className="mt-3 text-xs text-gray-500 bg-white rounded-lg border border-gray-100 p-3 leading-relaxed">
                                  <span className="font-semibold text-gray-700">Memória de cálculo:</span>{' '}
                                  Criticidade base <b>{l.ativ.criticidade_base}</b> + desvios DTO ({l.d25}→{l.d26}) ⇒ inicial <b>{l.cInicial}</b>.{' '}
                                  Gatilho <b>{l.gatilho}</b> {l.gatilho === 'S' ? `(atos ${LABEL_ANTERIOR}: ${l.atosAnteriores} → ${LABEL_RECENTE}: ${l.atosRecentes}) ⇒ sobe 1 nível` : l.abordPos >= l.atosRecentes ? `(abordagem ${l.abordPos} ≥ atos ${l.atosRecentes} em ${LABEL_RECENTE}) ⇒ desce 1 nível` : '⇒ mantém'}.{' '}
                                  Risco final <b>{l.risco}</b> ⇒ DTO a cada <b>{l.periodicidade} dias</b>.
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Fila da Semana ── */}
          {aba === 'fila' && (() => {
            const todosSelec = filaFiltrada.length > 0 && filaFiltrada.every(l => selecionados.has(l.ativ.id))
            function toggleTodos() {
              setSelecionados(prev => {
                const next = new Set(prev)
                if (todosSelec) filaFiltrada.forEach(l => next.delete(l.ativ.id))
                else filaFiltrada.forEach(l => next.add(l.ativ.id))
                return next
              })
            }
            function toggleItem(id: string) {
              setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
            }
            const label = selecionados.size > 0 ? `(${filaExport.length})` : 'todos'
            return (
              <div className="space-y-3">
                {/* Filtros */}
                {fila.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">Área:</span>
                      <div className="flex gap-1 flex-wrap">
                        {areasNaFila.map(a => (
                          <button key={a} onClick={() => setFiltroFilaArea(a)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroFilaArea === a ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">Responsável:</span>
                      <select value={filtroFilaResp} onChange={e => setFiltroFilaResp(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
                        {respsNaFila.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Ações */}
                {filaFiltrada.length > 0 && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                      <input type="checkbox" checked={todosSelec} onChange={toggleTodos} className="accent-brand-700" />
                      {selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : 'Selecionar todos'}
                    </label>
                    <div className="flex items-center gap-2">
                      <button onClick={exportarCSV} disabled={filaExport.length === 0}
                        className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                        <Download size={14} /> CSV {label}
                      </button>
                      <button onClick={exportarImagem} disabled={exportandoImg || filaExport.length === 0}
                        className="flex items-center gap-2 text-sm text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-40">
                        {exportandoImg ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                        Imagem {label}
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {filaFiltrada.length === 0
                    ? <p className="text-center py-12 text-gray-400">Nenhum DTO para os filtros selecionados.</p>
                    : <div className="divide-y divide-gray-100">
                        {filaFiltrada.map((l, i) => (
                          <div key={l.ativ.id} className="px-4 py-3 flex items-center gap-3">
                            <input type="checkbox" checked={selecionados.has(l.ativ.id)} onChange={() => toggleItem(l.ativ.id)} className="accent-brand-700 shrink-0" />
                            <span className="text-xs font-bold text-gray-300 w-5 text-right shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{l.ativ.nome_atividade}</p>
                              <p className="text-xs text-gray-400">{l.ativ.area} · {l.ativ.responsavel?.trim() || 'sem responsável'} · último DTO {fmtData(l.ultimoDTO)}</p>
                            </div>
                            <NivelBadge nivel={l.risco} />
                            <StatusBadge status={l.status} dias={l.diasRestantes} />
                          </div>
                        ))}
                      </div>}
                </div>

                {/* Template oculto para exportação de imagem */}
                <FilaExportTemplate ref={exportRef} fila={filaExport} filial={usuario.filial} />
              </div>
            )
          })()}

          {/* ── Por Responsável ── */}
          {aba === 'responsavel' && (
            <div className="space-y-4">
              {porResp.length === 0 && <p className="text-center py-12 text-gray-400">Fila vazia.</p>}
              {porResp.map(([resp, items]) => (
                <div key={resp} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users size={14} className="text-gray-400" /> {resp}</span>
                    <span className="text-xs text-gray-500">{items.length} DTO(s) na fila</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map(l => (
                      <div key={l.ativ.id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{l.ativ.nome_atividade}</p>
                          <p className="text-xs text-gray-400">{l.ativ.area}</p>
                        </div>
                        <NivelBadge nivel={l.risco} />
                        <StatusBadge status={l.status} dias={l.diasRestantes} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Cadastro ── */}
          {aba === 'cadastro' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 gap-4">
                <p className="text-xs text-blue-800">Edite a criticidade base (piso), o responsável e a data do último DTO. Os cálculos atualizam automaticamente.</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={sincronizarDatas} disabled={sincronizando}
                    className="flex items-center gap-1.5 text-xs text-green-700 border border-green-300 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-60">
                    {sincronizando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Sincronizar com observações
                  </button>
                  <button onClick={semearBase} disabled={semeando} className="flex items-center gap-1.5 text-xs text-blue-700 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-60">
                    {semeando ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />} Reimportar base
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Atividade</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">
                        <span className="flex items-center justify-center gap-1">
                          Crit. Base
                          <span className="group relative inline-flex">
                            <span className="w-3.5 h-3.5 rounded-full bg-gray-300 text-white text-[9px] font-bold flex items-center justify-center cursor-default leading-none">?</span>
                            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 rounded-lg bg-gray-800 text-white text-[11px] leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg whitespace-normal text-left font-normal">
                              Piso de criticidade definido pela <strong>Avaliação de Riscos</strong> da atividade. O motor pode elevar acima deste valor, mas nunca cair abaixo.
                            </span>
                          </span>
                        </span>
                      </th>
                      <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Responsável</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Último DTO (manual)</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Ativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...atividades].sort((a, b) => a.area.localeCompare(b.area) || a.nome_atividade.localeCompare(b.nome_atividade)).map(a => (
                      <tr key={a.id} className="border-b border-gray-50">
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-800 text-sm">{a.nome_atividade}</p>
                          <p className="text-xs text-gray-400">{a.area} · {a.frequencia_atividade}</p>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <select value={a.criticidade_base} onChange={e => atualizarAtiv(a.id, { criticidade_base: e.target.value })}
                            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
                            {['Baixo', 'Médio', 'Alto', 'Crítico'].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {avaliadores.length > 0 ? (
                            <select
                              value={a.responsavel ?? ''}
                              onChange={e => atualizarAtiv(a.id, { responsavel: e.target.value || null })}
                              className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                            >
                              <option value="">— sem responsável —</option>
                              {avaliadores.map(av => <option key={av.id} value={av.nome}>{av.nome}</option>)}
                            </select>
                          ) : (
                            <input type="text" defaultValue={a.responsavel ?? ''} placeholder="—"
                              onBlur={e => { const v = e.target.value.trim(); if (v !== (a.responsavel ?? '')) atualizarAtiv(a.id, { responsavel: v || null }) }}
                              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="date" defaultValue={a.ultimo_dto_manual ?? ''}
                            onBlur={e => { const v = e.target.value; if (v !== (a.ultimo_dto_manual ?? '')) atualizarAtiv(a.id, { ultimo_dto_manual: v || null }) }}
                            className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={a.ativo} onChange={e => atualizarAtiv(a.id, { ativo: e.target.checked })} className="accent-brand-700" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const RISCO_COLOR: Record<string, string> = {
  Crítico: '#dc2626', Alto: '#ea580c', Médio: '#ca8a04', Baixo: '#16a34a', Trivial: '#6b7280',
}

const FilaExportTemplate = forwardRef<HTMLDivElement, {
  fila: LinhaCalc[]
  filial: string
}>(function FilaExportTemplate({ fila, filial }, ref) {
  const { seg, dom } = semanaAtual()
  const semana = `${seg.toLocaleDateString('pt-BR')} a ${dom.toLocaleDateString('pt-BR')}`
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: '10px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: '12px', verticalAlign: 'middle' }

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '720px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Gerenciador de DTOs</p>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Fila da Semana</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0 }}>{filial}<br />{semana}</p>
      </div>

      {/* Tabela compacta */}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <thead>
          <tr style={{ background: '#1e3a5f' }}>
            <th style={{ ...th, width: '32px', textAlign: 'center' }}>#</th>
            <th style={th}>Atividade</th>
            <th style={{ ...th, width: '90px', textAlign: 'center' }}>Risco</th>
            <th style={{ ...th, width: '110px', textAlign: 'center' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {fila.map((l, i) => {
            const cor = RISCO_COLOR[l.risco] ?? '#6b7280'
            const statusCor = l.status === 'Vencido' ? '#dc2626' : l.status === 'Nunca' ? '#7c3aed' : '#d97706'
            const statusTxt = l.status === 'Vencido'
              ? `Vencido há ${Math.abs(l.diasRestantes ?? 0)}d`
              : l.status === 'Nunca' ? 'Nunca realizado'
              : `Vence em ${l.diasRestantes}d`
            const bg = i % 2 === 0 ? '#fff' : '#f8fafc'
            return (
              <tr key={l.ativ.id} style={{ background: bg, borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#94a3b8', fontSize: '11px' }}>{i + 1}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{l.ativ.nome_atividade}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {l.ativ.area}{l.ativ.responsavel ? ` · ${l.ativ.responsavel}` : ''}
                    {l.ultimoDTO ? ` · Último: ${fmtData(l.ultimoDTO)}` : ''}
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ fontWeight: 800, color: cor, fontSize: '13px' }}>{l.risco}</span>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{l.periodicidade}d</div>
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: statusCor, background: `${statusCor}15`, padding: '3px 8px', borderRadius: '999px', border: `1px solid ${statusCor}35`, whiteSpace: 'nowrap' }}>
                    {statusTxt}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Rodapé */}
      <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
        <span>Gerado em {HOJE.toLocaleDateString('pt-BR')}</span>
        <span>Total: {fila.length} DTO(s) na fila</span>
      </div>
    </div>
  )
})

function MemoBox({ titulo, sub, val, trend }: { titulo: string; sub?: string; val: string; trend?: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
      <p className="text-xs text-gray-400">{titulo} {sub && <span className="text-gray-300">{sub}</span>}</p>
      <p className="text-sm font-semibold text-gray-800 mt-0.5 flex items-center gap-1">
        {val}
        {trend != null && trend !== 0 && (
          trend > 0 ? <TrendingUp size={12} className="text-red-500" /> : <TrendingDown size={12} className="text-green-500" />
        )}
        {trend === 0 && <Minus size={12} className="text-gray-300" />}
      </p>
    </div>
  )
}

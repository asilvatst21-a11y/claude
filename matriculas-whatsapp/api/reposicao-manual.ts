/// <reference types="node" />
import { createClient } from '@supabase/supabase-js'

// Lançamento manual de reposição — o operador cola exatamente o mesmo texto
// que mandaria no grupo do WhatsApp (ex.: "falta 2 cx de skol no pdv 11509,
// mapa 277834"), o sistema interpreta com a MESMA IA usada pelo bot
// (extrairReposicaoIA, espelhado de api/zapi-webhook.ts) e mostra os campos
// pra conferir antes de registrar. Existe porque o bot está fora do ar
// (número em análise no WhatsApp por disparo em massa — ver
// src/lib/whatsappStatus.ts) e a reposição precisa continuar sendo
// registrada enquanto isso.
//
// As checagens de negócio do bot (PDV sem venda, produto fora do pedido,
// mapa divergente/inexistente na base do dia) aqui viram AVISOS, não
// bloqueios — quem está lançando é uma pessoa que pode decidir se segue
// mesmo assim, diferente do motorista no WhatsApp.

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
const ANTHROPIC_MODEL = 'claude-haiku-4-5'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface ReposicaoIA {
  eh_reposicao: boolean
  multiplos_itens: boolean
  codigo_pdv: string
  mapa: string
  produto: string
  quantidade: string
  tipo_reposicao: 'falta' | 'inversao' | 'avaria' | 'troca' | 'remessa' | 'indefinido'
  embalagem: 'unidade' | 'fardo' | 'indefinido'
}

const TIPO_LABEL: Record<string, string> = {
  falta: 'Falta', inversao: 'Inversão', avaria: 'Avaria', troca: 'Troca', remessa: 'Simples Remessa', indefinido: 'Não informado',
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim()
}

// Expande sinônimos/abreviações comuns dos motoristas (mesma tabela do webhook).
function expandirSinonimos(palavra: string): string[] {
  const SIN: Record<string, string[]> = {
    ap: ['ap', 'antarctica'], antartica: ['antartica', 'antarctica'], bc: ['bc', 'brahma chopp'],
    sk: ['sk', 'skol'], gca: ['gca', 'guarana'],
    litro: ['litro', '1l'], litrao: ['litrao', '1l'], latao: ['latao', '473'], lata: ['lata', '350'],
  }
  return SIN[palavra] ?? [palavra]
}

async function ultimaDataVendas(): Promise<string | null> {
  const { data } = await supabase.from('vendas_dia').select('data').order('data', { ascending: false }).limit(1).maybeSingle()
  return data?.data ?? null
}

async function produtosVendidosPdv(pdvCod: number, data: string): Promise<{ codigo: number; descricao: string; nomeCsv: string }[]> {
  const { data: vendas } = await supabase.from('vendas_dia').select('produto_codigo, produto_nome').eq('data', data).eq('pdv_codigo', pdvCod)
  if (!vendas || vendas.length === 0) return []
  const codigos = [...new Set(vendas.map((v: any) => v.produto_codigo).filter(Boolean))]
  const { data: cat } = await supabase.from('produtos').select('codigo, descricao').in('codigo', codigos)
  const mapa = new Map((cat ?? []).map((p: any) => [p.codigo, p.descricao]))
  return codigos.map((c: any) => {
    const nomeCsv = String(vendas.find((v: any) => v.produto_codigo === c)?.produto_nome ?? '')
    return { codigo: c, descricao: mapa.get(c) ?? nomeCsv, nomeCsv }
  })
}

async function buscarMapaRealPdv(pdvCod: number, data: string): Promise<string | null> {
  const { data: rows } = await supabase
    .from('vendas_dia').select('mapa').eq('data', data).eq('pdv_codigo', pdvCod).not('mapa', 'is', null).limit(1)
  return normMapa(rows?.[0]?.mapa) || null
}

async function buscarProdutosContexto(pdvCodigo: string): Promise<string> {
  try {
    const data = await ultimaDataVendas()
    const pdvCod = parseInt((pdvCodigo ?? '').replace(/\D/g, ''))
    if (data && pdvCod) {
      const vendidos = await produtosVendidosPdv(pdvCod, data)
      if (vendidos.length > 0) {
        const lista = vendidos.filter((v) => v.descricao).map((v) => `${v.codigo} - ${v.descricao}`).join('\n')
        return `\n\nProdutos que ESTE PDV (${pdvCod}) comprou no pedido. Use estes nomes ao identificar o produto:\n${lista}`
      }
    }
    return ''
  } catch {
    return ''
  }
}

type VendasInfo =
  | { situacao: 'sem-csv' }
  | { situacao: 'pdv-sem-venda'; data: string }
  | { situacao: 'ok'; data: string; produtoNoPedido: boolean; produtoCanon: string | null }

async function avaliarVendas(pdvCodigo: string, termoProduto: string): Promise<VendasInfo> {
  const data = await ultimaDataVendas()
  if (!data) return { situacao: 'sem-csv' }

  const pdvCod = parseInt((pdvCodigo ?? '').replace(/\D/g, ''))
  if (!pdvCod) return { situacao: 'pdv-sem-venda', data }

  const vendidos = await produtosVendidosPdv(pdvCod, data)
  if (vendidos.length === 0) return { situacao: 'pdv-sem-venda', data }

  const mCod = termoProduto.match(/^\s*0*(\d{2,7})\s*(?:-|$)/)
  const codTermo = mCod ? parseInt(mCod[1]) : NaN
  const termoTexto = mCod ? termoProduto.slice(mCod[0].length) : termoProduto
  const palavras = semAcento(termoTexto).split(/\s+/).filter((p) => p.length >= 2)
  const hay = (v: { descricao: string; nomeCsv: string }) => semAcento(`${v.descricao} ${v.nomeCsv}`)
  const casa = (palavra: string, h: string) => expandirSinonimos(palavra).some((syn) => h.includes(syn))

  const matches = vendidos.filter((v) => {
    if (codTermo && v.codigo === codTermo) {
      // Mesma checagem de src/../api/zapi-webhook.ts::avaliarVendas — o
      // código bateu, mas se veio texto de descrição junto ele precisa
      // concordar com o catálogo pra esse código, senão pode ser um código
      // reaproveitado/desatualizado (bug real: PDV 20170, produto 34770
      // digitado como "Pomelo Sugar Free" batendo num cadastro de "Melancia").
      if (palavras.length > 0 && !palavras.some((p) => casa(p, hay(v)))) return false
      return true
    }
    if (palavras.length === 0) return false
    const h = hay(v)
    return palavras.every((p) => casa(p, h))
  })
  // (Removido o fallback de "tenta com a 1ª palavra" — mesmo motivo de
  // api/zapi-webhook.ts::avaliarVendas: uma palavra genérica sozinha (ex.:
  // "energetico", vindo do nome abreviado do faturamento) achava um único
  // produto no pedido e cravava, mesmo sendo outro sabor/variante. Bug real:
  // PDV 20170, "Energético Red Bull Sugar Free Pomelo..." casou com
  // "RED BULL SUGAR FREE BR" só pela primeira palavra.)

  const produtoNoPedido = matches.length > 0
  const produtoCanon = matches.length === 1 ? `${matches[0].codigo} - ${matches[0].descricao}` : null
  return { situacao: 'ok', data, produtoNoPedido, produtoCanon }
}

function normMapa(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '').replace(/^0+/, '')
}

async function validarMapaBase(mapa: string | null, filial: string): Promise<'sem_base' | 'nao_encontrado' | 'ok'> {
  const { data: ult } = await supabase
    .from('mapa_equipe').select('data').eq('filial', filial).order('data', { ascending: false }).limit(1).maybeSingle()
  if (!ult?.data) return 'sem_base'
  const alvo = normMapa(mapa)
  if (!alvo) return 'nao_encontrado'
  const { data: rows } = await supabase.from('mapa_equipe').select('mapa').eq('data', ult.data).eq('filial', filial)
  const achou = (rows ?? []).some((r: any) => normMapa(r.mapa) === alvo)
  return achou ? 'ok' : 'nao_encontrado'
}

async function buscarNomePdv(codigo: string): Promise<string | null> {
  if (!codigo) return null
  const cod = parseInt(codigo.replace(/\D/g, ''))
  if (!cod) return null
  const { data } = await supabase.from('pdvs').select('nome_fantasia').eq('codigo', cod).maybeSingle()
  return data?.nome_fantasia?.trim() || null
}

async function extrairReposicaoIA(texto: string): Promise<ReposicaoIA> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada')
  const pdvMatch = texto.match(/\b(?:pdv|cliente|loja|cli)\D{0,3}(\d{3,6})\b/i)?.[1]
    ?? texto.match(/\b(\d{4,6})\b/)?.[1] ?? ''
  const catalogo = await buscarProdutosContexto(pdvMatch)
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      system:
        'Você analisa mensagens de motoristas de entrega enviadas em um grupo de WhatsApp. ' +
        'A mensagem pode ser uma solicitação de reposição de produto (falta, inversão, avaria, troca ou simples remessa) ' +
        'ou apenas uma conversa qualquer. Extraia os campos solicitados. ' +
        'Se a mensagem NÃO for uma solicitação de reposição, defina eh_reposicao=false. ' +
        'multiplos_itens: defina true SOMENTE quando a mensagem pedir reposição de mais de um produto DISTINTO ' +
        '(ex: "falta 2 cx de H2OH e 3 fardos de Skol"). Quantidade alta de um mesmo produto NÃO conta como múltiplos itens. ' +
        'Quando multiplos_itens=true, preencha os demais campos apenas com o primeiro item (ou deixe vazios se ambíguo). ' +
        'Campos não informados devem ficar como string vazia. ' +
        'tipo_reposicao: "falta" (produto não entregue/faltou), "inversao" (veio o item errado na carga/separação), ' +
        '"avaria" (produto quebrado/amassado/vazado/estragado), "troca" (cliente pediu troca/devolução do produto), ' +
        '"remessa" (pedido simples de envio extra de produto ao cliente, sem nenhum problema associado — ' +
        'ex: "cliente pediu mais 2 cx de skol", "manda uma remessa simples de 5 un de guaraná pro pdv X"), ' +
        'ou "indefinido" se não der pra saber. ' +
        'embalagem: "unidade" (produto avulso, unidade, garrafa/lata solta) ou "fardo" (fardo, pacote, caixa fechada, engradado); ' +
        'use "indefinido" se a mensagem não deixar claro se é unidade ou fardo. ' +
        'Para o campo "produto", use o nome padronizado do catálogo se conseguir identificar, ' +
        'incluindo o código numérico se mencionado.' + catalogo,
      messages: [{ role: 'user', content: texto }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              eh_reposicao: { type: 'boolean' },
              multiplos_itens: { type: 'boolean' },
              codigo_pdv: { type: 'string' },
              mapa: { type: 'string' },
              produto: { type: 'string' },
              quantidade: { type: 'string' },
              tipo_reposicao: { type: 'string', enum: ['falta', 'inversao', 'avaria', 'troca', 'remessa', 'indefinido'] },
              embalagem: { type: 'string', enum: ['unidade', 'fardo', 'indefinido'] },
            },
            required: ['eh_reposicao', 'multiplos_itens', 'codigo_pdv', 'mapa', 'produto', 'quantidade', 'tipo_reposicao', 'embalagem'],
            additionalProperties: false,
          },
        },
      },
    }),
  })
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => '')
    throw new Error(`Claude HTTP ${resp.status}: ${corpo}`)
  }
  const data: any = await resp.json()
  if (data.stop_reason === 'refusal') throw new Error('Claude refusal')
  const bloco = (data.content ?? []).find((b: any) => b.type === 'text')
  if (!bloco?.text) throw new Error('Claude sem bloco de texto')
  return JSON.parse(bloco.text) as ReposicaoIA
}

// Mesmo sequencial usado no webhook — baseado no maior número já usado hoje.
async function gerarNumeroReposicao(): Promise<string> {
  const hoje = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const { data } = await supabase
    .from('reposicoes').select('numero').like('numero', `REP-${hoje}-%`).order('numero', { ascending: false }).limit(1)
  const ultimoSeq = data?.[0]?.numero ? parseInt(data[0].numero.slice(-3), 10) || 0 : 0
  const seq = String(ultimoSeq + 1).padStart(3, '0')
  return `REP-${hoje}-${seq}`
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ erro: 'method' }); return }
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {})
  const action = String(body.action ?? '')

  try {
    // ── Interpreta o texto colado (sem gravar nada ainda) ────────────────
    if (action === 'parse') {
      const texto = String(body.texto ?? '').trim()
      const filial = String(body.filial ?? '')
      if (!texto) { res.status(400).json({ erro: 'Cole o texto da mensagem.' }); return }

      let ia: ReposicaoIA
      try {
        ia = await extrairReposicaoIA(texto)
      } catch (e) {
        console.error('reposicao-manual parse: falha na IA', e)
        res.status(502).json({ erro: 'Não consegui interpretar a mensagem agora. Tente novamente em instantes.' })
        return
      }
      if (!ia.eh_reposicao) { res.status(200).json({ ehReposicao: false }); return }

      const avisos: string[] = []
      if (ia.multiplos_itens) {
        avisos.push('A mensagem parece pedir mais de um produto — só o primeiro item foi identificado. Lance os demais separadamente.')
      }

      let codigoPdv = ia.codigo_pdv
      let produto = ia.produto
      const [vendas, nomePdv] = await Promise.all([
        avaliarVendas(ia.codigo_pdv, ia.produto),
        buscarNomePdv(ia.codigo_pdv),
      ])
      const dataBR = (d: string) => d.split('-').reverse().join('/')

      if (vendas.situacao === 'pdv-sem-venda') {
        avisos.push(`O PDV ${ia.codigo_pdv || '?'} não tem venda registrada no faturamento de ${dataBR(vendas.data)}. Confira o código.`)
      }
      if (vendas.situacao === 'ok' && !vendas.produtoNoPedido) {
        avisos.push(`O produto "${ia.produto || '?'}" não consta no pedido do PDV ${ia.codigo_pdv} em ${dataBR(vendas.data)}. Confira antes de registrar.`)
      }
      if (vendas.situacao === 'ok' && vendas.produtoCanon) produto = vendas.produtoCanon
      if (nomePdv && ia.codigo_pdv && !codigoPdv.includes(nomePdv)) codigoPdv = `${ia.codigo_pdv} - ${nomePdv}`

      if (vendas.situacao === 'ok') {
        const pdvCod = parseInt(ia.codigo_pdv.replace(/\D/g, ''))
        const mapaReal = pdvCod ? await buscarMapaRealPdv(pdvCod, vendas.data) : null
        if (mapaReal && normMapa(mapaReal) !== normMapa(ia.mapa)) {
          avisos.push(`No faturamento de hoje, o PDV ${ia.codigo_pdv} está no mapa ${mapaReal}, não no mapa ${ia.mapa || '?'} identificado na mensagem.`)
        }
      }

      const mapaStatus = await validarMapaBase(ia.mapa, filial)
      if (mapaStatus === 'nao_encontrado') {
        avisos.push(`O mapa ${ia.mapa || '?'} não foi encontrado na base de hoje (Base/mapa e equipe). Confira antes de registrar.`)
      }

      res.status(200).json({
        ehReposicao: true,
        campos: {
          codigoPdv, mapa: ia.mapa, produto, quantidade: ia.quantidade,
          tipoReposicao: ia.tipo_reposicao, embalagem: ia.embalagem,
        },
        avisos,
      })
      return
    }

    // ── Confirma e grava a reposição ──────────────────────────────────────
    if (action === 'confirmar') {
      const filial = String(body.filial ?? '').trim()
      const motoristaNome = String(body.motoristaNome ?? '').trim()
      const motoristaTelefone = body.motoristaTelefone ? String(body.motoristaTelefone).trim() : null
      const mensagemOriginal = String(body.mensagemOriginal ?? '')
      const dados = body.dados ?? {}
      if (!filial || !motoristaNome) { res.status(400).json({ erro: 'Informe a filial e o nome do motorista.' }); return }

      const tipo = String(dados.tipoReposicao || 'indefinido')
      const embalagem = String(dados.embalagem || 'indefinido')
      const precisaValidacao = (tipo === 'falta' || tipo === 'inversao' || tipo === 'indefinido') &&
        (embalagem === 'fardo' || embalagem === 'caixa')

      let novaRep: { id: string; numero: string } | null = null
      let insErr: { code?: string; message?: string } | null = null
      for (let tentativa = 0; tentativa < 3 && !novaRep; tentativa++) {
        const numero = await gerarNumeroReposicao()
        const resultado = await supabase.from('reposicoes').insert({
          numero,
          filial,
          motorista_nome: motoristaNome,
          motorista_telefone: motoristaTelefone,
          codigo_pdv: dados.codigoPdv || null,
          cliente: dados.codigoPdv || null,
          mapa: dados.mapa || null,
          produto: dados.produto || null,
          quantidade: dados.quantidade || null,
          tipo_reposicao: tipo,
          embalagem,
          motivo: TIPO_LABEL[tipo] ?? null,
          mensagem_original: mensagemOriginal || null,
          status: precisaValidacao ? 'pendente' : 'registrado',
        }).select('id, numero').single()
        insErr = resultado.error
        novaRep = resultado.data
        if (insErr && insErr.code !== '23505') break
      }
      if (insErr || !novaRep) {
        console.error('reposicao-manual confirmar: erro ao inserir', insErr)
        res.status(500).json({ erro: insErr?.message ?? 'Erro ao registrar a reposição.' })
        return
      }
      res.status(200).json({ numero: novaRep.numero })
      return
    }

    res.status(400).json({ erro: 'Ação desconhecida.' })
  } catch (e) {
    console.error('reposicao-manual: erro', e)
    res.status(500).json({ erro: e instanceof Error ? e.message : 'Erro inesperado.' })
  }
}

// Geração de documentos de Fluxo Punitivo (Advertência / Suspensão) para impressão/PDF
// Os modelos seguem o padrão LOG20 (CLT art. 482 para advertências, carta de suspensão).

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']

const CNPJ_LOG20 = '13.631.347/0006-99'
const EMPRESA = 'LOG20 LOGÍSTICA S/A'

/** "2026-06-09" ou "09/06/2026" → "9 de junho de 2026" */
function dataExtenso(data: string | null): string {
  const d = parseData(data)
  if (!d) return ''
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

/** "2026-06-09" ou "09/06/2026" → "09/06/2026" */
function dataCurta(data: string | null): string {
  const d = parseData(data)
  if (!d) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function parseData(data: string | null): Date | null {
  if (!data) return new Date()
  const iso = data.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], 12)
  const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return new Date(+br[3], +br[2] - 1, +br[1], 12)
  return new Date()
}

/** Deriva a cidade a partir do nome da filial (remove prefixos CDD/CD) */
function cidadeDaFilial(filial: string): string {
  return filial.replace(/^CDD?\s+/i, '').trim() || filial
}

function diasExtenso(n: number): string {
  return EXTENSO[n] ? EXTENSO[n].toUpperCase() : String(n)
}

const ESTILO = `
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000;
           line-height: 1.45; margin: 0; padding: 28px 44px; }
    .logo { text-align: center; margin-bottom: 14px; }
    .logo img { height: 52px; }
    .data { text-align: right; margin-bottom: 18px; font-size: 10.5pt; }
    .titulo { text-align: center; font-weight: bold; font-size: 13pt;
              letter-spacing: 2px; margin: 16px 0; text-transform: uppercase; }
    .destinatario { font-weight: bold; margin-bottom: 12px; }
    .corpo { text-align: justify; margin-bottom: 10px; }
    .motivo { text-align: left; font-weight: bold; margin: 12px 0; line-height: 1.5; }
    .assinaturas { margin-top: 36px; }
    .linha-assinatura { margin-top: 28px; text-align: center; }
    .linha-assinatura .traco { border-top: 1px solid #000; width: 340px;
              margin: 0 auto 4px; }
    .testemunhas { display: flex; justify-content: space-between;
              margin-top: 28px; gap: 40px; }
    .testemunhas .col { flex: 1; text-align: center; }
    .testemunhas .traco { border-top: 1px solid #000; margin-bottom: 4px; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      body { padding: 18px 36px; font-size: 10.5pt; }
      .assinaturas { margin-top: 24px; }
      .testemunhas { margin-top: 20px; }
    }
  </style>
`

interface DadosDocumento {
  tipo: string
  nome: string
  motivo: string
  data: string | null
  dataInfracao?: string | null
  dias?: number | null
  filial: string
  origem?: string    // ← novo
}

function sentenceCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Compõe a frase da infração para o documento.
 * - Linha única: "Por falta injustificada no dia 09/06/2026."
 * - Multilinha (várias ocorrências do GSD): cabeçalho com a data + lista.
 * Aplica sentence case em cada item e usa frase diferente por origem.
 */
function fraseInfracao(motivo: string, dataInfracao: string | null, origem?: string): string {
  const texto = (motivo || '').trim()
  if (!texto) return '—'
  const dataStr = dataCurta(dataInfracao)

  // Extrai itens: pula linha de cabeçalho "N ocorrência(s)..." e remove numeração
  let items: string[]
  if (texto.includes('\n')) {
    const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean)
    items = linhas
      .filter(l => !/^\d+\s+ocorrência/i.test(l))
      .map(l => l.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
  } else {
    items = [texto]
  }
  if (items.length === 0) return '—'

  const itemsFmt = items.map(sentenceCase)
  const n = items.length
  const orig = (origem ?? '').toUpperCase()

  let cabecalho: string
  if (orig === 'GSDPQ') {
    const plural = n === 1 ? 'encontrada' : 'encontradas'
    const s = n === 1 ? 'ocorrência' : 'ocorrências'
    cabecalho = `${n} ${s} de segurança ${plural} em GSDPQ${dataStr ? ` no dia ${dataStr}` : ''}:`
  } else if (orig === 'RELATOS') {
    const s = n === 1 ? 'ocorrência' : 'ocorrências'
    cabecalho = `Por ter sido relatado ${n} ${s} de segurança${dataStr ? ` no dia ${dataStr}` : ''}:`
  } else {
    // Formato legado (outras origens ou sem origem)
    if (n === 1) {
      let frase = /^por\b/i.test(itemsFmt[0]) ? itemsFmt[0] : 'Por ' + lowerFirst(itemsFmt[0])
      frase = frase.replace(/[.\s]+$/, '') + (dataStr ? ` no dia ${dataStr}` : '')
      if (!frase.endsWith('.')) frase += '.'
      return escapeHtml(frase)
    }
    cabecalho = `${n} ocorrências${dataStr ? ` no dia ${dataStr}` : ''}:`
  }

  const corpo = itemsFmt.length === 1
    ? escapeHtml(itemsFmt[0])
    : itemsFmt.map((l, i) => escapeHtml(`${i + 1}. ${l}`)).join('<br/>')
  return escapeHtml(cabecalho) + '<br/>' + corpo
}

function docAdvertencia({ nome, motivo, data, dataInfracao, filial, origem }: DadosDocumento): string {
  const cidade = cidadeDaFilial(filial)
  return `
    <div class="logo"><img src="${location.origin}/logo.png" alt="LOG20" /></div>
    <div class="data">${cidade}, ${dataExtenso(data)}.</div>
    <div class="titulo">Aviso de Advertência</div>
    <div class="destinatario">SR (a): ${nome}</div>
    <div class="corpo">
      Na conformidade da Consolidação das Leis do Trabalho, fica advertido pelas
      faltas a seguir discriminadas:
    </div>
    <div class="motivo">${fraseInfracao(motivo, dataInfracao ?? null, origem)}</div>
    <div class="corpo">
      Não só esperamos que tome as necessárias providências a fim de que não se
      repitam as irregularidades acima discriminadas, como também aproveitamos para
      esclarecer-lhe que a repetição ou a prática de outra prevista em nossos
      Regulamentos, Ordens de Serviços, Comunicações, etc., irá contribuir
      desfavoravelmente em seu progresso nesta empresa, além de poder acarretar-lhe
      penalidades mais severas, conforme preceitua as disposições do Artigo 482 e
      suas alíneas da Consolidação das Leis do Trabalho.
    </div>
    <div class="corpo">Atenciosamente,</div>
    <div class="assinaturas">
      <div class="linha-assinatura"><div class="traco"></div>${EMPRESA}</div>
      <div class="linha-assinatura"><div class="traco"></div>${nome}</div>
    </div>
    <div class="corpo" style="margin-top:50px">
      Em caso de recusa de assinaturas, as testemunhas abaixo assinam:
    </div>
    <div class="testemunhas">
      <div class="col"><div class="traco"></div>TESTEMUNHA</div>
      <div class="col"><div class="traco"></div>TESTEMUNHA</div>
    </div>
  `
}

function docSuspensao({ nome, motivo, data, dataInfracao, dias, filial, origem }: DadosDocumento): string {
  const cidade = cidadeDaFilial(filial)
  const n = dias && dias > 0 ? dias : 1
  return `
    <div class="logo"><img src="${location.origin}/logo.png" alt="LOG20" /></div>
    <div class="titulo">Carta de Suspensão no Trabalho</div>
    <div class="corpo"><strong>De:</strong> LOG20 Logística S/A</div>
    <div class="corpo"><strong>Para:</strong> ${nome}</div>
    <div class="motivo">${fraseInfracao(motivo, dataInfracao ?? null, origem)}</div>
    <div class="corpo">
      Em razão disso será suspenso de suas atividades pelo prazo de ${n}
      (${diasExtenso(n)}) dia${n > 1 ? 's' : ''} para que pense em suas atitudes e
      passe a se enquadrar nas regras internas da empresa, evitando a reincidência,
      que provocará a rescisão do contrato de trabalho por justa causa.
    </div>
    <div class="corpo">Sem mais.</div>
    <div class="corpo" style="margin-top:30px">${cidade}, ${dataCurta(data)}.</div>
    <div class="corpo">Suspenso de suas atividades em ${dataCurta(data)}</div>
    <div class="assinaturas">
      <div class="linha-assinatura"><div class="traco"></div>${EMPRESA}<br/>${CNPJ_LOG20}</div>
      <div class="linha-assinatura"><div class="traco"></div>${nome}</div>
    </div>
    <div class="corpo" style="margin-top:50px">
      Em caso de recusa de assinaturas, as testemunhas abaixo assinam:
    </div>
    <div class="testemunhas">
      <div class="col"><div class="traco"></div>TESTEMUNHA</div>
      <div class="col"><div class="traco"></div>TESTEMUNHA</div>
    </div>
  `
}

/** Retorna true se o tipo de ação gera documento imprimível */
export function geraDocumento(tipo: string | null): boolean {
  return tipo === 'Advertência Verbal' || tipo === 'Advertência Escrita' || tipo === 'Suspensão'
}

/** Gera e abre a janela de impressão (Salvar como PDF) do documento do fluxo */
export function imprimirDocumentoFluxo(dados: DadosDocumento) {
  if (!geraDocumento(dados.tipo)) return
  const conteudo = dados.tipo === 'Suspensão' ? docSuspensao(dados) : docAdvertencia(dados)
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
    <title>${dados.tipo} — ${dados.nome}</title>${ESTILO}</head>
    <body>${conteudo}</body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow!.document
  doc.open()
  doc.write(html)
  doc.close()
  iframe.contentWindow!.focus()
  setTimeout(() => {
    iframe.contentWindow!.print()
    setTimeout(() => document.body.removeChild(iframe), 1500)
  }, 400)
}

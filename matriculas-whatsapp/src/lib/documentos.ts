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
    body { font-family: 'Times New Roman', serif; font-size: 13pt; color: #000;
           line-height: 1.6; margin: 0; padding: 60px 70px; }
    .logo { text-align: center; margin-bottom: 30px; }
    .logo img { height: 70px; }
    .data { text-align: right; margin-bottom: 36px; }
    .titulo { text-align: center; font-weight: bold; font-size: 15pt;
              letter-spacing: 2px; margin: 30px 0; text-transform: uppercase; }
    .destinatario { font-weight: bold; margin-bottom: 24px; }
    .corpo { text-align: justify; margin-bottom: 18px; }
    .motivo { text-align: justify; font-weight: bold; margin: 18px 0; }
    .assinaturas { margin-top: 70px; }
    .linha-assinatura { margin-top: 50px; text-align: center; }
    .linha-assinatura .traco { border-top: 1px solid #000; width: 360px;
              margin: 0 auto 4px; }
    .testemunhas { display: flex; justify-content: space-between;
              margin-top: 60px; gap: 40px; }
    .testemunhas .col { flex: 1; text-align: center; }
    .testemunhas .traco { border-top: 1px solid #000; margin-bottom: 4px; }
    @media print { body { padding: 40px 60px; } @page { margin: 0; } }
  </style>
`

interface DadosDocumento {
  tipo: string
  nome: string
  motivo: string
  data: string | null
  dias?: number | null
  filial: string
}

function docAdvertencia({ nome, motivo, data, filial }: DadosDocumento): string {
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
    <div class="motivo">${motivo || '—'}</div>
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

function docSuspensao({ nome, motivo, data, dias, filial }: DadosDocumento): string {
  const cidade = cidadeDaFilial(filial)
  const n = dias && dias > 0 ? dias : 1
  return `
    <div class="logo"><img src="${location.origin}/logo.png" alt="LOG20" /></div>
    <div class="titulo">Carta de Suspensão no Trabalho</div>
    <div class="corpo"><strong>De:</strong> LOG20 Logística S/A</div>
    <div class="corpo"><strong>Para:</strong> ${nome}</div>
    <div class="motivo">${motivo || '—'}</div>
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

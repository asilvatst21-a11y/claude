// Regras de vencimento do GSD: colaboradores com mais de 3 meses de empresa
// fazem o GSD a cada 60 dias; novatos (até 3 meses) a cada 30 dias. O ciclo
// reinicia na última avaliação registrada (ou na admissão, se ainda não
// avaliado). Os thresholds definem em quais dias do ciclo o supervisor é
// notificado (ex.: ciclo de 60 dias avisa faltando 15/10/5/0 dias).
export const CICLO_PADRAO_DIAS = 60
export const CICLO_NOVATO_DIAS = 30
export const LIMITE_NOVATO_MESES = 3

export const THRESHOLDS_CICLO_PADRAO = [45, 50, 55, 60]
export const THRESHOLDS_CICLO_NOVATO = [15, 20, 25, 30]

const FUNCOES_ELEGIVEIS = ['MOTORISTA DE DISTRIBUIÇÃO', 'AJUDANTE DE DISTRIBUIÇÃO']

export function ehMotoristaOuAjudante(funcao: string | null): boolean {
  const f = (funcao ?? '').toUpperCase().trim()
  return FUNCOES_ELEGIVEIS.includes(f)
}

export function mesesDeEmpresa(dataAdmissao: string, hoje: Date): number {
  const adm = new Date(dataAdmissao.slice(0, 10) + 'T00:00:00')
  let meses = (hoje.getFullYear() - adm.getFullYear()) * 12 + (hoje.getMonth() - adm.getMonth())
  if (hoje.getDate() < adm.getDate()) meses -= 1
  return meses
}

export function cicloDiasColaborador(dataAdmissao: string | null, hoje: Date): number {
  if (!dataAdmissao) return CICLO_PADRAO_DIAS
  return mesesDeEmpresa(dataAdmissao, hoje) >= LIMITE_NOVATO_MESES ? CICLO_PADRAO_DIAS : CICLO_NOVATO_DIAS
}

export function diasEntre(de: string, hoje: Date): number {
  const d = new Date(de.slice(0, 10) + 'T00:00:00')
  return Math.floor((hoje.getTime() - d.getTime()) / 86_400_000)
}

export function thresholdsParaCiclo(cicloDias: number): number[] {
  return cicloDias === CICLO_NOVATO_DIAS ? THRESHOLDS_CICLO_NOVATO : THRESHOLDS_CICLO_PADRAO
}

export interface VencimentoInfo {
  cicloInicio: string
  cicloDias: number
  diasDesdeCiclo: number
  diasRestantes: number
  farol: 'verde' | 'amarelo' | 'vermelho'
}

// Retorna null quando não há dado nenhum para basear o ciclo (sem admissão e
// sem avaliação registrada) — nesse caso não é possível calcular vencimento.
export function calcularVencimento(
  dataAdmissao: string | null,
  ultimaAvaliacao: string | null,
  hoje: Date
): VencimentoInfo | null {
  const cicloInicio = ultimaAvaliacao || dataAdmissao
  if (!cicloInicio) return null
  const cicloDias = cicloDiasColaborador(dataAdmissao, hoje)
  const diasDesdeCiclo = diasEntre(cicloInicio, hoje)
  const diasRestantes = cicloDias - diasDesdeCiclo
  const farol: VencimentoInfo['farol'] = diasRestantes <= 5 ? 'vermelho' : diasRestantes <= 15 ? 'amarelo' : 'verde'
  return { cicloInicio, cicloDias, diasDesdeCiclo, diasRestantes, farol }
}

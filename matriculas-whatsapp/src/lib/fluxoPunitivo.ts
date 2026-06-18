import { supabase } from './supabase'

type OrigemFluxo = 'GSDPQ' | 'Relatos' | 'Telemetria' | 'DTO'

interface RegistrarOrientacaoVerbalInput {
  filial: string
  colaboradorNome: string
  origem: OrigemFluxo
  motivo: string
  dataInfracao: string | null
  observacao?: string | null
  registradoPor: string | null
  sourceId?: string | null
}

// Sobe a Orientação Verbal direto para o histórico do Fluxo Punitivo,
// sem passar por fluxo_confirmacoes nem enviar mensagem ao grupo de WhatsApp.
export async function registrarOrientacaoVerbalFluxo(input: RegistrarOrientacaoVerbalInput) {
  await supabase.from('fluxo_punitivo').insert({
    filial: input.filial,
    colaborador_nome: input.colaboradorNome,
    origem: input.origem,
    tipo_acao: 'Orientação Verbal',
    status: 'Concluido',
    motivo: input.motivo || null,
    data_acao: input.dataInfracao,
    data_infracao: input.dataInfracao,
    observacao: input.observacao ?? null,
    registrado_por: input.registradoPor,
    source_id: input.sourceId ?? null,
  })
}

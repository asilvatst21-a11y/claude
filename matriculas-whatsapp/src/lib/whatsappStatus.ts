// Pausa de envios em massa via Z-API, por área — o número ficou 24h em
// análise após disparo em massa (avisos de treinamento + link da Conferência
// Digital para todo o time, 23/07/2026). Cada bloco é reativado
// separadamente conforme confirmamos que aquele envio específico não
// arrisca um novo bloqueio — não precisa esperar todos ficarem prontos.
export const ENVIOS_TREINAMENTO_PAUSADOS = true
// "Enviar link ao time" manda uma mensagem por motorista/ajudante cadastrado
// (mass send) — continua pausado, diferente do aviso de divergência abaixo.
export const ENVIOS_CONFERENCIA_LINK_PAUSADOS = true
// Aviso de divergência: uma mensagem só, pro grupo, por divergência
// registrada — não é disparo em massa, reabilitado em 23/07/2026.
export const ENVIOS_CONFERENCIA_DIVERGENCIA_PAUSADOS = false
export const ENVIOS_TML_PAUSADOS = false // reabilitado em 23/07/2026
export const ENVIOS_JORNADA_PAUSADOS = false // reabilitado em 23/07/2026
// Pergunta de sugestão ao finalizar um mapa na Conferência Digital: uma
// mensagem por pessoa/mapa, não é disparo em massa — feature nova, nunca
// esteve envolvida no bloqueio original.
export const ENVIOS_CONFERENCIA_SUGESTAO_PAUSADOS = false

// Indicador agregado — só pra avisos genéricos de "o bot ainda está
// paralisado" (ex.: banner da tela de Reposições) — true enquanto qualquer
// um dos blocos acima continuar pausado.
export const ENVIOS_EM_MASSA_PAUSADOS =
  ENVIOS_TREINAMENTO_PAUSADOS || ENVIOS_CONFERENCIA_LINK_PAUSADOS

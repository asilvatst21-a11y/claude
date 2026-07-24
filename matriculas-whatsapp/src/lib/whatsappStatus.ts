// Pausa de envios em massa via Z-API, por área — o número ficou 24h em
// análise após disparo em massa (avisos de treinamento + link da Conferência
// Digital para todo o time, 23/07/2026). Cada bloco é reativado
// separadamente conforme confirmamos que aquele envio específico não
// arrisca um novo bloqueio — não precisa esperar todos ficarem prontos.
export const ENVIOS_TREINAMENTO_PAUSADOS = true
export const ENVIOS_CONFERENCIA_PAUSADOS = true
export const ENVIOS_TML_PAUSADOS = false // reabilitado em 23/07/2026
export const ENVIOS_JORNADA_PAUSADOS = true

// Indicador agregado — só pra avisos genéricos de "o bot ainda está
// paralisado" (ex.: banner da tela de Reposições) — true enquanto qualquer
// um dos blocos acima continuar pausado.
export const ENVIOS_EM_MASSA_PAUSADOS =
  ENVIOS_TREINAMENTO_PAUSADOS || ENVIOS_CONFERENCIA_PAUSADOS || ENVIOS_JORNADA_PAUSADOS

// Pausa de envios via Z-API, por área — o número ficou 24h em análise após
// disparo em massa (avisos de treinamento + link da Conferência Digital
// para todo o time, 23/07/2026). Os dois disparos em massa responsáveis
// foram REMOVIDOS (não só pausados) em 24/07/2026 pra não arriscar um novo
// bloqueio — ver enviarAvisosTreinamento (treinamentos.ts, agora só manda
// aviso ao grupo) e a extinção de "Enviar link ao time"
// (DistribuicaoConferencia.tsx).
export const ENVIOS_CONFERENCIA_DIVERGENCIA_PAUSADOS = false
export const ENVIOS_TML_PAUSADOS = false
export const ENVIOS_JORNADA_PAUSADOS = false
export const ENVIOS_CONFERENCIA_SUGESTAO_PAUSADOS = false

// Indicador agregado — só pra avisos genéricos de "o bot ainda está
// paralisado" (ex.: banner da tela de Reposições). Sem nenhum disparo em
// massa ativo hoje, fica sempre false — mantido só pra não quebrar quem
// importa esse nome.
export const ENVIOS_EM_MASSA_PAUSADOS = false

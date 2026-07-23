// Pausa temporária de envios em massa via Z-API — o número ficou 24h em
// análise após disparo em massa (avisos de treinamento + link da Conferência
// Digital para todo o time). Enquanto true, essas rotinas não chamam a
// Z-API; as telas de Carta de Controle TML e Jornada e Tempo em Rota passam
// a oferecer imagem/texto pra copiar e enviar manualmente nos grupos.
// Reverter para false assim que a conta voltar a enviar normalmente.
export const ENVIOS_EM_MASSA_PAUSADOS = true

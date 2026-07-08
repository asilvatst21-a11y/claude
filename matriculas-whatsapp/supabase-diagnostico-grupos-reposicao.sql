-- Diagnóstico: confirma qual ID de grupo está configurado hoje pra cada
-- filial, pra comparar com os IDs que chegaram nos logs do webhook.
-- Rode no SQL Editor do Supabase (somente leitura, não altera nada).

SELECT nome, grupo_fluxo_whatsapp, grupo_reposicoes_whatsapp,
       grupo_solicitacao_2_whatsapp, grupo_validacao_whatsapp
FROM filiais
ORDER BY nome;

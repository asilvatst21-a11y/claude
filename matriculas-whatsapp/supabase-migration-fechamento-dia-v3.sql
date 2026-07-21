-- Migração: Fechamento do Dia — corrige a meta de TML (v3)
-- Execute no SQL Editor do Supabase (depois da v1/v2). Idempotente.
--
-- O KPI de TML voltou a ser a MÉDIA de saída da sala (minutos desde o início
-- da matinal até a saída real), igual à tela Distribuição › Análise TML —
-- não o "pior caso" testado antes. A meta correta pra essa régua é 30min
-- (a mesma tolerância de REGRAS_TML usada na Carta de Controle TML), não 0.

update fechamento_dia_parametros
set meta = 30, bench = null, gatilho = null, direcao = 'menor_melhor'
where kpi = 'tml';

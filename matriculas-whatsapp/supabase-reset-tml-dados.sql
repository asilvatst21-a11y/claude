-- Reset de dados do TML: Carta de Controle, Tempo de Deslocamento e Análise.
-- Execute no SQL Editor do Supabase.
-- Apaga TODAS as filiais e datas das tabelas abaixo (reset completo p/ reteste).
--
-- Tabelas por tela:
--   Carta de Controle      → escalas_tml (03.11.49.02), saidas_tml (03.11.20),
--                             historico_tml, alertas_tml
--   Tempo de Deslocamento  → checklist_tml
--   Análise do TML         → historico_tml, alertas_tml
--
-- historico_tml.alerta_id referencia alertas_tml(id) ON DELETE SET NULL,
-- então a ordem de exclusão não importa.

begin;

delete from historico_tml;
delete from alertas_tml;
delete from escalas_tml;
delete from saidas_tml;
delete from checklist_tml;

commit;

-- Farol de Mercados e PDVs Críticos: envio automático de imagem ao grupo
-- do WhatsApp a cada import do BEES.
--
-- - grupo_farol_criticos_whatsapp: grupo de destino, configurado na própria
--   tela do Farol (mesmo padrão do grupo_jornada_whatsapp já usado em
--   Jornada e Tempo em Rota).
-- - distribuicao_farol_envios: controla quando parar de reenviar — uma vez
--   que todos os PDVs da watchlist do dia estejam "Concluído", o próximo
--   import do BEES não dispara mais imagem pra essa data.
--
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE filiais ADD COLUMN IF NOT EXISTS grupo_farol_criticos_whatsapp TEXT;

CREATE TABLE IF NOT EXISTS distribuicao_farol_envios (
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  finalizado BOOLEAN NOT NULL DEFAULT FALSE,
  ultimo_envio TIMESTAMPTZ,
  PRIMARY KEY (filial, data)
);

ALTER TABLE distribuicao_farol_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON distribuicao_farol_envios;
CREATE POLICY "Acesso total" ON distribuicao_farol_envios FOR ALL USING (true) WITH CHECK (true);

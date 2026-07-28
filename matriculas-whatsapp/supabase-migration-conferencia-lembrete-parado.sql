-- Migração: lembrete automático de baia parada + rastreio de quem iniciou.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Passa a gravar quem abriu cada baia (nome/telefone), pra poder mandar um
-- lembrete pelo WhatsApp quando ela fica aberta (status ainda 'pendente')
-- por mais de 5 minutos sem ser finalizada — pergunta se a pessoa já
-- terminou. `lembrete_parado_enviado_em` evita mandar mais de uma vez pra
-- mesma baia.

ALTER TABLE conferencia_baias ADD COLUMN IF NOT EXISTS iniciado_por TEXT;
ALTER TABLE conferencia_baias ADD COLUMN IF NOT EXISTS iniciado_por_telefone TEXT;
ALTER TABLE conferencia_baias ADD COLUMN IF NOT EXISTS lembrete_parado_enviado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conf_baias_lembrete_parado
  ON conferencia_baias (status, iniciada_em)
  WHERE lembrete_parado_enviado_em IS NULL;

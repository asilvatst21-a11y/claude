-- Migração: TML — resposta do supervisor em texto livre.
-- Novo fluxo: ao receber o alerta, o supervisor responde em texto livre no
-- WhatsApp; a resposta é guardada no alerta e o controle classifica o motivo
-- (pela tabela de motivos/UGC) no site. Adiciona o status "respondido"
-- (supervisor respondeu, aguardando classificação) e as colunas da resposta.
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE alertas_tml ADD COLUMN IF NOT EXISTS resposta_supervisor TEXT;
ALTER TABLE alertas_tml ADD COLUMN IF NOT EXISTS respondido_em TIMESTAMPTZ;

-- Recria o CHECK de status incluindo "respondido".
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'alertas_tml'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE alertas_tml DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE alertas_tml
    ADD CONSTRAINT alertas_tml_status_check
    CHECK (status IN ('pendente', 'enviado', 'respondido', 'justificado', 'erro'));
END $$;

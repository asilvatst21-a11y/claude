-- Migração: TML — adiciona o status "pendente" (alerta detectado mas ainda
-- não enviado ao supervisor), permitindo o botão de envio individual por
-- colaborador na tela principal.
-- Execute no SQL Editor do Supabase.

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
    CHECK (status IN ('pendente', 'enviado', 'justificado', 'erro'));
END $$;

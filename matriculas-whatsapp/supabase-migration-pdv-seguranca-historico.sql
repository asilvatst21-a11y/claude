-- Import histórico de relatos (planilha antiga, milhares de linhas já
-- fechadas/canceladas): CLOSED e CANCELED continuam sem virar caso
-- operacional (nunca entram em "aguardando triagem"), mas agora ficam
-- gravados como registro terminal só pra análise — sem isso não dá pra
-- calcular % fechado no prazo, % cancelado por subgrupo/mês etc.
--
-- Também dá suporte ao encerramento manual retroativo: quando um relato
-- chega OPEN/IN_PROGRESS na origem mas na prática já foi resolvido antes
-- de entrar no fluxo, dá pra encerrar com uma data de fechamento escolhida
-- (inclusive no passado) sem precisar do checklist de visita.

ALTER TABLE pdv_seguranca_relatos ADD COLUMN IF NOT EXISTS prazo_origem DATE;

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'pdv_seguranca_relatos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%aguardando_triagem%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE pdv_seguranca_relatos DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE pdv_seguranca_relatos ADD CONSTRAINT pdv_seguranca_relatos_status_check
  CHECK (status IN (
    'aguardando_triagem', 'agendado', 'preenchido', 'aprovado', 'nao_critico',
    'encerrado_historico',  -- CLOSED na origem (ou encerramento manual retroativo) — nunca passou por visita
    'cancelado'             -- CANCELED na origem — registro só pra análise, nunca vira caso
  ));

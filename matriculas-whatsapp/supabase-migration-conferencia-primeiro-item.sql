-- Migração: horário do primeiro item marcado numa baia (Conferência
-- Digital) — usado pra medir quanto tempo a conferência de fato levou, em
-- vez de "iniciada_em" (que marca só quando o ajudante ABRIU a baia, o que
-- infla o tempo quando ele dá uma olhada em várias baias antes de conferir
-- item a item). Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE conferencia_baias ADD COLUMN IF NOT EXISTS primeiro_item_em TIMESTAMPTZ;

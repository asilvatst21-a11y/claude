-- Migração: permite `sala` nula em alertas_fixacao_motorista.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Quando a placa não tem mapeamento de sala em motoristas_sala_tml (sala
-- desconhecida), o alerta já é enviado pra todos os supervisores ativos da
-- filial em vez de silenciar (ver processarFixacaoMotorista em
-- src/lib/frota.ts) — mas a coluna sala era NOT NULL, e gravar esse alerta
-- (com sala = null) violava a constraint. O CHECK (sala IN ('COLORADO',
-- 'SUB-FURIA')) continua valendo normalmente — CHECK do Postgres não
-- rejeita NULL, só valores fora da lista.

ALTER TABLE alertas_fixacao_motorista ALTER COLUMN sala DROP NOT NULL;

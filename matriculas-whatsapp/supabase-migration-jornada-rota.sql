-- Módulo "Jornada e Tempo em Rota" (Distribuição) — reproduz a aba FAROL da
-- Carta de Controle de Jornada.
--
-- IMPORTANTE: rode cada PARTE separadamente (selecione o bloco e clique em
-- "Run" isoladamente, ou rode em execuções distintas), em vez de colar o
-- arquivo inteiro de uma vez. O SQL Editor do Supabase roda o script
-- colado como uma transação só; como a PARTE 1 pede um lock exclusivo em
-- escalas_tml (tabela usada o tempo todo pelo app), rodar tudo junto numa
-- transação longa aumenta a chance de deadlock com alguma sessão aberta do
-- painel. Rodando em partes menores, cada lock é liberado rápido.
--
-- Se ainda assim der deadlock: feche outras abas do painel (principalmente
-- a Carta de Controle TML e o SQL Editor com resultado antigo aberto) e
-- tente de novo — é um problema de timing, o script em si é idempotente
-- (pode rodar de novo sem problema, "IF NOT EXISTS" em tudo).

-- ── PARTE 1 — colunas de plano em escalas_tml ─────────────────────────────
-- 03.11.49.02 já traz essas colunas, hoje ignoradas pelo parser da Carta
-- de Controle TML.
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS tempo_prev_min INTEGER;   -- Tempo Prev.(+almoço), em minutos
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS hora_saida_prev TEXT;     -- Hora MPD prevista (HH:MM)
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS entregas_previstas INTEGER;


-- ── PARTE 2 — tabelas novas (execute em separado da parte 1) ─────────────
-- Execução das entregas por mapa (agregado do BEES no import do dia).
CREATE TABLE IF NOT EXISTS jornada_bees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  data DATE NOT NULL,
  realizadas INTEGER NOT NULL DEFAULT 0,
  devolucao INTEGER NOT NULL DEFAULT 0,
  repasse INTEGER NOT NULL DEFAULT 0,
  entrega_fora_raio INTEGER NOT NULL DEFAULT 0,
  dev_fora_raio INTEGER NOT NULL DEFAULT 0,
  menos_4min INTEGER NOT NULL DEFAULT 0,
  not_10s INTEGER NOT NULL DEFAULT 0,
  tempo_real_medio_min NUMERIC,     -- média (finished_at - arrived_at) por PDV, em min
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa, data)
);

-- Tempo planejado por mapa (Roteirizador) — base da dispersão de tempo.
-- O arquivo do Roteirizador não traz o número do mapa, só a PLACA — o mapa
-- é resolvido no import casando a placa com a escala do mesmo dia
-- (escalas_tml). "Entregas planejadas" e "tempo médio por entrega" não são
-- guardados aqui: são derivados de escalas_tml.entregas_previstas na hora
-- do cálculo, evitando duplicar/desatualizar o dado.
CREATE TABLE IF NOT EXISTS jornada_roteirizador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  placa TEXT,
  data DATE NOT NULL,
  tempo_dirigindo_min NUMERIC,      -- Tempo Dirigindo (HH:MM:SS) do Roteirizador, convertido p/ minutos
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa, data)
);

CREATE INDEX IF NOT EXISTS idx_jornada_bees_filial_data ON jornada_bees (filial, data);
CREATE INDEX IF NOT EXISTS idx_jornada_rot_filial_data ON jornada_roteirizador (filial, data);


-- ── PARTE 3 — coluna em filiais (execute em separado das partes 1 e 2) ───
-- Grupo de WhatsApp para o resumo do CDD (o envio por sala usa o grupo já
-- cadastrado por sala em supervisores_tml — nada novo ali).
ALTER TABLE filiais ADD COLUMN IF NOT EXISTS grupo_jornada_whatsapp TEXT;


-- ── PARTE 4 — RLS (execute em separado, depois que as tabelas da parte 2 existirem) ──
ALTER TABLE jornada_bees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON jornada_bees;
CREATE POLICY "Acesso total" ON jornada_bees FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE jornada_roteirizador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON jornada_roteirizador;
CREATE POLICY "Acesso total" ON jornada_roteirizador FOR ALL USING (true) WITH CHECK (true);

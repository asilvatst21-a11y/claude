-- Migração: fonte da Fixação de Motorista vinda da Base do Mapa
-- Execute no SQL Editor do Supabase.

-- "Quem rodou a placa" (placa + matrícula do motorista) por mapa/dia, extraído
-- da aba "Base" da planilha diária no import de Financeiro → Catálogo/Vendas.
-- Substitui o historico_tml (planilha de Saída da portaria) como fonte da
-- Fixação de Motorista — a data vem do nome do arquivo (DDMMAAAA), sem o
-- problema de dia/mês trocados da coluna de data da portaria. A sala
-- (COLORADO/SUB-FURIA) continua sendo resolvida por matrícula em
-- motoristas_sala_tml na hora do cruzamento.
CREATE TABLE IF NOT EXISTS frota_motorista_base (
  filial text NOT NULL,
  mapa bigint NOT NULL,
  placa text NOT NULL,
  data date NOT NULL,
  matricula bigint,
  nome text,
  importado_em timestamptz DEFAULT now(),
  PRIMARY KEY (filial, mapa)
);

CREATE INDEX IF NOT EXISTS idx_frota_motorista_base_filial_data
  ON frota_motorista_base (filial, data);

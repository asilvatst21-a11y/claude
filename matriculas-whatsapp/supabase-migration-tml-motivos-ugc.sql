-- Migração: TML — motivos de justificativa com UGC (área responsável).
-- Adiciona a coluna "ugc" no catálogo de motivos e importa a lista oficial
-- agrupada por área (Armazém, Distribuição, Financeiro, Frota, Gente,
-- Segurança). Habilita o fluxo de justificativa em 2 etapas no WhatsApp
-- (área → motivo) e o relatório de atraso por área responsável.
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE motivos_justificativa_tml ADD COLUMN IF NOT EXISTS ugc TEXT;
CREATE INDEX IF NOT EXISTS idx_motivos_justificativa_tml_filial_ugc
  ON motivos_justificativa_tml(filial, ugc);

-- Importa/atualiza os motivos oficiais para cada filial cadastrada em usuarios.
-- ON CONFLICT atualiza a UGC dos que já existirem (ex.: motivos repetidos do
-- seed antigo passam a ter área quando coincidirem com a lista nova).
INSERT INTO motivos_justificativa_tml (filial, ugc, motivo)
SELECT DISTINCT u.filial, m.ugc, m.motivo
FROM (SELECT DISTINCT filial FROM usuarios WHERE filial IS NOT NULL) u
CROSS JOIN (VALUES
  ('ARMAZÉM', 'Atraso Conferência EE - Descartavel Desorganizado'),
  ('ARMAZÉM', 'Atraso da Liberação da Blitz de Carregamento'),
  ('ARMAZÉM', 'Atraso no Carregamento TC'),
  ('ARMAZÉM', 'Caminhão Direcionado Para Blitz'),
  ('ARMAZÉM', 'Carregamento não OK conforme OCP'),
  ('ARMAZÉM', 'Falta de Mercadoria - Mapeado Conferente'),
  ('ARMAZÉM', 'Reconferência WH com Falta'),
  ('ARMAZÉM', 'Retorno ao WH para trocar carga de lado'),
  ('ARMAZÉM', 'Retorno para WH para Remontar Pallet'),
  ('ARMAZÉM', 'Retorno WH por carga Avariada'),
  ('ARMAZÉM', 'Retorno WH por Falta Mapeada na conferência'),
  ('ARMAZÉM', 'Transbordo Peso'),
  ('ARMAZÉM', 'Organização do pátio NOK'),
  ('ARMAZÉM', 'Fila na conferência de carga no WH'),
  ('DISTRIBUIÇÃO', 'Aplicação de MDT na EE'),
  ('DISTRIBUIÇÃO', 'Atraso Blitz de Segurança'),
  ('DISTRIBUIÇÃO', 'Atraso Conferencia EE'),
  ('DISTRIBUIÇÃO', 'Atraso Conferência EE - Mapa com Peso acima de 80%'),
  ('DISTRIBUIÇÃO', 'Carro Sem Manifesto Impresso'),
  ('DISTRIBUIÇÃO', 'Carro Utilizado Fora da Disp'),
  ('DISTRIBUIÇÃO', 'Comportamental Ajudante'),
  ('DISTRIBUIÇÃO', 'Comportamental Motorista'),
  ('DISTRIBUIÇÃO', 'D+0'),
  ('DISTRIBUIÇÃO', 'Motorista esqueceu Tracking'),
  ('DISTRIBUIÇÃO', 'Motorista se Recusou a Sair'),
  ('DISTRIBUIÇÃO', 'Motorista sem Cartão Vfleet'),
  ('DISTRIBUIÇÃO', 'Mudança de Escala Após Matinal'),
  ('DISTRIBUIÇÃO', 'Reconferência WH sem Falta'),
  ('DISTRIBUIÇÃO', 'Supermatinal'),
  ('DISTRIBUIÇÃO', 'Tempo Matinal Estendido'),
  ('DISTRIBUIÇÃO', 'Recarga com Saída antes de 12h'),
  ('DISTRIBUIÇÃO', 'Atraso EE Engarrafamento Serra - Conlog'),
  ('FINANCEIRO', 'Atraso Portaria - Produtividade Vigilante'),
  ('FINANCEIRO', 'Atraso Portaria - Sistema Fora do Ar'),
  ('FINANCEIRO', 'Carro na Portaria Sem Matricula'),
  ('FINANCEIRO', 'Mapa sem NF Impressa'),
  ('FINANCEIRO', 'Placa com Pendência Financeira'),
  ('FINANCEIRO', 'Saída de Carreta durante a liberação'),
  ('FINANCEIRO', 'Tratativa de Vale pós Matinal'),
  ('FROTA', 'Atraso Oficina - Abastecimento de Arla'),
  ('FROTA', 'Atraso Oficina - Baia Agarrando'),
  ('FROTA', 'Atraso Oficina - Bloqueio por Pane na Central'),
  ('FROTA', 'Atraso Oficina - Cabo de Aço Arrebentado'),
  ('FROTA', 'Atraso Oficina - Carro sem puxador da baia'),
  ('FROTA', 'Atraso Oficina - Carro sem Tacografo'),
  ('FROTA', 'Atraso Oficina - Carro sem TAG de Pedágio'),
  ('FROTA', 'Atraso Oficina - Chave quebrou na Ignição'),
  ('FROTA', 'Atraso Oficina - Eletrica - Buzina falhando'),
  ('FROTA', 'Atraso Oficina - Eletrica - Comando de Seta quebrado'),
  ('FROTA', 'Atraso Oficina - Eletrica - Lampada Queimada'),
  ('FROTA', 'Atraso Oficina - Eletrica - Sensor do Cinto'),
  ('FROTA', 'Atraso Oficina - Eletrica - Troca de Fusivel'),
  ('FROTA', 'Atraso Oficina - Equipe sem Carrinho'),
  ('FROTA', 'Atraso Oficina - Equipe sem Cone'),
  ('FROTA', 'Atraso Oficina - Espelho Retrovisor Quebrado'),
  ('FROTA', 'Atraso Oficina - Freio estacionario'),
  ('FROTA', 'Atraso Oficina - Kit Hergonomico Quebrado'),
  ('FROTA', 'Atraso Oficina - Kit Hergonomico sem Solda'),
  ('FROTA', 'Atraso Oficina - Plataforma Agarrando'),
  ('FROTA', 'Atraso Oficina - Plataforma com Solda Quebrada'),
  ('FROTA', 'Atraso Oficina - Pneu Descalibrado'),
  ('FROTA', 'Atraso Oficina - Pneu Furado'),
  ('FROTA', 'Atraso Oficina - Trava Baia Quebrado'),
  ('FROTA', 'Atraso Oficina - Troca de Bateria'),
  ('FROTA', 'Atraso Oficina - Troca de Oleo do motor'),
  ('FROTA', 'Atraso Oficina - Troca de Pneu Carrinho'),
  ('FROTA', 'Transbordo Carro Bloqueado'),
  ('FROTA', 'Atraso Oficina - Carro com OS do dia Anterior'),
  ('FROTA', 'Atraso Oficina - Problema na Marcha'),
  ('FROTA', 'Atraso Oficina - Anti Guilhorina Solto'),
  ('FROTA', 'Atraso Oficina - Agua de Arrefecimento Baixa'),
  ('GENTE', 'Absenteismo EE'),
  ('GENTE', 'Atraso Ajudante'),
  ('GENTE', 'Atraso EE Interjornada'),
  ('GENTE', 'Atraso Motorista'),
  ('GENTE', 'Café com Gerente'),
  ('GENTE', 'EE Sem Passagem'),
  ('GENTE', 'Entrevista de ABS'),
  ('GENTE', 'Equipe Bloqueada por Aderência Logon'),
  ('GENTE', 'Pré Contracheck Feito na Liberação'),
  ('GENTE', 'Processo de Integração Novatos'),
  ('SEGURANCA', 'Tratativa de Telemetria Após Matinal'),
  ('SEGURANCA', 'Carro sem Frota Legal')
) AS m(ugc, motivo)
ON CONFLICT (filial, motivo) DO UPDATE SET ugc = EXCLUDED.ugc;

-- Garante que "OUTRO" (motivo livre) exista em toda filial e fique numa área
-- "GERAL", para continuar acessível no fluxo por área.
UPDATE motivos_justificativa_tml SET ugc = 'GERAL' WHERE ugc IS NULL;

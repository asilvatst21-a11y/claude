-- Reabilita o Freightech, mas só como base inicial de placas (não tem
-- peso — é uma base de custos/leasing de frota, PLACA + 150 colunas de
-- financeiro). Serve pra:
--   1. Filtrar ruído do 03.11.49.02 (placas REC de recarga, placas de
--      outra unidade) no cálculo de Excesso de Peso — só entram na conta
--      placas que estão cadastradas no Freightech.
--   2. Confronto "Freightech x Frota Legal": toda placa do Freightech
--      sem Peso Lotação cadastrado no Frota Legal aparece como pendente.

ALTER TABLE peso_cadastrado_placas ADD COLUMN IF NOT EXISTS importado_freightech_em TIMESTAMPTZ;

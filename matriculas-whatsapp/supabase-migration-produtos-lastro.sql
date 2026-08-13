-- Quantidade de caixas por lastro (camada fechada de pallet) de cada
-- produto — usado na Conferência Digital pra o ajudante bater a
-- quantidade separada em lastros completos + avulsas em vez de contar
-- caixa por caixa. Preenchido pelo mesmo import de "Atualizar catálogo
-- de produtos" (Financeiro > Faturamento do Dia), quando o arquivo trouxer
-- a coluna Lastro.

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS lastro int;

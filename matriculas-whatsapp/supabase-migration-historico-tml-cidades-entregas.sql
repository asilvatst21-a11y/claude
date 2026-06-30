-- Migração: cidades_entregas em historico_tml
-- Execute no SQL Editor do Supabase.

-- A planilha de Escala do dia (03.11.49.02) já trazia "Cidades +Entregas"
-- para escalas_tml, mas o histórico (usado no cruzamento de Fixação de
-- Território) só guardava "Região +Entregas". Algumas rotas só têm o bairro
-- do território reconhecível no texto de cidades, o que fazia o cruzamento
-- marcar NOK indevidamente. Agora propagamos também cidades_entregas para
-- mesclar com região na hora de comparar com o território disponibilizado.
ALTER TABLE historico_tml ADD COLUMN IF NOT EXISTS cidades_entregas TEXT;

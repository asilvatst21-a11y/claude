-- Apaga os dados da Análise DTO para permitir subir uma planilha nova do zero.
-- ATENÇÃO: operação destrutiva e irreversível (perde status_acao/responsavel_acao
-- das ações já tratadas). Confirme antes de rodar. Execute no SQL Editor do Supabase.

-- Confira antes o nome exato gravado (deve ser igual ao da tabela "filiais"):
-- select distinct filial from dto_observacoes;

-- Opção 1: apagar apenas da sua filial (recomendado em ambiente com várias filiais)
delete from dto_observacoes where filial = 'CDD PETROPOLIS';

-- Opção 2: apagar TODOS os registros de TODAS as filiais
-- delete from dto_observacoes;

-- Correção: a Consulta de Pendências (link de autoatendimento) estava
-- gravando/lendo a justificativa prévia do colaborador na coluna
-- `vale_itens.justificativa_ajudante` — só que essa coluna já existe e já é
-- preenchida na IMPORTAÇÃO da planilha de vales (campo "Justificativas" do
-- vale original, escrito no papel na hora da entrega). Isso fazia itens
-- importados com justificativa de origem aparecerem como se o colaborador já
-- tivesse respondido pelo link, sem nunca ter acessado.
--
-- Cria uma coluna nova e separada, só para a justificativa prévia enviada
-- pelo link de autoatendimento — não mexe em `justificativa_ajudante`.
-- Execute no SQL Editor do Supabase.

alter table vale_itens add column if not exists justificativa_previa_colaborador text;

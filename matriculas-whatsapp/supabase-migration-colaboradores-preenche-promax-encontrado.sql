-- Preenche a matrícula Promax de 4 colaboradores que foram encontrados em
-- Motoristas TML / Ajudantes pelo NOME (matrícula Promax ainda vazia em
-- Colaboradores). Não mexe em telefone — essas 4 pessoas não têm telefone
-- cadastrado em nenhuma das duas tabelas de origem.
--
-- Execute no SQL Editor do Supabase.

update colaboradores set matricula_promax = '399' where nome = 'ALEXANDER DE SOUZA GOMES' and (matricula_promax is null or trim(matricula_promax) = '');
update colaboradores set matricula_promax = '597' where nome = 'CARLOS DANIEL DA SILVA ARAUJO' and (matricula_promax is null or trim(matricula_promax) = '');
update colaboradores set matricula_promax = '338' where nome = 'RICARDO CASTILHO IGLESIAS' and (matricula_promax is null or trim(matricula_promax) = '');
update colaboradores set matricula_promax = '292' where nome = 'ROBSON DE SOUZA GOMES' and (matricula_promax is null or trim(matricula_promax) = '');

-- A tela de Motoristas TML mostra telefone que NÃO vem da coluna
-- `motoristas_sala_tml.telefone` (essa está vazia pra quase todos) — ela
-- cai num fallback pra tabela legada `matriculas` (Segurança > Matrículas),
-- casando pelo número (matrícula Promax), com zeros à esquerda ignorados.
-- É de lá que o telefone precisa ser puxado pra Colaboradores.
--
-- Execute no SQL Editor do Supabase.

-- 1) DIAGNÓSTICO — confira antes de gravar.
select
  c.nome, c.matricula_promax, mt.numero as matriculas_numero, mt.whatsapp as matriculas_whatsapp, mt.ativo
from colaboradores c
join matriculas mt
  on regexp_replace(trim(mt.numero), '^0+', '') = regexp_replace(trim(c.matricula_promax), '^0+', '')
where c.funcao in ('MOTORISTA DE DISTRIBUIÇÃO', 'AJUDANTE DE DISTRIBUIÇÃO')
  and (c.telefone is null or trim(c.telefone) = '')
  and c.matricula_promax is not null and trim(c.matricula_promax) <> ''
order by c.nome;

-- 2) Grava o telefone encontrado.
update colaboradores c
set telefone = mt.whatsapp
from matriculas mt
where regexp_replace(trim(mt.numero), '^0+', '') = regexp_replace(trim(c.matricula_promax), '^0+', '')
  and (c.telefone is null or trim(c.telefone) = '')
  and c.matricula_promax is not null and trim(c.matricula_promax) <> ''
  and mt.whatsapp is not null and trim(mt.whatsapp) <> '';

-- 3) Confira quem ainda ficou sem telefone depois disso.
select nome, matricula_promax, telefone
from colaboradores
where funcao in ('MOTORISTA DE DISTRIBUIÇÃO', 'AJUDANTE DE DISTRIBUIÇÃO')
  and (telefone is null or trim(telefone) = '')
order by nome;

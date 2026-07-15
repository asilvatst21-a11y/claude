-- Correção final e explícita das duplicatas reportadas: cada par abaixo é
-- (nome oficial da planilha a manter, nome curto/antigo a fundir e apagar),
-- copiando telefone/CPF/matrícula/etc. do nome curto pro oficial antes de
-- apagar. Não depende de nenhuma regra automática de casamento — são os
-- pares exatos que você mostrou.
--
-- Execute no SQL Editor do Supabase.

do $$
declare
  pares text[][] := array[
    ['ARTHUR NOGUEIRA DA CONCEIÇÃO', 'ARTHUR NOGUEIRA'],
    ['ALEXANDRE DE FREITAS',          'ALEXANDRE FREITAS'],
    ['BRENO CORTÁCIO DOS SANTOS',     'BRENO CORTACIO'],
    ['HELIO LEONARDO BATISTA DOS SANTOS MARCOLINO', 'HELIO LEONARDO'],
    ['JOAO VICTOR DE JESUS CORREA',   'JOÃO VICTOR'],
    ['JORGE LUIS STEPHANO',           'JORGE LUIZ ESTEFANO'],
    ['LEONARDO LUIS GONCALVES DOS SANTOS', 'LEONARDO LUIS DOS SANTOS'],
    ['LUCAS FALK DOS ANJOS SIQUEIRA', 'LUCAS FALCK'],
    ['LUCAS DE LIMA RIBEIRO',         'LUCAS LIMA'],
    ['MARCOS ROGER DA COSTA MOURA',   'MARCOS ROGER'],
    ['MARLON JULIO DE ALMEIDA',       'MARLON JULIO'],
    ['MATHEUS PIO DE OLIVEIRA',       'MATEUS PIO DE OLIVEIRA'],
    ['MATHEUS HENRIQUE FERREIRA VIEIRA', 'MATHEUS HENRIQUE'],
    ['WELINGTON FERNANDO COSTA',      'WELINGTON FERNANDO'],
    ['DEIVISON DE MELO PINTO RANGEL', 'Deivison Rangel'],
    ['EMERSON DE SOUZA VALENTIM',     'Emerson Valentim'],
    ['EMERSON DE SOUZA VALENTIM',     'EMERSON VALENTIN']
  ];
  par text[];
  n_atualizados int := 0;
  n_apagados int := 0;
begin
  foreach par slice 1 in array pares loop
    update colaboradores keep
    set
      matricula        = coalesce(nullif(keep.matricula, ''), rem.matricula),
      matricula_promax = coalesce(nullif(keep.matricula_promax, ''), rem.matricula_promax),
      telefone         = coalesce(nullif(keep.telefone, ''), rem.telefone),
      cpf              = coalesce(nullif(keep.cpf, ''), rem.cpf),
      sala             = coalesce(nullif(keep.sala, ''), rem.sala),
      cargo            = coalesce(nullif(keep.cargo, ''), rem.cargo),
      funcao           = coalesce(nullif(keep.funcao, ''), rem.funcao),
      equipe           = coalesce(nullif(keep.equipe, ''), rem.equipe),
      status           = coalesce(nullif(keep.status, ''), rem.status)
    from colaboradores rem
    where keep.nome = par[1] and rem.nome = par[2] and keep.filial = rem.filial;
    get diagnostics n_atualizados = row_count;

    delete from colaboradores rem
    using colaboradores keep
    where rem.nome = par[2] and keep.nome = par[1] and rem.filial = keep.filial;
    get diagnostics n_apagados = row_count;

    if n_atualizados = 0 and n_apagados = 0 then
      raise notice 'Par não encontrado (confira grafia): % <- %', par[1], par[2];
    end if;
  end loop;
end $$;

-- Confira o resultado: essas duplicatas específicas não devem mais aparecer.
select nome, matricula, matricula_promax, telefone, cpf, cargo, funcao, equipe, status
from colaboradores
where nome in (
  'ARTHUR NOGUEIRA', 'ALEXANDRE FREITAS', 'BRENO CORTACIO', 'HELIO LEONARDO',
  'JOÃO VICTOR', 'JORGE LUIZ ESTEFANO', 'LEONARDO LUIS DOS SANTOS', 'LUCAS FALCK',
  'LUCAS LIMA', 'MARCOS ROGER', 'MARLON JULIO', 'MATEUS PIO DE OLIVEIRA',
  'MATHEUS HENRIQUE', 'WELINGTON FERNANDO', 'Deivison Rangel', 'Emerson Valentim',
  'EMERSON VALENTIN'
);
-- ↑ se essa consulta voltar alguma linha, o "raise notice" acima (na aba de
--   mensagens/logs do SQL Editor) mostra qual par não bateu — me manda a
--   grafia exata que aparecer lá.

-- Diagnóstico geral — outros "quase duplicados" que ainda possam existir,
-- pela mesma matrícula (LOG20 ou Promax) espalhada entre linhas diferentes.
select filial, coalesce(nullif(trim(matricula), ''), nullif(trim(matricula_promax), '')) as chave, count(*), array_agg(nome)
from colaboradores
where coalesce(nullif(trim(matricula), ''), nullif(trim(matricula_promax), '')) is not null
group by filial, coalesce(nullif(trim(matricula), ''), nullif(trim(matricula_promax), ''))
having count(*) > 1;

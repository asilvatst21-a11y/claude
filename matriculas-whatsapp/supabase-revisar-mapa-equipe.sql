-- Revisão da base de mapa_equipe importada ANTES da correção do filtro por filial.
-- Execute no SQL Editor do Supabase.

-- 1) Ver o que está importado hoje e se a coluna "filial" está vazia
--    (sinal de que foi importado antes da correção).
select data, filial, mapa, motorista_nome, ajudante1_nome, ajudante2_nome
from mapa_equipe
where data = current_date
order by mapa;

-- 2) Se a coluna "filial" estiver vazia (null) nas linhas de hoje, apague-as
--    para reimportar do zero pela tela (já vai gravar a filial certa).
--    ATENÇÃO: operação destrutiva. Confirme antes de rodar.
-- delete from mapa_equipe where data = current_date and filial is null;

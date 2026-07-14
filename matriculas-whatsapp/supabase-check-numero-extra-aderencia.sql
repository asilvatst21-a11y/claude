-- Confere se o número extra de aderência foi realmente salvo na sua filial.
-- Execute no SQL Editor do Supabase.

select nome, grupo_jornada_whatsapp, numero_extra_aderencia_whatsapp
from filiais
order by nome;

-- Horário de início/fim de cada avaliação de GSDPQ — vem no export "comprido"
-- (DTO_RESPOSTAS) como HR INICIO/HR FINAL, repetido em cada linha da mesma
-- sessão (colaborador+data+realizado_por). Guardado como texto (mesmo
-- padrão de data_avaliacao) — a duração é calculada no app, não aqui.
alter table gsdpq_avaliacoes add column if not exists hr_inicio text;
alter table gsdpq_avaliacoes add column if not exists hr_final text;

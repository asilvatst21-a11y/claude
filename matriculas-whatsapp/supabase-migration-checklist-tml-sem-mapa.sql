-- Migração: aceita registro de checklist sem número de mapa.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- O relatório de checklist às vezes é exportado antes de o mapa do dia ser
-- atribuído à rota (coluna MAPA vem em branco) — sem essa migração, o
-- importador descartava a linha inteira e o dia sumia do Tempo de
-- Deslocamento. Agora essas linhas entram como fallback, usando a sala já
-- informada na própria planilha (coluna EQUIPE) em vez do vínculo
-- mapa → escala → cadastro de motorista.

alter table checklist_tml alter column mapa drop not null;

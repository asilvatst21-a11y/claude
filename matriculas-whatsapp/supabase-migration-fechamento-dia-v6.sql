-- Migração: Fechamento do Dia — 1 grupo único de WhatsApp (v6)
-- Execute no SQL Editor do Supabase (depois da v1..v5). Idempotente.
--
-- O fechamento passa a enviar tudo (as 3 imagens — Colorado, Sub-Fúria, CDD
-- — mais o texto de orientação/destaques) pra um único grupo, em vez de um
-- grupo por sala + o grupo do CDD.

alter table filiais add column if not exists grupo_fechamento_whatsapp text;

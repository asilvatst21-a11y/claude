-- Ativar/desativar filial — filial inativa bloqueia novos logins de usuários
-- vinculados a ela, sem apagar nenhum histórico (ver api/login.ts e a aba
-- "Filiais" em src/pages/Admin.tsx).
alter table filiais add column if not exists ativo boolean not null default true;

-- peso_cadastrado_placas foi criada sem RLS habilitado explicitamente —
-- o padrão do Supabase pra tabela nova é RLS ligado com zero policies
-- (bloqueia tudo), causando "new row violates row-level security policy"
-- em qualquer insert/upsert. Mesmo padrão já usado em escalas_tml,
-- alertas_tml etc. (ver supabase-migration-distribuicao-tml.sql):
-- controle de acesso fica no app, não no banco.

ALTER TABLE peso_cadastrado_placas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON peso_cadastrado_placas;
CREATE POLICY "Acesso total" ON peso_cadastrado_placas FOR ALL USING (true) WITH CHECK (true);

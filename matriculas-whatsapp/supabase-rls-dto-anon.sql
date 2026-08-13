-- O módulo DTO inteiro (dto_observacoes, dto_atividades, dto_avaliadores,
-- dto_atividade_aliases, dto_solicitacoes) só teve a policy de RLS
-- "using (true)" desde sempre, sem o GRANT de tabela pra anon/authenticated
-- — mesma causa raiz já corrigida em produtos e aurora_sessoes: a policy
-- sozinha não basta, o Postgres barra a escrita antes de sequer consultar a
-- RLS. Isso deixava o import de "Análise DTO" (upsert/insert direto do
-- navegador, chave anônima) falhando em silêncio: a leitura sempre
-- funcionou (por isso dados antigos apareciam normalmente), mas nenhuma
-- observação nova conseguia gravar — o Gerenciador de DTO continuava
-- mostrando a última observação real, sem nenhum aviso de erro na tela.
-- Execute no SQL Editor do Supabase. Idempotente.

grant select, insert, update on dto_observacoes       to anon, authenticated;
grant select, insert, update on dto_atividades         to anon, authenticated;
grant select, insert, update on dto_avaliadores        to anon, authenticated;
grant select, insert, update on dto_atividade_aliases  to anon, authenticated;
grant select, insert, update on dto_solicitacoes       to anon, authenticated;

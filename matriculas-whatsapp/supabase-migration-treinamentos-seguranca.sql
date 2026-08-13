-- Treinamentos Segurança: sessões de treinamento criadas a partir do ranking
-- de atos mais recorrentes em Relatos (classificação "Ato Inseguro"), com
-- conclusão marcada por quem acompanhar (flag + data) e efetividade medida
-- depois (relatos/semana do mesmo ato, antes vs depois da conclusão).
-- Execute no SQL Editor do Supabase. Idempotente.

create table if not exists treinamentos_seguranca_sessoes (
  id                       uuid primary key default gen_random_uuid(),
  filial                   text not null,
  origem                   text not null default 'relato',   -- 'relato' | 'avulsa'
  ato_alvo                 text not null,                      -- mesmo rótulo de relatos.tipo_relato
  titulo                   text not null,
  responsavel              text,
  equipe_alvo              text,                                -- ex.: "Equipe Carga, Equipe Expedição"
  data_prevista            date,
  prazo_conclusao          date,
  canal                    text,                                -- 'presencial' | 'matinal_aurora' | 'video'
  conteudo                 text,
  participantes_previstos  int not null default 0,
  participantes_confirmados int not null default 0,
  concluido_por            text,
  concluido_em             date,
  created_at               timestamptz not null default now()
);

create index if not exists treinamentos_seguranca_sessoes_filial_idx on treinamentos_seguranca_sessoes(filial);
create index if not exists treinamentos_seguranca_sessoes_ato_idx on treinamentos_seguranca_sessoes(filial, ato_alvo);

alter table treinamentos_seguranca_sessoes enable row level security;
drop policy if exists "Acesso total" on treinamentos_seguranca_sessoes;
create policy "Acesso total" on treinamentos_seguranca_sessoes for all using (true) with check (true);
grant select, insert, update on treinamentos_seguranca_sessoes to anon, authenticated;

-- Migração: Dúvidas da Matinal (treinamentos + FAQ automática + Q&A pelo WhatsApp)
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Fluxo: o palestrante sobe um material (PDF/PPTX) na tela Treinamentos; o
-- sistema extrai o texto e gera uma FAQ (pergunta+resposta) via IA, que o
-- palestrante revisa antes de publicar. Na matinal do dia seguinte, quem abrir
-- o timer marca "Matinal com treinamento?" e escolhe o treinamento publicado
-- daquela sala. Ao finalizar, o bot avisa individualmente cada colaborador
-- cadastrado na sala (telefone já existente em motoristas_sala_tml). Dúvidas
-- daquele dia que baterem com a FAQ são respondidas na hora; as que não
-- baterem são encaminhadas ao telefone do palestrante, e a resposta dele volta
-- ao colaborador. Perguntas respondidas pelo palestrante viram FAQ pública do
-- treinamento (a próxima pessoa com a mesma dúvida já recebe resposta automática).

-- ── Treinamentos ────────────────────────────────────────────────────────────
create table if not exists treinamentos_matinal (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  sala text not null check (sala in ('COLORADO', 'SUB-FURIA')),
  titulo text not null,
  palestrante_nome text not null,
  palestrante_telefone text not null,
  arquivo_nome text,
  conteudo_extraido text,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  created_at timestamptz not null default now()
);
create index if not exists idx_treinamentos_matinal_filial_sala
  on treinamentos_matinal (filial, sala, status);

-- ── FAQ do treinamento (gerada pela IA, editada manualmente, ou vinda de uma
-- resposta do palestrante a uma dúvida real) ────────────────────────────────
create table if not exists treinamento_faq_matinal (
  id uuid primary key default gen_random_uuid(),
  treinamento_id uuid not null references treinamentos_matinal(id) on delete cascade,
  pergunta text not null,
  resposta text not null,
  origem text not null default 'ia' check (origem in ('ia', 'manual', 'palestrante')),
  created_at timestamptz not null default now()
);
create index if not exists idx_treinamento_faq_matinal_treinamento
  on treinamento_faq_matinal (treinamento_id);

-- ── Vínculo da matinal do dia com um treinamento ────────────────────────────
alter table matinal_tml add column if not exists treinamento_id uuid references treinamentos_matinal(id);
alter table matinal_tml add column if not exists treinamento_avisado_em timestamptz;

-- ── Avisos enviados: marca quem recebeu o aviso do treinamento hoje — usado
-- pelo bot pra saber que a próxima mensagem daquele telefone, no mesmo dia, é
-- uma dúvida sobre ESSE treinamento (janela de validade: só o mesmo dia). ───
create table if not exists matinal_treinamento_avisos (
  id uuid primary key default gen_random_uuid(),
  treinamento_id uuid not null references treinamentos_matinal(id) on delete cascade,
  filial text not null,
  sala text not null,
  colaborador_telefone text not null,
  colaborador_nome text,
  enviado_em timestamptz not null default now()
);
create index if not exists idx_matinal_treinamento_avisos_telefone
  on matinal_treinamento_avisos (colaborador_telefone, enviado_em);

-- ── Dúvidas: uma linha por pergunta feita pelo colaborador ──────────────────
create table if not exists duvidas_matinal (
  id uuid primary key default gen_random_uuid(),
  treinamento_id uuid not null references treinamentos_matinal(id) on delete cascade,
  filial text not null,
  sala text not null,
  colaborador_telefone text not null,
  colaborador_nome text,
  pergunta text not null,
  pergunta_por_audio boolean not null default false,
  palestrante_telefone text not null,
  resposta text,
  -- aguardando_palestrante | respondida_auto | respondida_palestrante
  status text not null default 'aguardando_palestrante',
  lembrete_enviado_em timestamptz,
  aviso_atraso_enviado_em timestamptz,
  respondida_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_duvidas_matinal_treinamento on duvidas_matinal (treinamento_id);
create index if not exists idx_duvidas_matinal_palestrante_status
  on duvidas_matinal (palestrante_telefone, status);
create index if not exists idx_duvidas_matinal_status_created
  on duvidas_matinal (status, created_at);

-- ── RLS (mesmo padrão "Acesso total" das demais tabelas do painel) ──────────
alter table treinamentos_matinal enable row level security;
drop policy if exists "Acesso total" on treinamentos_matinal;
create policy "Acesso total" on treinamentos_matinal for all using (true) with check (true);

alter table treinamento_faq_matinal enable row level security;
drop policy if exists "Acesso total" on treinamento_faq_matinal;
create policy "Acesso total" on treinamento_faq_matinal for all using (true) with check (true);

alter table matinal_treinamento_avisos enable row level security;
drop policy if exists "Acesso total" on matinal_treinamento_avisos;
create policy "Acesso total" on matinal_treinamento_avisos for all using (true) with check (true);

alter table duvidas_matinal enable row level security;
drop policy if exists "Acesso total" on duvidas_matinal;
create policy "Acesso total" on duvidas_matinal for all using (true) with check (true);

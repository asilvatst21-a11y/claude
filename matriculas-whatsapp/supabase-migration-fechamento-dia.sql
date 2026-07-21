-- Migração: Fechamento do Dia (Distribuição)
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Painel que junta os 6 KPIs do Quadro de Resultados (Devolução PDV, Jornada
-- Líquida, Aderência ao Raio, TML, Rating, IV-Tempo de Deslocamento) por
-- sala e CDD, gera as imagens de fechamento + o texto de destaques/bate-papo
-- (a partir do Farol Motoristas) e envia pro grupo de WhatsApp.
--
-- Aderência ao Raio, TML e IV-Tempo de Deslocamento são calculados
-- automaticamente (dados já existentes: jornada_bees/escalas_tml,
-- historico_tml, checklist_tml). Devolução PDV, Jornada Líquida e Rating
-- ainda não têm fonte automática no sistema — são preenchidos manualmente
-- (Devolução PDV e Rating com upload do relatório de referência; Jornada
-- Líquida só o valor, pois a fórmula ainda não foi definida com o cliente).

-- ── Parâmetros por KPI (Meta / Bench / Gatilho) ─────────────────────────────
create table if not exists fechamento_dia_parametros (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  kpi text not null check (kpi in ('devolucao_pdv','jornada_liquida','aderencia_raio','tml','rating','iv_deslocamento')),
  meta numeric,
  bench numeric,
  gatilho numeric,
  -- 'menor_melhor' (ex.: devolução, TML) ou 'maior_melhor' (ex.: aderência, rating)
  direcao text not null default 'maior_melhor' check (direcao in ('menor_melhor','maior_melhor')),
  updated_at timestamptz not null default now(),
  unique (filial, kpi)
);

-- ── Valor do dia por filial+sala+kpi (a mesma linha serve pro histórico —
-- consultado por período pra montar a semana + acumulado do mês) ───────────
create table if not exists fechamento_dia_valores (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  sala text not null check (sala in ('COLORADO','SUB-FURIA','CDD')),
  data date not null,
  kpi text not null check (kpi in ('devolucao_pdv','jornada_liquida','aderencia_raio','tml','rating','iv_deslocamento')),
  valor numeric,
  origem text not null default 'automatico' check (origem in ('automatico','manual')),
  atualizado_em timestamptz not null default now(),
  unique (filial, sala, data, kpi)
);
create index if not exists idx_fechamento_dia_valores_periodo
  on fechamento_dia_valores (filial, data, kpi);

-- ── Upload de referência (Devolução PDV / Rating) — guarda o arquivo e o
-- valor manual que o monitoramento digitou a partir dele ───────────────────
create table if not exists fechamento_dia_uploads (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  data date not null,
  tipo text not null check (tipo in ('devolucao_pdv','rating')),
  arquivo_nome text,
  arquivo_path text,
  enviado_por text,
  enviado_em timestamptz not null default now()
);
create index if not exists idx_fechamento_dia_uploads_dia
  on fechamento_dia_uploads (filial, data, tipo);

-- ── Farol por motorista do dia (upload do relatório "Farol Motoristas") ────
create table if not exists fechamento_dia_farol_motoristas (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  data date not null,
  matricula bigint,
  nome text,
  sala text check (sala in ('COLORADO','SUB-FURIA')),
  aderencia_ok boolean,
  devolucao_fora_raio_ok boolean,
  tml_ok boolean,
  devolucao_ok boolean,
  resultado text check (resultado in ('destaque','bate_papo','neutro')),
  created_at timestamptz not null default now()
);
create index if not exists idx_fechamento_dia_farol_dia
  on fechamento_dia_farol_motoristas (filial, data);

-- ── Registro do fechamento confirmado/enviado do dia ────────────────────────
create table if not exists fechamento_dia_envios (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  data date not null,
  status text not null default 'rascunho' check (status in ('rascunho','enviado')),
  confirmado_por text,
  confirmado_em timestamptz,
  texto_destaques text,
  texto_bate_papo text,
  created_at timestamptz not null default now(),
  unique (filial, data)
);

-- ── Grupo de WhatsApp para a imagem consolidada do CDD (as imagens de sala
-- reaproveitam grupo_matinal_colorado_whatsapp / grupo_matinal_subfuria_whatsapp) ──
alter table filiais add column if not exists grupo_fechamento_cdd_whatsapp text;

-- ── RLS (mesmo padrão "Acesso total" das demais tabelas do painel) ──────────
alter table fechamento_dia_parametros enable row level security;
drop policy if exists "Acesso total" on fechamento_dia_parametros;
create policy "Acesso total" on fechamento_dia_parametros for all using (true) with check (true);

alter table fechamento_dia_valores enable row level security;
drop policy if exists "Acesso total" on fechamento_dia_valores;
create policy "Acesso total" on fechamento_dia_valores for all using (true) with check (true);

alter table fechamento_dia_uploads enable row level security;
drop policy if exists "Acesso total" on fechamento_dia_uploads;
create policy "Acesso total" on fechamento_dia_uploads for all using (true) with check (true);

alter table fechamento_dia_farol_motoristas enable row level security;
drop policy if exists "Acesso total" on fechamento_dia_farol_motoristas;
create policy "Acesso total" on fechamento_dia_farol_motoristas for all using (true) with check (true);

alter table fechamento_dia_envios enable row level security;
drop policy if exists "Acesso total" on fechamento_dia_envios;
create policy "Acesso total" on fechamento_dia_envios for all using (true) with check (true);

-- ── Storage: bucket para os arquivos de referência (Devolução PDV / Rating) ─
insert into storage.buckets (id, name, public)
values ('fechamento-dia', 'fechamento-dia', false)
on conflict (id) do nothing;

drop policy if exists "Acesso total fechamento-dia" on storage.objects;
create policy "Acesso total fechamento-dia" on storage.objects
  for all using (bucket_id = 'fechamento-dia') with check (bucket_id = 'fechamento-dia');

-- ── Semente de parâmetros — valores de referência do Quadro de Resultados,
-- editáveis depois pela tela. Nota: "TML" aqui é medido em MINUTOS DE ATRASO
-- sobre o limite da sala (matinal + tolerância), não a duração absoluta — por
-- isso a meta é 0 (dentro do limite), diferente do "00:30" da planilha
-- original. Ajuste na tela de Parâmetros se preferir outro valor.
insert into fechamento_dia_parametros (filial, kpi, meta, bench, gatilho, direcao)
select f.nome, v.kpi, v.meta, v.bench, v.gatilho, v.direcao
from filiais f
cross join (values
  ('devolucao_pdv',   0.031, 0.0235, null,  'menor_melhor'),
  ('jornada_liquida', 0.88,  null,   null,  'maior_melhor'),
  ('aderencia_raio',  0.95,  null,   null,  'maior_melhor'),
  ('tml',             0,     15,     30,    'menor_melhor'),
  ('rating',          4.91,  null,   null,  'maior_melhor'),
  ('iv_deslocamento', 5,     11,     null,  'menor_melhor')
) as v(kpi, meta, bench, gatilho, direcao)
on conflict (filial, kpi) do nothing;

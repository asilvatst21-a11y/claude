-- Módulo "Excesso de Peso" (Segurança) — confronta o peso cadastrado por
-- placa no Freightech e no Frota Legal, exige foto da TARA por placa, e
-- cruza com o peso carregado do dia (já importado em Distribuição → Carta
-- de Controle TML, tabela escalas_tml — não duplicamos essa importação).

-- 1. Peso carregado por mapa, na mesma escala já usada pelo TML.
--    Coluna nova, opcional — nada quebra se a planilha não trouxer peso.
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS peso_carregado NUMERIC;

-- 2. Peso cadastrado por placa, uma linha por placa por filial. Cada
--    import (Freightech ou Frota Legal) faz upsert só na sua coluna —
--    a outra fonte não é sobrescrita.
CREATE TABLE IF NOT EXISTS peso_cadastrado_placas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  placa TEXT NOT NULL,
  peso_freightech NUMERIC,
  peso_frota_legal NUMERIC,
  importado_freightech_em TIMESTAMPTZ,
  importado_frota_legal_em TIMESTAMPTZ,
  foto_tara_url TEXT,
  foto_tara_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, placa)
);

CREATE INDEX IF NOT EXISTS idx_peso_cadastrado_placas_filial ON peso_cadastrado_placas (filial);

-- 3. Storage bucket para as fotos de TARA (mesmo padrão do bucket
--    'fotos-clientes' já usado no projeto — ver supabase-schema.sql).
insert into storage.buckets (id, name, public)
values ('fotos-tara', 'fotos-tara', true)
on conflict (id) do nothing;

create policy "Upload publico fotos-tara" on storage.objects for insert with check (bucket_id = 'fotos-tara');
create policy "Leitura publica fotos-tara" on storage.objects for select using (bucket_id = 'fotos-tara');
create policy "Delete publico fotos-tara" on storage.objects for delete using (bucket_id = 'fotos-tara');

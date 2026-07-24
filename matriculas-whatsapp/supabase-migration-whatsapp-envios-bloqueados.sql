-- Migração: central de envios de WhatsApp bloqueados/com erro.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Toda vez que um envio individual é bloqueado por status do colaborador
-- (não encontrado no cadastro central "colaboradores", ou status diferente
-- de TRABALHANDO), fica registrado aqui — independente de qual tela/sessão
-- disparou o envio. Pensada pra crescer depois com outros tipos de erro de
-- envio, não só bloqueio por status (por isso "origem"/"motivo" são texto
-- livre em vez de um enum fechado).

CREATE TABLE IF NOT EXISTS whatsapp_envios_bloqueados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL,       -- ex.: 'treinamento', 'jornada_aderencia_motorista', 'tml_alerta'
  filial TEXT,
  nome TEXT,
  telefone TEXT,
  motivo TEXT NOT NULL,       -- ex.: 'Colaborador não encontrado no cadastro central' / 'Status "FÉRIAS"'
  detalhe TEXT,               -- contexto extra (ex.: "Mapa 279224", "Vale #1234")
  visto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bloq_filial_data ON whatsapp_envios_bloqueados (filial, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_bloq_visto ON whatsapp_envios_bloqueados (visto);

ALTER TABLE whatsapp_envios_bloqueados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON whatsapp_envios_bloqueados;
CREATE POLICY "Acesso total" ON whatsapp_envios_bloqueados FOR ALL USING (true) WITH CHECK (true);

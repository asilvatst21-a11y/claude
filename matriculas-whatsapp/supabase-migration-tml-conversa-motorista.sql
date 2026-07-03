-- Conversa humanizada com o motorista que perdeu o TML.
-- Disparo MANUAL pelo controle (botão na tela de Alertas TML). O bot
-- conduz uma conversa de 2 perguntas via WhatsApp:
--   1. o que aconteceu (motivo do atraso)
--   2. que solução ele propõe pra não repetir
-- As respostas podem vir por texto OU áudio (o webhook transcreve o áudio
-- via Whisper/Groq, mesma infra já usada nos outros fluxos).

-- Telefone do motorista — não existia em lugar nenhum; sem ele não dá pra
-- iniciar a conversa. Cadastrado/editado na tela de Relação de Motoristas.
ALTER TABLE motoristas_sala_tml ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Uma linha por conversa (por alerta de TML perdido). O estado controla em
-- qual pergunta a conversa está; o webhook avança conforme o motorista
-- responde.
CREATE TABLE IF NOT EXISTS conversas_motorista_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  alerta_id UUID REFERENCES alertas_tml(id) ON DELETE SET NULL,
  matricula BIGINT,
  nome TEXT,
  telefone TEXT NOT NULL,
  mapa BIGINT,
  data_saida DATE,
  atraso_minutos INTEGER,
  estado TEXT NOT NULL DEFAULT 'aguardando_motivo'
    CHECK (estado IN ('aguardando_motivo', 'aguardando_solucao', 'concluido')),
  motivo TEXT,
  motivo_por_audio BOOLEAN NOT NULL DEFAULT FALSE,
  solucao TEXT,
  solucao_por_audio BOOLEAN NOT NULL DEFAULT FALSE,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- O webhook acha a conversa aberta do motorista pelos últimos dígitos do
-- telefone; índice pra essa busca ser rápida.
CREATE INDEX IF NOT EXISTS idx_conversas_motorista_tml_telefone
  ON conversas_motorista_tml (filial, telefone);
CREATE INDEX IF NOT EXISTS idx_conversas_motorista_tml_alerta
  ON conversas_motorista_tml (alerta_id);

-- Mesma política de acesso das outras tabelas TML (controle é feito no app).
ALTER TABLE conversas_motorista_tml ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON conversas_motorista_tml;
CREATE POLICY "Acesso total" ON conversas_motorista_tml FOR ALL USING (true) WITH CHECK (true);

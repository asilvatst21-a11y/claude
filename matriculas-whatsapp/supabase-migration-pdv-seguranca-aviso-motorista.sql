-- Aviso automático ao motorista quando ele tem no mapa do dia um PDV com
-- caso aprovado no PDV Crítico. Dispara no mesmo gatilho do Farol de
-- Mercados e PDVs Travas (a cada import do BEES em Jornada e Tempo em
-- Rota, via distribuicao_bees_visitas). Sem dedupe, reenviaria a cada
-- import do dia — essa tabela registra quem já foi avisado hoje pra esse
-- PDV, então só um aviso por motorista+PDV+dia.
--
-- Para automaticamente: como a lista de "casos aprovados" é buscada de
-- novo a cada disparo, se o caso for reaberto (status sai de 'aprovado')
-- ele simplesmente some da lista e o aviso para de sair sozinho.

CREATE TABLE IF NOT EXISTS pdv_seguranca_avisos_motorista (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  matricula TEXT NOT NULL,
  codigo_pdv TEXT NOT NULL,
  relato_id UUID REFERENCES pdv_seguranca_relatos(id),
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (filial, data, matricula, codigo_pdv)
);

CREATE INDEX IF NOT EXISTS idx_pdv_seg_avisos_motorista_dia ON pdv_seguranca_avisos_motorista (filial, data);

ALTER TABLE pdv_seguranca_avisos_motorista ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON pdv_seguranca_avisos_motorista;
CREATE POLICY "Acesso total" ON pdv_seguranca_avisos_motorista FOR ALL USING (true) WITH CHECK (true);

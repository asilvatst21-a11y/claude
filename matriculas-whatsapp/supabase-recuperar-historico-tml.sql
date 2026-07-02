-- Recuperação: popula historico_tml para a data mais recente em saidas_tml
-- quando o histórico está vazio mas os alertas já foram criados.
--
-- Execute no SQL Editor do Supabase se o gerencial ainda mostra uma data
-- antiga ou se "Status de saída — hoje" aparece zerado.
--
-- Como funciona: reconstrói as entradas de historico_tml a partir de
-- saidas_tml (horário real) + escalas_tml (placa/matrícula) +
-- motoristas_sala_tml (sala/nome) + alertas_tml (resultado atrasado).
-- Usa ON CONFLICT DO UPDATE para sobrescrever entradas erradas também.

WITH ultima_data AS (
  SELECT MAX(data_saida) AS data
  FROM saidas_tml
),
reconstruido AS (
  SELECT
    s.filial,
    s.mapa,
    r.sala,
    COALESCE(s.placa, e.placa)                          AS placa,
    COALESCE(s.matricula, e.matricula)                  AS matricula,
    r.nome,
    s.data_saida,
    s.horario_saida,
    a.horario_limite,
    a.atraso_minutos,
    CASE
      WHEN a.id IS NOT NULL           THEN 'atrasado'
      WHEN s.horario_saida IS NULL    THEN 'indefinido'
      WHEN r.sala IS NULL             THEN 'indefinido'
      ELSE                                 'no_prazo'
    END                                                 AS resultado,
    e.regiao_entregas,
    e.cidades_entregas
  FROM saidas_tml s
  JOIN ultima_data ud ON s.data_saida = ud.data
  LEFT JOIN escalas_tml e
         ON e.filial = s.filial AND e.mapa = s.mapa
  LEFT JOIN motoristas_sala_tml r
         ON r.filial = s.filial
        AND r.matricula = COALESCE(s.matricula, e.matricula)
  LEFT JOIN alertas_tml a
         ON a.filial = s.filial
        AND a.mapa   = s.mapa
        AND a.data_saida = s.data_saida
)
INSERT INTO historico_tml (
  filial, mapa, sala, placa, matricula, nome,
  data_saida, horario_saida, horario_limite, atraso_minutos,
  resultado, observacao, regiao_entregas, cidades_entregas
)
SELECT
  filial, mapa, sala, placa, matricula, nome,
  data_saida, horario_saida, horario_limite, atraso_minutos,
  resultado, NULL, regiao_entregas, cidades_entregas
FROM reconstruido
ON CONFLICT (filial, mapa, data_saida) DO UPDATE SET
  sala              = EXCLUDED.sala,
  placa             = EXCLUDED.placa,
  matricula         = EXCLUDED.matricula,
  nome              = EXCLUDED.nome,
  horario_saida     = EXCLUDED.horario_saida,
  horario_limite    = EXCLUDED.horario_limite,
  atraso_minutos    = EXCLUDED.atraso_minutos,
  resultado         = EXCLUDED.resultado,
  regiao_entregas   = EXCLUDED.regiao_entregas,
  cidades_entregas  = EXCLUDED.cidades_entregas;

-- Verifica o resultado: mostra quantos registros existem por data
SELECT data_saida, COUNT(*) AS total,
       SUM(CASE WHEN resultado = 'atrasado' THEN 1 ELSE 0 END)  AS atrasados,
       SUM(CASE WHEN resultado = 'no_prazo' THEN 1 ELSE 0 END)  AS no_prazo,
       SUM(CASE WHEN resultado = 'invalido' THEN 1 ELSE 0 END)  AS invalidos,
       SUM(CASE WHEN resultado = 'indefinido' THEN 1 ELSE 0 END) AS indefinidos
FROM historico_tml
GROUP BY data_saida
ORDER BY data_saida DESC
LIMIT 10;

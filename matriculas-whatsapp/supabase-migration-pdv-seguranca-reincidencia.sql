-- Reincidência: quando um novo relato chega pro mesmo PDV+subgrupo depois
-- que o caso anterior já tinha sido aprovado/concluído, isso indica que a
-- orientação recomendada não está sendo seguida na entrega — precisa
-- escalar pra Segurança, não só virar mais um caso solto na fila.

ALTER TABLE pdv_seguranca_relatos ADD COLUMN IF NOT EXISTS reincidente_apos UUID REFERENCES pdv_seguranca_relatos(id);
ALTER TABLE pdv_seguranca_relatos ADD COLUMN IF NOT EXISTS numero_ocorrencia INT NOT NULL DEFAULT 1;

-- Adiciona data de início aos projetos de investimento
ALTER TABLE projetos_investimento
  ADD COLUMN IF NOT EXISTS data_inicio date;

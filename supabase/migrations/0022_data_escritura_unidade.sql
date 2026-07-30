-- ============================================================
-- Landwise — Correções da auditoria: escritura por unidade
--
-- `sinal_valor`, `reforcos_valor` e `data_escritura` já existiam em
-- project_units desde a migration 0010, mas nunca tinham UI — o motor e a
-- persistência já estavam prontos, só faltava expor os campos na Sales
-- Table. Não requerem alteração de schema.
--
-- Só falta a duração por defeito (fim de obra + X meses) usada para
-- sugerir a data de escritura de cada unidade quando não é definida
-- manualmente.
--
-- ADITIVA. Executar depois de 0002-0021. Não aplicada em produção.
-- ============================================================

alter table project_sales_assumptions
  add column if not exists duracao_escritura_apos_obra_meses numeric not null default 2;

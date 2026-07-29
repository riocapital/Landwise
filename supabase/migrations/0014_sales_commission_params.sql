-- ============================================================
-- Landwise — Revisão estrutural, Fase 2: Comissão comercial
--
-- Secção 18 do plano. `comissao_mediacao_pct` já existe desde a migration
-- 0009 (nunca esteve ligada a nenhum cálculo até agora) — aqui só
-- adicionamos os 4 campos que faltam para a comissão ser calculada e
-- agendada a sério.
--
-- ADITIVO. Executar depois de 0002-0013.
-- ============================================================

alter table project_sales_assumptions
  add column if not exists comissao_taxa_iva numeric not null default 0.23,
  add column if not exists comissao_pct_pago_sinal numeric not null default 0.5,
  add column if not exists comissao_pct_pago_escritura numeric not null default 0.5,
  add column if not exists comissao_iva_recuperavel_pct numeric not null default 0;

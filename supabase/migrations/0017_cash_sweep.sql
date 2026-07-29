-- ============================================================
-- Landwise — Revisão estrutural, Fase 3: Cash sweep
--
-- Secção 24 do plano. A coluna `cash_sweep` (boolean) já existia desde
-- migrations anteriores, nunca ligada a nenhum cálculo — aqui reaproveita-se
-- para "cashSweepAtivo" e adicionam-se os 4 campos que faltam para o
-- cash sweep funcionar a sério.
--
-- ADITIVO. Executar depois de 0002-0016.
-- ============================================================

alter table project_financing
  add column if not exists cash_sweep_pct_caixa_livre numeric not null default 0,
  add column if not exists cash_sweep_meses_custos_futuros integer not null default 0,
  add column if not exists cash_sweep_inicio_tipo text not null default 'primeira_escritura'
    check (cash_sweep_inicio_tipo in ('primeira_escritura', 'pct_vendido', 'pct_vgv_recebido', 'data')),
  add column if not exists cash_sweep_inicio_valor_pct numeric,
  add column if not exists cash_sweep_inicio_data date;

-- ============================================================
-- Landwise — Correções 29/07/2026
-- Campos adicionais de características, custos mensais, financiamento e IRC.
-- Aditiva e retrocompatível.
-- ============================================================

-- As colunas de contagem já foram previstas na fundação, mas garantimos a sua existência.
alter table projects
  add column if not exists num_estacionamentos integer default 0,
  add column if not exists num_elevadores integer default 0;

-- Novo tipo de cálculo para custos recorrentes mensais, usado por fiscalização de obra.
alter table project_costs drop constraint if exists project_costs_tipo_calculo_check;
alter table project_costs add constraint project_costs_tipo_calculo_check
  check (tipo_calculo in (
    'valor_fixo', 'valor_mensal', 'percentagem_aquisicao', 'percentagem_hard_costs',
    'percentagem_capex', 'percentagem_custo_total',
    'eur_m2_abc_acima', 'eur_m2_abc_abaixo', 'eur_m2_abd',
    'eur_m2_abc_principal', 'eur_m2_abc_total',
    'eur_unidade', 'percentagem_outra_base'
  ));

-- Setup bancário como percentagem e reserva mínima por número de meses.
alter table project_financing
  add column if not exists setup_costs_pct numeric not null default 0.003,
  add column if not exists saldo_minimo_meses_reserva integer not null default 6;

-- Regime de IRC para distinguir taxa geral de PME/Small Mid Cap elegível.
alter table project_taxes
  add column if not exists irc_regime text not null default 'geral'
    check (irc_regime in ('geral', 'pme_small_mid_cap'));

-- Preenche as premissas bancárias antigas que ficaram em zero na implementação anterior.
-- Continuam totalmente editáveis depois da migração.
update project_financing
set
  spread = case when coalesce(spread, 0) = 0 then 0.0185 else spread end,
  structuring_fee_pct = case when coalesce(structuring_fee_pct, 0) = 0 then 0.02 else structuring_fee_pct end,
  setup_costs_pct = case when coalesce(setup_costs_pct, 0) = 0 then 0.003 else setup_costs_pct end,
  imposto_selo_emprestimo_pct = case when coalesce(imposto_selo_emprestimo_pct, 0) = 0 then 0.005 else imposto_selo_emprestimo_pct end,
  imposto_selo_juros_pct = case when coalesce(imposto_selo_juros_pct, 0) = 0 then 0.01 else imposto_selo_juros_pct end,
  cash_sweep_pct_caixa_livre = case when coalesce(cash_sweep_pct_caixa_livre, 0) = 0 then 0.30 else cash_sweep_pct_caixa_livre end,
  cash_sweep_meses_custos_futuros = case when coalesce(cash_sweep_meses_custos_futuros, 0) = 0 then 6 else cash_sweep_meses_custos_futuros end,
  saldo_minimo_meses_reserva = case when coalesce(saldo_minimo_meses_reserva, 0) = 0 then 6 else saldo_minimo_meses_reserva end;

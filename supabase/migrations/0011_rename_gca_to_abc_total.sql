-- ============================================================
-- Landwise — Revisão estrutural, Fase 1 (continuação): GCA → ABC Total / ABD
--
-- Atualiza o check constraint de project_costs.tipo_calculo: os valores
-- 'eur_m2_abc' e 'eur_m2_gca' passam a 'eur_m2_abc_principal' e
-- 'eur_m2_abc_total' (secção 8 do plano de revisão estrutural — remove a
-- nomenclatura "GCA" e desambigua as duas bases de ABC).
--
-- Sem dados existentes a migrar (nenhum projeto tem linhas de custo com
-- estes tipos neste momento — confirmado antes de aplicar).
--
-- ADITIVO/CORRETIVO. Executar depois de 0002-0010.
-- ============================================================

-- Atualiza quaisquer linhas existentes antes de trocar o constraint (idempotente e seguro mesmo que já existam dados).
update project_costs set tipo_calculo = 'eur_m2_abc_principal' where tipo_calculo = 'eur_m2_abc';
update project_costs set tipo_calculo = 'eur_m2_abc_total' where tipo_calculo = 'eur_m2_gca';

alter table project_costs drop constraint if exists project_costs_tipo_calculo_check;

alter table project_costs add constraint project_costs_tipo_calculo_check
  check (tipo_calculo in (
    'valor_fixo', 'percentagem_aquisicao', 'percentagem_hard_costs',
    'percentagem_capex', 'percentagem_custo_total', 'eur_m2_abc_principal',
    'eur_m2_abc_total', 'eur_unidade', 'percentagem_outra_base'
  ));

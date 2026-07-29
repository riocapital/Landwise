-- ============================================================
-- Landwise — Revisão estrutural, Fase 2: Hard Costs com bases automáticas
--
-- Secção 21 do plano. Adiciona 3 bases granulares (ABC acima, ABC abaixo,
-- ABD) ao enum de tipo_calculo — "Construção acima do solo", "Construção
-- abaixo do solo" e "Construção dependente" passam a ter cada uma a sua
-- área-base automática, em vez de uma escolha genérica entre 2 opções
-- combinadas.
--
-- Sem dados existentes a migrar (nenhum projeto tem linhas de custo neste
-- momento — confirmado antes de aplicar, os 2 projetos reais foram
-- apagados pelo utilizador).
--
-- ADITIVO/CORRETIVO. Executar depois de 0002-0014.
-- ============================================================

alter table project_costs drop constraint if exists project_costs_tipo_calculo_check;

alter table project_costs add constraint project_costs_tipo_calculo_check
  check (tipo_calculo in (
    'valor_fixo', 'percentagem_aquisicao', 'percentagem_hard_costs',
    'percentagem_capex', 'percentagem_custo_total',
    'eur_m2_abc_acima', 'eur_m2_abc_abaixo', 'eur_m2_abd',
    'eur_m2_abc_principal', 'eur_m2_abc_total',
    'eur_unidade', 'percentagem_outra_base'
  ));

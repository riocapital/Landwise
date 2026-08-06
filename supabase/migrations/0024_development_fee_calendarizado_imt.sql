-- ============================================================
-- Landwise — Consolidação pré-relatório 03/08, Gate 3
--
-- Development fee calendarizado (secção 6): fees ganham data inicial,
-- duração e perfil de desembolso próprios, para deixarem de ser um total
-- agregado aplicado depois do cash flow (achado P0.1 da auditoria) e
-- passarem a ser linha(s) mensal(is) reais, com IVA como qualquer outra
-- linha de custo. Também novas bases: valor mensal, % do VGV bruto e %
-- do VGV líquido (achado P1.6).
--
-- IMT como fonte única (secção 12): persiste a configuração do calculador
-- assistido, hoje só em estado local do wizard — perdida a cada reload
-- (achado P1.10).
--
-- ADITIVA. Executar depois de 0002-0023. Não aplicada em produção.
-- ============================================================

alter table project_fees drop constraint if exists project_fees_base_calculo_check;
alter table project_fees add constraint project_fees_base_calculo_check
  check (base_calculo in (
    'percentagem_vgv_bruto', 'percentagem_vgv_liquido',
    'percentagem_aquisicao', 'percentagem_hard_costs', 'percentagem_capex', 'percentagem_custo_total',
    'valor_fixo', 'valor_mensal', 'eur_m2', 'eur_unidade'
  ));

alter table project_fees
  add column if not exists data_inicial date,
  add column if not exists duracao_meses numeric,
  add column if not exists perfil_desembolso text
    check (perfil_desembolso in ('unico_inicio', 'unico_fim', 'linear', 'curva_s', 'front_loaded', 'back_loaded', 'personalizado'))
    default 'unico_inicio',
  add column if not exists taxa_iva numeric,
  add column if not exists iva_recuperavel_pct numeric not null default 0;

alter table projects
  add column if not exists imt_calculador_tipo_imovel text
    check (imt_calculador_tipo_imovel in (
      'outro_urbano_ou_terreno_construcao', 'habitacao_propria_permanente',
      'habitacao_secundaria_ou_arrendamento', 'predio_rustico'
    )),
  add column if not exists imt_calculador_regiao_autonoma boolean not null default false,
  add column if not exists imt_calculador_jovem boolean not null default false,
  add column if not exists imt_calculador_offshore boolean not null default false;

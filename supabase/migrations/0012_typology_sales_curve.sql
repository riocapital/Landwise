-- ============================================================
-- Landwise — Revisão estrutural, Fase 2: Curva de vendas por tipologia
--
-- Secção 15 do plano. Dois campos simples na própria tipologia — não
-- justifica uma tabela nova.
--
-- ADITIVO. Executar depois de 0002-0011.
-- ============================================================

alter table project_typologies
  add column if not exists meses_para_primeira_venda integer not null default 0,
  add column if not exists unidades_por_mes numeric not null default 1;

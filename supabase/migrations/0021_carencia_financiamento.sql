-- ============================================================
-- Landwise — Correções da auditoria: carência do principal
--
-- `periodo_carencia_meses` já existia desde a migration 0005, mas nunca
-- tinha sido ligado a nenhum cálculo (coluna morta). Só falta o prazo
-- total do empréstimo, para saber quantos meses restam de amortização
-- depois da carência.
--
-- carenciaAtiva (no motor de cálculo) é derivada de
-- periodo_carencia_meses > 0 — não precisa de coluna boolean própria.
--
-- ADITIVA. Executar depois de 0002-0020. Não aplicada em produção.
-- ============================================================

alter table project_financing
  add column if not exists prazo_anos numeric not null default 0;

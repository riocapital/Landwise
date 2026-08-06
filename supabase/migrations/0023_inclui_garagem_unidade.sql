-- ============================================================
-- Landwise — Consolidação pré-relatório 03/08, Gate 2
--
-- "Inclui garagem: Sim/Não" por unidade (secção 8 do prompt 03_08) — a
-- identificação geral do projeto mantém garagem/elevador como Sim/Não
-- (tem_garagem/tem_elevador em `projects`, já existentes desde a migration
-- 0002); a Sales Table passa a ter o mesmo atributo AO NÍVEL DA UNIDADE,
-- porque nem todas as unidades de um projeto têm necessariamente garagem.
--
-- Nunca cria prémio automático — é só um atributo de comparabilidade,
-- inicializado a partir de `estacionamentos_incluidos > 0` da tipologia no
-- momento da criação da unidade (ver gerarUnidadesDeTipologia em
-- sales-table.ts), depois livremente editável.
--
-- ADITIVA. Executar depois de 0002-0022. Não aplicada em produção.
-- ============================================================

alter table project_units
  add column if not exists inclui_garagem boolean not null default false;

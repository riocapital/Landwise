-- ============================================================
-- Landwise — Revisão estrutural, Fase 3: Estrutura fiscal IRC vs IRS
--
-- Secção 29 do plano. Nunca aplicar IRC automaticamente a uma pessoa
-- singular ou a uma estrutura não definida — só a "empresa/SPV" tem IRC
-- calculado a partir do motor; os outros casos só permitem uma simulação
-- manual, claramente marcada como não validada.
--
-- `irc_lucro_tributavel` (campo manual solto, nunca ligado ao motor)
-- fica na tabela sem uso — nunca apagar dados, só deixa de ser lido pela
-- aplicação. `irc_ajustes_fiscais` substitui-o: um ajuste sobre o lucro
-- económico calculado pelo motor, não um valor solto.
--
-- ADITIVO. Executar depois de 0002-0017.
-- ============================================================

alter table project_taxes
  add column if not exists estrutura_fiscal_assumida text not null default 'nao_definida'
    check (estrutura_fiscal_assumida in ('empresa_spv', 'pessoa_singular', 'nao_definida', 'outra')),
  add column if not exists irc_ajustes_fiscais numeric not null default 0,
  add column if not exists simulacao_taxa_efetiva_manual numeric,
  add column if not exists simulacao_imposto_estimado_manual numeric;

-- ============================================================
-- Landwise — Gate 4 (prompt 03_08, secção 22): revolver/non-revolver,
-- comissão de compromisso e evento de saída explícito do financiamento.
--
-- revolver: default true preserva o comportamento anterior a esta
-- migration para projetos já configurados (amortizar reabria sempre
-- capacidade do limite). Non-revolver (a norma em financiamento de
-- promoção imobiliária) passa a ser uma escolha explícita por projeto.
--
-- commitment_fee_pct: comissão anual (decimal) sobre o montante não
-- utilizado do limite, separada de structuring_fee_pct (que incide sobre
-- o montante contratado, uma única vez).
--
-- mes_evento_saida: mês "YYYY-MM" opcional em que a dívida é liquidada
-- por venda final ou refinanciamento. null mantém a rede de segurança
-- implícita (liquidação forçada no último mês do horizonte modelado).
--
-- ADITIVA. Executar depois de 0002-0024. Não aplicada em produção.
-- ============================================================

alter table project_financing
  add column if not exists revolver boolean not null default true,
  add column if not exists commitment_fee_pct numeric not null default 0,
  add column if not exists mes_evento_saida text;

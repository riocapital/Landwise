-- ============================================================
-- Landwise — Revisão estrutural, Fase 3: Euribor real (rastreabilidade)
--
-- Secção 23 do plano. Guarda de onde veio a taxa (6M/12M do BCE, ou
-- manual), a data de referência da observação e o nome da fonte — nunca
-- só o número, para nunca apresentar uma estimativa como um facto
-- confirmado sem explicação.
--
-- ADITIVO. Executar depois de 0002-0015.
-- ============================================================

alter table project_financing
  add column if not exists euribor_origem text not null default 'manual' check (euribor_origem in ('6m', '12m', 'manual')),
  add column if not exists euribor_data_referencia text,
  add column if not exists euribor_fonte text;

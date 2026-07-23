// Acesso a `project_financing` — liga o wizard ao motor financiamento.ts.
//
// Um registo por projeto (unique project_id). Só shape mapping e chamadas
// Supabase — a lógica vive em src/lib/calc/financiamento.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParametrosFinanciamento } from "./../calc/financiamento";

export type ProjectFinancingRow = {
  id: string;
  project_id: string;
  com_financiamento: boolean;
  percentagem_hard_costs_financiada: number;
  percentagem_aquisicao_financiada: number;
  euribor: number;
  spread: number;
  metodo_taxa_mensal: ParametrosFinanciamento["metodoTaxaMensal"];
  structuring_fee_pct: number;
  setup_costs: number;
  imposto_selo_emprestimo_pct: number;
  imposto_selo_juros_pct: number;
  limite_credito: number | null;
  data_disponibilidade: string | null;
  periodo_carencia_meses: number | null;
  inicio_amortizacao: string | null;
  fim_amortizacao: string | null;
  metodo_amortizacao: string;
  cash_sweep: boolean;
  capitalizacao_juros: boolean;
  saldo_minimo_caixa: number;
};

export const FINANCIAMENTO_VAZIO: ParametrosFinanciamento = {
  comFinanciamento: false,
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  spread: 0,
  structuringFeePct: 0,
  setupCosts: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
  limiteCredito: null,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
};

export function linhaParaParametros(row: ProjectFinancingRow): ParametrosFinanciamento {
  return {
    comFinanciamento: row.com_financiamento,
    percentagemHardCostsFinanciada: row.percentagem_hard_costs_financiada,
    percentagemAquisicaoFinanciada: row.percentagem_aquisicao_financiada,
    euribor: row.euribor,
    spread: row.spread,
    structuringFeePct: row.structuring_fee_pct,
    setupCosts: row.setup_costs,
    impostoSeloEmprestimoPct: row.imposto_selo_emprestimo_pct,
    impostoSeloJurosPct: row.imposto_selo_juros_pct,
    limiteCredito: row.limite_credito,
    saldoMinimoCaixa: row.saldo_minimo_caixa,
    metodoTaxaMensal: row.metodo_taxa_mensal,
  };
}

export async function carregarFinanciamento(supabase: SupabaseClient, projectId: string): Promise<ParametrosFinanciamento> {
  const { data, error } = await supabase.from("project_financing").select("*").eq("project_id", projectId).maybeSingle();
  if (error || !data) return FINANCIAMENTO_VAZIO;
  return linhaParaParametros(data as ProjectFinancingRow);
}

/** Upsert (um registo por projeto) — cria na primeira gravação, atualiza nas seguintes. */
export async function guardarFinanciamento(supabase: SupabaseClient, projectId: string, parametros: ParametrosFinanciamento): Promise<void> {
  await supabase.from("project_financing").upsert(
    {
      project_id: projectId,
      com_financiamento: parametros.comFinanciamento,
      percentagem_hard_costs_financiada: parametros.percentagemHardCostsFinanciada,
      percentagem_aquisicao_financiada: parametros.percentagemAquisicaoFinanciada,
      euribor: parametros.euribor,
      spread: parametros.spread,
      metodo_taxa_mensal: parametros.metodoTaxaMensal,
      structuring_fee_pct: parametros.structuringFeePct,
      setup_costs: parametros.setupCosts,
      imposto_selo_emprestimo_pct: parametros.impostoSeloEmprestimoPct,
      imposto_selo_juros_pct: parametros.impostoSeloJurosPct,
      limite_credito: parametros.limiteCredito,
      saldo_minimo_caixa: parametros.saldoMinimoCaixa,
    },
    { onConflict: "project_id" }
  );
}

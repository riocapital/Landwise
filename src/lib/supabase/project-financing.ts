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
  euribor_origem: ParametrosFinanciamento["euriborOrigem"];
  euribor_data_referencia: string | null;
  euribor_fonte: string | null;
  spread: number;
  metodo_taxa_mensal: ParametrosFinanciamento["metodoTaxaMensal"];
  structuring_fee_pct: number;
  setup_costs: number;
  setup_costs_pct: number;
  imposto_selo_emprestimo_pct: number;
  imposto_selo_juros_pct: number;
  limite_credito: number | null;
  data_disponibilidade: string | null;
  periodo_carencia_meses: number | null;
  inicio_amortizacao: string | null;
  fim_amortizacao: string | null;
  metodo_amortizacao: string;
  cash_sweep: boolean;
  cash_sweep_pct_caixa_livre: number;
  cash_sweep_meses_custos_futuros: number;
  cash_sweep_inicio_tipo: ParametrosFinanciamento["cashSweepInicioTipo"];
  cash_sweep_inicio_valor_pct: number | null;
  cash_sweep_inicio_data: string | null;
  capitalizacao_juros: boolean;
  saldo_minimo_caixa: number;
  saldo_minimo_meses_reserva: number;
  prazo_anos: number;
  revolver: boolean;
  commitment_fee_pct: number;
  mes_evento_saida: string | null;
};

export const FINANCIAMENTO_VAZIO: ParametrosFinanciamento = {
  comFinanciamento: false,
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0.0185,
  structuringFeePct: 0.02,
  setupCosts: 0,
  setupCostsPct: 0.003,
  impostoSeloEmprestimoPct: 0.005,
  impostoSeloJurosPct: 0.01,
  limiteCredito: null,
  saldoMinimoCaixa: 0,
  saldoMinimoMesesReserva: 6,
  metodoTaxaMensal: "nominal_anual_div_12",
  cashSweepAtivo: false,
  cashSweepPctCaixaLivre: 0.3,
  cashSweepMesesCustosFuturos: 6,
  cashSweepInicioTipo: "primeira_escritura",
  cashSweepInicioValorPct: null,
  cashSweepInicioData: null,
  carenciaAtiva: false,
  carenciaAnos: 0,
  prazoAnos: 0,
  revolver: true,
  commitmentFeePct: 0,
  mesEventoSaida: null,
};

export function linhaParaParametros(row: ProjectFinancingRow): ParametrosFinanciamento {
  return {
    comFinanciamento: row.com_financiamento,
    percentagemHardCostsFinanciada: row.percentagem_hard_costs_financiada,
    percentagemAquisicaoFinanciada: row.percentagem_aquisicao_financiada,
    euribor: row.euribor,
    euriborOrigem: row.euribor_origem,
    euriborDataReferencia: row.euribor_data_referencia,
    euriborFonte: row.euribor_fonte,
    spread: row.spread,
    structuringFeePct: row.structuring_fee_pct,
    setupCosts: row.setup_costs,
    setupCostsPct: row.setup_costs_pct ?? 0.003,
    impostoSeloEmprestimoPct: row.imposto_selo_emprestimo_pct,
    impostoSeloJurosPct: row.imposto_selo_juros_pct,
    limiteCredito: row.limite_credito,
    saldoMinimoCaixa: row.saldo_minimo_caixa,
    saldoMinimoMesesReserva: row.saldo_minimo_meses_reserva ?? 6,
    metodoTaxaMensal: row.metodo_taxa_mensal,
    cashSweepAtivo: row.cash_sweep,
    cashSweepPctCaixaLivre: row.cash_sweep_pct_caixa_livre,
    cashSweepMesesCustosFuturos: row.cash_sweep_meses_custos_futuros,
    cashSweepInicioTipo: row.cash_sweep_inicio_tipo,
    cashSweepInicioValorPct: row.cash_sweep_inicio_valor_pct,
    cashSweepInicioData: row.cash_sweep_inicio_data,
    // carenciaAtiva é derivada de periodo_carencia_meses > 0 — coluna já
    // existia desde a 0005, nunca tinha sido ligada a nenhum cálculo.
    carenciaAtiva: (row.periodo_carencia_meses ?? 0) > 0,
    carenciaAnos: (row.periodo_carencia_meses ?? 0) / 12,
    prazoAnos: row.prazo_anos ?? 0,
    revolver: row.revolver ?? true,
    commitmentFeePct: row.commitment_fee_pct ?? 0,
    mesEventoSaida: row.mes_evento_saida,
  };
}

export async function carregarFinanciamento(supabase: SupabaseClient, projectId: string): Promise<ParametrosFinanciamento> {
  const { data, error } = await supabase.from("project_financing").select("*").eq("project_id", projectId).maybeSingle();
  if (error || !data) return FINANCIAMENTO_VAZIO;
  return linhaParaParametros(data as ProjectFinancingRow);
}

/** Upsert (um registo por projeto) — cria na primeira gravação, atualiza nas seguintes. */
export async function guardarFinanciamento(supabase: SupabaseClient, projectId: string, parametros: ParametrosFinanciamento): Promise<string | null> {
  const { error } = await supabase.from("project_financing").upsert(
    {
      project_id: projectId,
      com_financiamento: parametros.comFinanciamento,
      percentagem_hard_costs_financiada: parametros.percentagemHardCostsFinanciada,
      percentagem_aquisicao_financiada: parametros.percentagemAquisicaoFinanciada,
      euribor: parametros.euribor,
      euribor_origem: parametros.euriborOrigem,
      euribor_data_referencia: parametros.euriborDataReferencia,
      euribor_fonte: parametros.euriborFonte,
      spread: parametros.spread,
      metodo_taxa_mensal: parametros.metodoTaxaMensal,
      structuring_fee_pct: parametros.structuringFeePct,
      setup_costs: parametros.setupCosts,
      setup_costs_pct: parametros.setupCostsPct ?? 0.003,
      imposto_selo_emprestimo_pct: parametros.impostoSeloEmprestimoPct,
      imposto_selo_juros_pct: parametros.impostoSeloJurosPct,
      limite_credito: parametros.limiteCredito,
      saldo_minimo_caixa: parametros.saldoMinimoCaixa,
      saldo_minimo_meses_reserva: parametros.saldoMinimoMesesReserva ?? 6,
      cash_sweep: parametros.cashSweepAtivo,
      cash_sweep_pct_caixa_livre: parametros.cashSweepPctCaixaLivre,
      cash_sweep_meses_custos_futuros: parametros.cashSweepMesesCustosFuturos,
      cash_sweep_inicio_tipo: parametros.cashSweepInicioTipo,
      cash_sweep_inicio_valor_pct: parametros.cashSweepInicioValorPct,
      cash_sweep_inicio_data: parametros.cashSweepInicioData,
      periodo_carencia_meses: parametros.carenciaAtiva ? Math.max(0, Math.round(parametros.carenciaAnos * 12)) : 0,
      prazo_anos: parametros.prazoAnos,
      revolver: parametros.revolver,
      commitment_fee_pct: parametros.commitmentFeePct,
      mes_evento_saida: parametros.mesEventoSaida,
    },
    { onConflict: "project_id" }
  );
  return error?.message ?? null;
}

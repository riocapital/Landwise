// Acesso a `project_capital_structure`, `project_waterfall_tiers` e
// `project_fees` — liga o wizard aos motores estrutura-capital.ts / fees.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModeloCapital } from "./../calc/estrutura-capital";
import type { NivelHurdle } from "./../calc/waterfall";
import type { Fee, TipoFee, BaseCalculoFee, MomentoPagamentoFee } from "./../calc/fees";

export type EstruturaCapitalEstado = {
  temInvestidorExterno: boolean;
  modelo: ModeloCapital;
  percentagemInvestidor: number;
  catchUpAtivo: boolean;
  catchUpPct: number;
};

export const ESTRUTURA_CAPITAL_VAZIA: EstruturaCapitalEstado = {
  temInvestidorExterno: false,
  modelo: "promotor_sozinho",
  percentagemInvestidor: 0,
  catchUpAtivo: false,
  catchUpPct: 0,
};

export async function carregarEstruturaCapital(supabase: SupabaseClient, projectId: string): Promise<EstruturaCapitalEstado> {
  const { data, error } = await supabase.from("project_capital_structure").select("*").eq("project_id", projectId).maybeSingle();
  if (error || !data) return ESTRUTURA_CAPITAL_VAZIA;
  return {
    temInvestidorExterno: data.tem_investidor_externo,
    modelo: data.modelo,
    percentagemInvestidor: data.percentagem_investidor,
    catchUpAtivo: data.catch_up_ativo,
    catchUpPct: data.catch_up_pct ?? 0,
  };
}

export async function guardarEstruturaCapital(supabase: SupabaseClient, projectId: string, estado: EstruturaCapitalEstado): Promise<void> {
  await supabase.from("project_capital_structure").upsert(
    {
      project_id: projectId,
      tem_investidor_externo: estado.temInvestidorExterno,
      modelo: estado.modelo,
      percentagem_investidor: estado.percentagemInvestidor,
      catch_up_ativo: estado.catchUpAtivo,
      catch_up_pct: estado.catchUpPct,
    },
    { onConflict: "project_id" }
  );
}

// --- Hurdle tiers ---

export type HurdleRow = { id: string; project_id: string; hurdle_irr: number; promote_pct_acima: number; ordem: number };

export async function listarHurdles(supabase: SupabaseClient, projectId: string): Promise<(NivelHurdle & { id: string })[]> {
  const { data, error } = await supabase.from("project_waterfall_tiers").select("*").eq("project_id", projectId).order("ordem", { ascending: true });
  if (error || !data) return [];
  return (data as HurdleRow[]).map((r) => ({ id: r.id, hurdleIRR: r.hurdle_irr, promotePctAcima: r.promote_pct_acima }));
}

export async function criarHurdle(supabase: SupabaseClient, projectId: string, ordem: number): Promise<(NivelHurdle & { id: string }) | null> {
  const { data, error } = await supabase
    .from("project_waterfall_tiers")
    .insert({ project_id: projectId, hurdle_irr: 0.08, promote_pct_acima: 0.2, ordem })
    .select()
    .single();
  if (error || !data) return null;
  const r = data as HurdleRow;
  return { id: r.id, hurdleIRR: r.hurdle_irr, promotePctAcima: r.promote_pct_acima };
}

export async function atualizarHurdle(supabase: SupabaseClient, id: string, patch: Partial<NivelHurdle>): Promise<void> {
  const dbPatch: Record<string, number> = {};
  if (patch.hurdleIRR !== undefined) dbPatch.hurdle_irr = patch.hurdleIRR;
  if (patch.promotePctAcima !== undefined) dbPatch.promote_pct_acima = patch.promotePctAcima;
  await supabase.from("project_waterfall_tiers").update(dbPatch).eq("id", id);
}

export async function apagarHurdle(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("project_waterfall_tiers").delete().eq("id", id);
}

// --- Fees ---

export type FeeRow = {
  id: string;
  project_id: string;
  nome: string;
  tipo: TipoFee;
  base_calculo: BaseCalculoFee;
  valor_input: number;
  momento_pagamento: MomentoPagamentoFee;
  data_personalizada: string | null;
  ordem: number;
};

function linhaParaFee(r: FeeRow): Fee {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    baseCalculo: r.base_calculo,
    valorInput: r.valor_input,
    momentoPagamento: r.momento_pagamento,
    dataPersonalizada: r.data_personalizada,
  };
}

export async function listarFees(supabase: SupabaseClient, projectId: string): Promise<Fee[]> {
  const { data, error } = await supabase.from("project_fees").select("*").eq("project_id", projectId).order("ordem", { ascending: true });
  if (error || !data) return [];
  return (data as FeeRow[]).map(linhaParaFee);
}

export async function criarFee(supabase: SupabaseClient, projectId: string, tipo: TipoFee, nome: string, ordem: number): Promise<Fee | null> {
  const { data, error } = await supabase
    .from("project_fees")
    .insert({ project_id: projectId, nome, tipo, base_calculo: "valor_fixo", valor_input: 0, momento_pagamento: "aquisicao", ordem })
    .select()
    .single();
  if (error || !data) return null;
  return linhaParaFee(data as FeeRow);
}

export async function atualizarFee(supabase: SupabaseClient, id: string, patch: Partial<Fee>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.nome !== undefined) dbPatch.nome = patch.nome;
  if (patch.baseCalculo !== undefined) dbPatch.base_calculo = patch.baseCalculo;
  if (patch.valorInput !== undefined) dbPatch.valor_input = patch.valorInput;
  if (patch.momentoPagamento !== undefined) dbPatch.momento_pagamento = patch.momentoPagamento;
  await supabase.from("project_fees").update(dbPatch).eq("id", id);
}

export async function apagarFee(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("project_fees").delete().eq("id", id);
}

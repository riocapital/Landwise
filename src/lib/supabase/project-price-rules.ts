// Acesso a `project_price_rules` — regras de evolução de preços.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegraEvolucaoPreco, EscopoRegraPreco, TipoGatilhoPreco } from "./../calc/price-escalation";

export type ProjectPriceRuleRow = {
  id: string;
  project_id: string;
  escopo_tipo: "geral" | "tipologia";
  tipologia_id: string | null;
  gatilho: TipoGatilhoPreco;
  valor_gatilho_numero: number | null;
  valor_gatilho_data: string | null;
  ajuste_pct: number;
  modo: "cumulativo" | "substituicao";
  ordem: number;
  observacao: string | null;
};

function linhaParaRegra(r: ProjectPriceRuleRow): RegraEvolucaoPreco {
  const escopo: EscopoRegraPreco = r.escopo_tipo === "tipologia" && r.tipologia_id ? { tipo: "tipologia", tipologiaId: r.tipologia_id } : { tipo: "geral" };
  return {
    id: r.id,
    escopo,
    gatilho: r.gatilho,
    valorGatilhoNumero: r.valor_gatilho_numero,
    valorGatilhoData: r.valor_gatilho_data,
    ajustePct: r.ajuste_pct,
    modo: r.modo,
    ordem: r.ordem,
    observacao: r.observacao,
  };
}

export async function listarRegrasPreco(supabase: SupabaseClient, projectId: string): Promise<RegraEvolucaoPreco[]> {
  const { data, error } = await supabase.from("project_price_rules").select("*").eq("project_id", projectId).order("ordem", { ascending: true });
  if (error || !data) return [];
  return (data as ProjectPriceRuleRow[]).map(linhaParaRegra);
}

export async function criarRegraPreco(supabase: SupabaseClient, projectId: string, ordem: number): Promise<RegraEvolucaoPreco | null> {
  const { data, error } = await supabase
    .from("project_price_rules")
    .insert({ project_id: projectId, escopo_tipo: "geral", gatilho: "meses_apos_lancamento", valor_gatilho_numero: 0, ajuste_pct: 0, ordem })
    .select()
    .single();
  if (error || !data) return null;
  return linhaParaRegra(data as ProjectPriceRuleRow);
}

export async function atualizarRegraPreco(supabase: SupabaseClient, id: string, patch: Partial<RegraEvolucaoPreco>): Promise<string | null> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.escopo !== undefined) {
    dbPatch.escopo_tipo = patch.escopo.tipo;
    dbPatch.tipologia_id = patch.escopo.tipo === "tipologia" ? patch.escopo.tipologiaId : null;
  }
  if (patch.gatilho !== undefined) dbPatch.gatilho = patch.gatilho;
  if (patch.valorGatilhoNumero !== undefined) dbPatch.valor_gatilho_numero = patch.valorGatilhoNumero;
  if (patch.valorGatilhoData !== undefined) dbPatch.valor_gatilho_data = patch.valorGatilhoData;
  if (patch.ajustePct !== undefined) dbPatch.ajuste_pct = patch.ajustePct;
  if (patch.modo !== undefined) dbPatch.modo = patch.modo;
  if (patch.observacao !== undefined) dbPatch.observacao = patch.observacao;

  const { error } = await supabase.from("project_price_rules").update(dbPatch).eq("id", id);
  return error?.message ?? null;
}

export async function apagarRegraPreco(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("project_price_rules").delete().eq("id", id);
}

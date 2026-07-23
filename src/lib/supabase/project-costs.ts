// Acesso a `project_costs` — Fase de wiring do wizard (Aquisição e Custos).
//
// Só shape mapping (snake_case DB <-> camelCase do motor custos.ts) e
// chamadas Supabase. Nenhuma lógica de cálculo — essa vive em
// src/lib/calc/custos.ts (secção 19 do plano: um único motor).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinhaCusto, GrupoCusto, TipoCalculoCusto } from "./../calc/custos";

export type ProjectCostRow = {
  id: string;
  project_id: string;
  grupo: GrupoCusto;
  categoria: string;
  nome: string;
  descricao: string | null;
  tipo_calculo: TipoCalculoCusto;
  valor_input: number;
  base_referencia_custo_id: string | null;
  taxa_iva: number | null;
  iva_recuperavel_pct: number;
  data_iva_recuperacao: string | null;
  data_inicial: string | null;
  duracao_meses: number | null;
  data_final: string | null;
  perfil_desembolso: LinhaCusto["perfilDesembolso"];
  observacoes: string | null;
  ordem: number;
};

export function linhaParaLinhaCusto(row: ProjectCostRow): LinhaCusto {
  return {
    id: row.id,
    grupo: row.grupo,
    categoria: row.categoria,
    nome: row.nome,
    tipoCalculo: row.tipo_calculo,
    valorInput: row.valor_input,
    baseReferenciaCustoId: row.base_referencia_custo_id,
    taxaIva: row.taxa_iva,
    ivaRecuperavelPct: row.iva_recuperavel_pct,
    dataIvaRecuperacao: row.data_iva_recuperacao,
    dataInicial: row.data_inicial,
    duracaoMeses: row.duracao_meses,
    dataFinal: row.data_final,
    perfilDesembolso: row.perfil_desembolso,
  };
}

export async function listarCustosProjeto(supabase: SupabaseClient, projectId: string): Promise<LinhaCusto[]> {
  const { data, error } = await supabase.from("project_costs").select("*").eq("project_id", projectId).order("ordem", { ascending: true });
  if (error || !data) return [];
  return (data as ProjectCostRow[]).map(linhaParaLinhaCusto);
}

export async function criarCusto(supabase: SupabaseClient, projectId: string, grupo: GrupoCusto, nome: string, ordem: number): Promise<LinhaCusto | null> {
  const { data, error } = await supabase
    .from("project_costs")
    .insert({ project_id: projectId, grupo, categoria: nome, nome, tipo_calculo: "valor_fixo", valor_input: 0, ordem })
    .select()
    .single();
  if (error || !data) return null;
  return linhaParaLinhaCusto(data as ProjectCostRow);
}

export async function atualizarCusto(supabase: SupabaseClient, id: string, patch: Partial<LinhaCusto>): Promise<void> {
  const dbPatch: Partial<ProjectCostRow> = {};
  if (patch.nome !== undefined) dbPatch.nome = patch.nome;
  if (patch.tipoCalculo !== undefined) dbPatch.tipo_calculo = patch.tipoCalculo;
  if (patch.valorInput !== undefined) dbPatch.valor_input = patch.valorInput;
  if (patch.taxaIva !== undefined) dbPatch.taxa_iva = patch.taxaIva;
  if (patch.ivaRecuperavelPct !== undefined) dbPatch.iva_recuperavel_pct = patch.ivaRecuperavelPct;
  if (patch.dataInicial !== undefined) dbPatch.data_inicial = patch.dataInicial;
  if (patch.duracaoMeses !== undefined) dbPatch.duracao_meses = patch.duracaoMeses;
  if (patch.dataFinal !== undefined) dbPatch.data_final = patch.dataFinal;
  if (patch.perfilDesembolso !== undefined) dbPatch.perfil_desembolso = patch.perfilDesembolso;

  await supabase.from("project_costs").update(dbPatch).eq("id", id);
}

export async function apagarCusto(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("project_costs").delete().eq("id", id);
}

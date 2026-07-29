// Acesso a `project_scenarios` — liga o wizard ao motor cenarios.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { criarCenarioBase, type Cenario } from "./../calc/cenarios";

export type ProjectScenarioRow = {
  id: string;
  project_id: string;
  nome: string;
  eh_base: boolean;
  delta_aquisicao: number;
  delta_construcao: number;
  delta_preco: number;
  autor: string | null;
  created_at: string;
};

function linhaParaCenario(r: ProjectScenarioRow): Cenario {
  return {
    id: r.id,
    nome: r.nome,
    ehBase: r.eh_base,
    deltaAquisicao: r.delta_aquisicao,
    deltaConstrucao: r.delta_construcao,
    deltaPreco: r.delta_preco,
    criadoEm: r.created_at,
    autor: r.autor,
  };
}

/** Lista os cenários do projeto — cria o cenário-base automaticamente se ainda não existir nenhum. */
export async function listarCenarios(supabase: SupabaseClient, projectId: string): Promise<Cenario[]> {
  const { data, error } = await supabase.from("project_scenarios").select("*").eq("project_id", projectId).order("created_at", { ascending: true });
  if (error) return [criarCenarioBase()];

  if (!data || data.length === 0) {
    const base = criarCenarioBase();
    const { data: criado } = await supabase
      .from("project_scenarios")
      .insert({ project_id: projectId, nome: base.nome, eh_base: true, delta_aquisicao: 0, delta_construcao: 0, delta_preco: 0 })
      .select()
      .single();
    return criado ? [linhaParaCenario(criado as ProjectScenarioRow)] : [base];
  }

  return (data as ProjectScenarioRow[]).map(linhaParaCenario);
}

export async function criarCenario(supabase: SupabaseClient, projectId: string, cenario: Cenario): Promise<Cenario | null> {
  const { data, error } = await supabase
    .from("project_scenarios")
    .insert({
      project_id: projectId,
      nome: cenario.nome,
      eh_base: false, // nunca cria um segundo cenário-base
      delta_aquisicao: cenario.deltaAquisicao,
      delta_construcao: cenario.deltaConstrucao,
      delta_preco: cenario.deltaPreco,
      autor: cenario.autor,
    })
    .select()
    .single();
  if (error || !data) return null;
  return linhaParaCenario(data as ProjectScenarioRow);
}

export async function atualizarCenario(supabase: SupabaseClient, id: string, patch: Partial<Cenario>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.nome !== undefined) dbPatch.nome = patch.nome;
  if (patch.deltaAquisicao !== undefined) dbPatch.delta_aquisicao = patch.deltaAquisicao;
  if (patch.deltaConstrucao !== undefined) dbPatch.delta_construcao = patch.deltaConstrucao;
  if (patch.deltaPreco !== undefined) dbPatch.delta_preco = patch.deltaPreco;
  // eh_base nunca é atualizável a partir do wizard — protege o cenário-base na origem.
  await supabase.from("project_scenarios").update(dbPatch).eq("id", id);
}

/** Nunca apaga o cenário-base — o chamador deve verificar `podeApagarCenario` antes, mas esta função também recusa por segurança. */
export async function apagarCenario(supabase: SupabaseClient, cenario: Cenario): Promise<boolean> {
  if (cenario.ehBase) return false;
  await supabase.from("project_scenarios").delete().eq("id", cenario.id);
  return true;
}

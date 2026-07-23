// Acesso a `project_timeline` — liga o wizard ao motor calendario.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Atividade } from "./../calc/calendario";

export type ProjectTimelineRow = {
  id: string;
  project_id: string;
  nome: string;
  data_inicial: string | null;
  duracao_meses: number | null;
  data_final: string | null;
  perfil_desembolso: Atividade["perfilDesembolso"];
  dependencia_id: string | null;
  observacoes: string | null;
  ordem: number;
};

function linhaParaAtividade(r: ProjectTimelineRow): Atividade {
  return {
    id: r.id,
    nome: r.nome,
    dataInicial: r.data_inicial,
    duracaoMeses: r.duracao_meses,
    dataFinal: r.data_final,
    perfilDesembolso: r.perfil_desembolso,
    dependenciaId: r.dependencia_id,
    observacoes: r.observacoes,
    ordem: r.ordem,
  };
}

export async function listarAtividades(supabase: SupabaseClient, projectId: string): Promise<Atividade[]> {
  const { data, error } = await supabase.from("project_timeline").select("*").eq("project_id", projectId).order("ordem", { ascending: true });
  if (error || !data) return [];
  return (data as ProjectTimelineRow[]).map(linhaParaAtividade);
}

export async function criarAtividade(supabase: SupabaseClient, projectId: string, nome: string, ordem: number): Promise<Atividade | null> {
  const { data, error } = await supabase.from("project_timeline").insert({ project_id: projectId, nome, ordem }).select().single();
  if (error || !data) return null;
  return linhaParaAtividade(data as ProjectTimelineRow);
}

export async function atualizarAtividade(supabase: SupabaseClient, id: string, patch: Partial<Atividade>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.nome !== undefined) dbPatch.nome = patch.nome;
  if (patch.dataInicial !== undefined) dbPatch.data_inicial = patch.dataInicial;
  if (patch.duracaoMeses !== undefined) dbPatch.duracao_meses = patch.duracaoMeses;
  if (patch.dataFinal !== undefined) dbPatch.data_final = patch.dataFinal;
  if (patch.perfilDesembolso !== undefined) dbPatch.perfil_desembolso = patch.perfilDesembolso;
  if (patch.dependenciaId !== undefined) dbPatch.dependencia_id = patch.dependenciaId;
  if (patch.observacoes !== undefined) dbPatch.observacoes = patch.observacoes;
  if (patch.ordem !== undefined) dbPatch.ordem = patch.ordem;
  await supabase.from("project_timeline").update(dbPatch).eq("id", id);
}

export async function apagarAtividade(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("project_timeline").delete().eq("id", id);
}

export async function duplicarAtividade(supabase: SupabaseClient, projectId: string, original: Atividade, ordem: number): Promise<Atividade | null> {
  const { data, error } = await supabase
    .from("project_timeline")
    .insert({
      project_id: projectId,
      nome: `${original.nome} (cópia)`,
      data_inicial: original.dataInicial,
      duracao_meses: original.duracaoMeses,
      data_final: original.dataFinal,
      perfil_desembolso: original.perfilDesembolso,
      observacoes: original.observacoes,
      ordem,
    })
    .select()
    .single();
  if (error || !data) return null;
  return linhaParaAtividade(data as ProjectTimelineRow);
}

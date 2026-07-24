// Acesso a `project_typologies` — Fase 2 (liga o wizard ao motor de áreas real).
//
// Mantém o wizard mais limpo: aqui só shape mapping (snake_case DB <-> camelCase
// do motor areas.ts) e chamadas Supabase. Nenhuma lógica de cálculo — essa
// vive só em src/lib/calc/areas.ts (secção 19 do plano: um único motor).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Typology } from "../calc/areas";

export type ProjectTypologyRow = {
  id: string;
  project_id: string;
  nome: string;
  quantidade: number;
  abp_unidade: number;
  varanda_m2: number;
  varanda_pct_valorizacao: number;
  terraco_m2: number;
  terraco_pct_valorizacao: number;
  jardim_privativo_m2: number;
  jardim_pct_valorizacao: number;
  arrecadacao_m2: number;
  arrecadacao_pct_valorizacao: number;
  estacionamentos_incluidos: number;
  valor_estacionamento: number;
  preco_base_m2: number;
  preco_sugerido_m2: number | null;
  metodo_precificacao: Typology["metodoPrecificacao"];
  preco_manual_unidade: number | null;
  meses_para_primeira_venda: number;
  unidades_por_mes: number;
  ordem: number;
};

/** Converte uma linha da BD (snake_case) para o shape usado por areas.ts (camelCase). */
export function linhaParaTypology(row: ProjectTypologyRow): Typology {
  return {
    id: row.id,
    nome: row.nome,
    quantidade: row.quantidade,
    abpUnidade: row.abp_unidade,
    varandaM2: row.varanda_m2,
    varandaPctValorizacao: row.varanda_pct_valorizacao,
    terracoM2: row.terraco_m2,
    terracoPctValorizacao: row.terraco_pct_valorizacao,
    jardimPrivativoM2: row.jardim_privativo_m2,
    jardimPctValorizacao: row.jardim_pct_valorizacao,
    arrecadacaoM2: row.arrecadacao_m2,
    arrecadacaoPctValorizacao: row.arrecadacao_pct_valorizacao,
    estacionamentosIncluidos: row.estacionamentos_incluidos,
    valorEstacionamento: row.valor_estacionamento,
    precoBaseM2: row.preco_base_m2,
    metodoPrecificacao: row.metodo_precificacao,
    precoManualUnidade: row.preco_manual_unidade,
    mesesParaPrimeiraVenda: row.meses_para_primeira_venda,
    unidadesPorMes: row.unidades_por_mes,
  };
}

export async function listarTipologiasProjeto(
  supabase: SupabaseClient,
  projectId: string
): Promise<Typology[]> {
  const { data, error } = await supabase
    .from("project_typologies")
    .select("*")
    .eq("project_id", projectId)
    .order("ordem", { ascending: true });
  if (error || !data) return [];
  return (data as ProjectTypologyRow[]).map(linhaParaTypology);
}

/** Cria uma tipologia nova com valores de referência editáveis. */
export async function criarTipologia(
  supabase: SupabaseClient,
  projectId: string,
  ordem: number
): Promise<Typology | null> {
  const { data, error } = await supabase
    .from("project_typologies")
    .insert({
      project_id: projectId,
      nome: `T${ordem}`,
      quantidade: 1,
      abp_unidade: 80,
      varanda_m2: 10,
      varanda_pct_valorizacao: 0.3,
      arrecadacao_m2: 0,
      preco_base_m2: 3800,
      ordem,
    })
    .select()
    .single();
  if (error || !data) return null;
  return linhaParaTypology(data as ProjectTypologyRow);
}

/** Atualiza campos de uma tipologia (aceita shape camelCase parcial do motor). */
export async function atualizarTipologia(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Typology>
): Promise<void> {
  const dbPatch: Partial<ProjectTypologyRow> = {};
  if (patch.nome !== undefined) dbPatch.nome = patch.nome;
  if (patch.quantidade !== undefined) dbPatch.quantidade = patch.quantidade;
  if (patch.abpUnidade !== undefined) dbPatch.abp_unidade = patch.abpUnidade;
  if (patch.varandaM2 !== undefined) dbPatch.varanda_m2 = patch.varandaM2;
  if (patch.varandaPctValorizacao !== undefined) dbPatch.varanda_pct_valorizacao = patch.varandaPctValorizacao;
  if (patch.terracoM2 !== undefined) dbPatch.terraco_m2 = patch.terracoM2;
  if (patch.terracoPctValorizacao !== undefined) dbPatch.terraco_pct_valorizacao = patch.terracoPctValorizacao;
  if (patch.jardimPrivativoM2 !== undefined) dbPatch.jardim_privativo_m2 = patch.jardimPrivativoM2;
  if (patch.jardimPctValorizacao !== undefined) dbPatch.jardim_pct_valorizacao = patch.jardimPctValorizacao;
  if (patch.arrecadacaoM2 !== undefined) dbPatch.arrecadacao_m2 = patch.arrecadacaoM2;
  if (patch.arrecadacaoPctValorizacao !== undefined) dbPatch.arrecadacao_pct_valorizacao = patch.arrecadacaoPctValorizacao;
  if (patch.estacionamentosIncluidos !== undefined) dbPatch.estacionamentos_incluidos = patch.estacionamentosIncluidos;
  if (patch.valorEstacionamento !== undefined) dbPatch.valor_estacionamento = patch.valorEstacionamento;
  if (patch.precoBaseM2 !== undefined) dbPatch.preco_base_m2 = patch.precoBaseM2;
  if (patch.metodoPrecificacao !== undefined) dbPatch.metodo_precificacao = patch.metodoPrecificacao;
  if (patch.precoManualUnidade !== undefined) dbPatch.preco_manual_unidade = patch.precoManualUnidade;
  if (patch.mesesParaPrimeiraVenda !== undefined) dbPatch.meses_para_primeira_venda = patch.mesesParaPrimeiraVenda;
  if (patch.unidadesPorMes !== undefined) dbPatch.unidades_por_mes = patch.unidadesPorMes;

  await supabase.from("project_typologies").update(dbPatch).eq("id", id);
}

export async function apagarTipologia(supabase: SupabaseClient, id: string): Promise<void> {
  await supabase.from("project_typologies").delete().eq("id", id);
}

export async function guardarPrecoSugerido(
  supabase: SupabaseClient,
  id: string,
  precoSugeridoM2: number | null
): Promise<void> {
  await supabase.from("project_typologies").update({ preco_sugerido_m2: precoSugeridoM2 }).eq("id", id);
}

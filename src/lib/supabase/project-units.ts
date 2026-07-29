// Acesso a `project_units` — a Sales Table (fonte única do VGV).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UnidadeVenda } from "./../calc/sales-table";

export type ProjectUnitRow = {
  id: string;
  project_id: string;
  typology_id: string;
  ordem: number;
  bloco: string | null;
  piso: string | null;
  abp: number;
  varanda_m2: number;
  terraco_m2: number;
  outras_areas_m2: number;
  estacionamentos: number;
  valor_estacionamento: number;
  preco_base_m2: number;
  ajuste_fase_comercial_pct: number;
  premio_desconto_unidade: number;
  override_manual_valor: number | null;
  preco_bloqueado: boolean;
  personalizada: boolean;
  data_venda: string | null;
  sinal_valor: number;
  reforcos_valor: number;
  data_escritura: string | null;
  estado_comercial: UnidadeVenda["estadoComercial"];
};

function linhaParaUnidade(r: ProjectUnitRow): UnidadeVenda {
  return {
    id: r.id,
    tipologiaId: r.typology_id,
    ordem: r.ordem,
    bloco: r.bloco,
    piso: r.piso,
    abp: r.abp,
    varandaM2: r.varanda_m2,
    terracoM2: r.terraco_m2,
    outrasAreasM2: r.outras_areas_m2,
    estacionamentos: r.estacionamentos,
    valorEstacionamento: r.valor_estacionamento,
    precoBaseM2: r.preco_base_m2,
    ajusteFaseComercialPct: r.ajuste_fase_comercial_pct,
    premioDescontoUnidade: r.premio_desconto_unidade,
    overrideManualValor: r.override_manual_valor,
    precoBloqueado: r.preco_bloqueado,
    personalizada: r.personalizada,
    dataVenda: r.data_venda,
    sinalValor: r.sinal_valor,
    reforcosValor: r.reforcos_valor,
    dataEscritura: r.data_escritura,
    estadoComercial: r.estado_comercial,
  };
}

export async function listarUnidades(supabase: SupabaseClient, projectId: string): Promise<UnidadeVenda[]> {
  const { data, error } = await supabase.from("project_units").select("*").eq("project_id", projectId).order("ordem", { ascending: true });
  if (error || !data) return [];
  return (data as ProjectUnitRow[]).map(linhaParaUnidade);
}

export async function criarUnidades(supabase: SupabaseClient, projectId: string, unidades: UnidadeVenda[]): Promise<UnidadeVenda[]> {
  const { data, error } = await supabase
    .from("project_units")
    .insert(
      unidades.map((u) => ({
        project_id: projectId,
        typology_id: u.tipologiaId,
        ordem: u.ordem,
        abp: u.abp,
        varanda_m2: u.varandaM2,
        terraco_m2: u.terracoM2,
        outras_areas_m2: u.outrasAreasM2,
        estacionamentos: u.estacionamentos,
        valor_estacionamento: u.valorEstacionamento,
        preco_base_m2: u.precoBaseM2,
        estado_comercial: u.estadoComercial,
      }))
    )
    .select();
  if (error || !data) return [];
  return (data as ProjectUnitRow[]).map(linhaParaUnidade);
}

export async function atualizarUnidade(supabase: SupabaseClient, id: string, patch: Partial<UnidadeVenda>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.bloco !== undefined) dbPatch.bloco = patch.bloco;
  if (patch.piso !== undefined) dbPatch.piso = patch.piso;
  if (patch.ajusteFaseComercialPct !== undefined) dbPatch.ajuste_fase_comercial_pct = patch.ajusteFaseComercialPct;
  if (patch.premioDescontoUnidade !== undefined) dbPatch.premio_desconto_unidade = patch.premioDescontoUnidade;
  if (patch.overrideManualValor !== undefined) dbPatch.override_manual_valor = patch.overrideManualValor;
  if (patch.precoBloqueado !== undefined) dbPatch.preco_bloqueado = patch.precoBloqueado;
  if (patch.personalizada !== undefined) dbPatch.personalizada = patch.personalizada;
  if (patch.dataVenda !== undefined) dbPatch.data_venda = patch.dataVenda;
  if (patch.sinalValor !== undefined) dbPatch.sinal_valor = patch.sinalValor;
  if (patch.reforcosValor !== undefined) dbPatch.reforcos_valor = patch.reforcosValor;
  if (patch.dataEscritura !== undefined) dbPatch.data_escritura = patch.dataEscritura;
  if (patch.estadoComercial !== undefined) dbPatch.estado_comercial = patch.estadoComercial;

  await supabase.from("project_units").update(dbPatch).eq("id", id);
}

export async function apagarUnidades(supabase: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase.from("project_units").delete().in("id", ids);
}

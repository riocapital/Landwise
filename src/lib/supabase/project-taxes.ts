// Acesso a `project_taxes` — liga o wizard ao motor impostos.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ImpostosEstado = {
  seguroTaxa: number;
  seguroDataInicial: string | null;
  seguroDuracaoAnos: number;
  imiVpt: number | null;
  imiTaxa: number;
  imiNumAnos: number;
  imiDataInicial: string | null;
  ircAnoFiscalReferencia: number;
  ircTaxaManual: number | null;
  ircLucroTributavel: number | null;
  ircPrejuizosFiscaisAcumulados: number;
  derramaMunicipalTaxa: number;
  imtMetodo: "percentagem" | "valor_manual";
  imtValor: number;
  impostoSeloAquisicaoTaxa: number;
};

export const IMPOSTOS_VAZIO: ImpostosEstado = {
  seguroTaxa: 0.002,
  seguroDataInicial: null,
  seguroDuracaoAnos: 1,
  imiVpt: null,
  imiTaxa: 0.003,
  imiNumAnos: 1,
  imiDataInicial: null,
  ircAnoFiscalReferencia: new Date().getFullYear(),
  ircTaxaManual: null,
  ircLucroTributavel: null,
  ircPrejuizosFiscaisAcumulados: 0,
  derramaMunicipalTaxa: 0,
  imtMetodo: "percentagem",
  imtValor: 0.065,
  impostoSeloAquisicaoTaxa: 0.008,
};

export async function carregarImpostos(supabase: SupabaseClient, projectId: string): Promise<ImpostosEstado> {
  const { data, error } = await supabase.from("project_taxes").select("*").eq("project_id", projectId).maybeSingle();
  if (error || !data) return IMPOSTOS_VAZIO;
  return {
    seguroTaxa: data.seguro_taxa ?? IMPOSTOS_VAZIO.seguroTaxa,
    seguroDataInicial: data.seguro_data_inicial,
    seguroDuracaoAnos: data.seguro_duracao_anos ?? 1,
    imiVpt: data.imi_vpt,
    imiTaxa: data.imi_taxa ?? IMPOSTOS_VAZIO.imiTaxa,
    imiNumAnos: data.imi_num_anos ?? 1,
    imiDataInicial: data.imi_data_inicial,
    ircAnoFiscalReferencia: data.irc_ano_fiscal_referencia ?? IMPOSTOS_VAZIO.ircAnoFiscalReferencia,
    ircTaxaManual: data.irc_taxa_manual,
    ircLucroTributavel: data.irc_lucro_tributavel,
    ircPrejuizosFiscaisAcumulados: data.irc_prejuizos_fiscais_acumulados ?? 0,
    derramaMunicipalTaxa: data.derrama_municipal_taxa ?? 0,
    imtMetodo: data.imt_metodo ?? "percentagem",
    imtValor: data.imt_valor ?? IMPOSTOS_VAZIO.imtValor,
    impostoSeloAquisicaoTaxa: data.imposto_selo_aquisicao_taxa ?? IMPOSTOS_VAZIO.impostoSeloAquisicaoTaxa,
  };
}

export async function guardarImpostos(supabase: SupabaseClient, projectId: string, estado: ImpostosEstado): Promise<void> {
  await supabase.from("project_taxes").upsert(
    {
      project_id: projectId,
      seguro_taxa: estado.seguroTaxa,
      seguro_data_inicial: estado.seguroDataInicial,
      seguro_duracao_anos: estado.seguroDuracaoAnos,
      imi_vpt: estado.imiVpt,
      imi_taxa: estado.imiTaxa,
      imi_num_anos: estado.imiNumAnos,
      imi_data_inicial: estado.imiDataInicial,
      irc_ano_fiscal_referencia: estado.ircAnoFiscalReferencia,
      irc_taxa_manual: estado.ircTaxaManual,
      irc_lucro_tributavel: estado.ircLucroTributavel,
      irc_prejuizos_fiscais_acumulados: estado.ircPrejuizosFiscaisAcumulados,
      derrama_municipal_taxa: estado.derramaMunicipalTaxa,
      imt_metodo: estado.imtMetodo,
      imt_valor: estado.imtValor,
      imposto_selo_aquisicao_taxa: estado.impostoSeloAquisicaoTaxa,
    },
    { onConflict: "project_id" }
  );
}

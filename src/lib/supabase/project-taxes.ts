// Acesso a `project_taxes` — liga o wizard ao motor impostos.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstruturaFiscalAssumida, RegimeIRC } from "./../calc/impostos";

export type ImpostosEstado = {
  seguroTaxa: number;
  seguroDataInicial: string | null;
  seguroDuracaoAnos: number;
  imiVpt: number | null;
  imiTaxa: number;
  imiNumAnos: number;
  imiDataInicial: string | null;
  estruturaFiscalAssumida: EstruturaFiscalAssumida; // secção 29 do plano
  ircAnoFiscalReferencia: number;
  ircRegime: RegimeIRC;
  ircTaxaManual: number | null;
  ircAjustesFiscais: number; // +/- diferença entre lucro económico e tributável, ligado ao motor (nunca um valor solto)
  ircPrejuizosFiscaisAcumulados: number;
  simulacaoTaxaEfetivaManual: number | null; // só para pessoa_singular/nao_definida/outra — premissa manual não validada
  simulacaoImpostoEstimadoManual: number | null;
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
  estruturaFiscalAssumida: "nao_definida",
  ircAnoFiscalReferencia: new Date().getFullYear(),
  ircRegime: "geral",
  ircTaxaManual: null,
  ircAjustesFiscais: 0,
  ircPrejuizosFiscaisAcumulados: 0,
  simulacaoTaxaEfetivaManual: null,
  simulacaoImpostoEstimadoManual: null,
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
    estruturaFiscalAssumida: data.estrutura_fiscal_assumida ?? "nao_definida",
    ircAnoFiscalReferencia: data.irc_ano_fiscal_referencia ?? IMPOSTOS_VAZIO.ircAnoFiscalReferencia,
    ircRegime: data.irc_regime ?? "geral",
    ircTaxaManual: data.irc_taxa_manual,
    ircAjustesFiscais: data.irc_ajustes_fiscais ?? 0,
    ircPrejuizosFiscaisAcumulados: data.irc_prejuizos_fiscais_acumulados ?? 0,
    simulacaoTaxaEfetivaManual: data.simulacao_taxa_efetiva_manual,
    simulacaoImpostoEstimadoManual: data.simulacao_imposto_estimado_manual,
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
      estrutura_fiscal_assumida: estado.estruturaFiscalAssumida,
      irc_ano_fiscal_referencia: estado.ircAnoFiscalReferencia,
      irc_regime: estado.ircRegime,
      irc_taxa_manual: estado.ircTaxaManual,
      irc_ajustes_fiscais: estado.ircAjustesFiscais,
      irc_prejuizos_fiscais_acumulados: estado.ircPrejuizosFiscaisAcumulados,
      simulacao_taxa_efetiva_manual: estado.simulacaoTaxaEfetivaManual,
      simulacao_imposto_estimado_manual: estado.simulacaoImpostoEstimadoManual,
      derrama_municipal_taxa: estado.derramaMunicipalTaxa,
      imt_metodo: estado.imtMetodo,
      imt_valor: estado.imtValor,
      imposto_selo_aquisicao_taxa: estado.impostoSeloAquisicaoTaxa,
    },
    { onConflict: "project_id" }
  );
}

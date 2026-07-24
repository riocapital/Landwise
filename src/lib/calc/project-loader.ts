// Carregador partilhado do resultado completo de um projeto — motor novo.
//
// Reutiliza os data-access helpers já existentes (nenhuma duplicação de
// lógica de leitura). Calcula o resultado com os mesmos motores usados no
// wizard (cashflow.ts, estrutura-capital.ts) — a mesma fonte de verdade
// para o dashboard, o wizard e, no futuro, o relatório (secção 19 do
// plano: "não calcular o mesmo indicador de maneiras diferentes em
// páginas diferentes").

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcResumoPrograma, calcAbcTotalProgramado, calcEficiencia, type Typology } from "./areas";
import { resolverSalesTable, calcVgvBruto } from "./sales-table";
import { calcularCashFlow, type ResultadoCashFlow } from "./cashflow";
import { gerarRecebimentosMensais } from "./vendas";
import { calcularResultadosComWaterfall, type ResultadosInvestidorPromotor } from "./estrutura-capital";
import { agregarFees } from "./fees";
import type { ContextoCusto } from "./custos";

import { listarTipologiasProjeto } from "./../supabase/project-typologies";
import { listarUnidades } from "./../supabase/project-units";
import { listarCustosProjeto } from "./../supabase/project-costs";
import { carregarFinanciamento } from "./../supabase/project-financing";
import { carregarPlanoVendas } from "./../supabase/project-sales";
import { carregarEstruturaCapital, listarHurdles, listarFees } from "./../supabase/project-capital";

export type ResultadoProjetoCompleto = {
  projeto: {
    nome: string;
    tipoProjeto: string;
    localizacao: string | null;
  };
  dadosSuficientes: boolean; // false quando falta Sales Table, custos ou plano de vendas — dashboard mostra estado vazio, nunca inventa
  motivoInsuficiente: string | null;
  resumoPrograma: ReturnType<typeof calcResumoPrograma> | null;
  abcTotal: number | null;
  eficiencia: number | null;
  resultado: ResultadoCashFlow | null;
  temInvestidorExterno: boolean;
  investidorPromotor: ResultadosInvestidorPromotor | null;
};

export async function carregarResultadoProjeto(supabase: SupabaseClient, projectId: string): Promise<ResultadoProjetoCompleto> {
  const { data: projetoRow } = await supabase.from("projects").select("*").eq("id", projectId).single();

  const projeto = {
    nome: projetoRow?.nome ?? "Projeto",
    tipoProjeto: projetoRow?.tipo_projeto ?? "",
    localizacao: [projetoRow?.freguesia, projetoRow?.concelho].filter(Boolean).join(", ") || projetoRow?.localizacao || null,
  };

  const [tipologias, unidades, custos, financiamento, planoVendas, estruturaCapital, hurdles, fees] = await Promise.all([
    listarTipologiasProjeto(supabase, projectId),
    listarUnidades(supabase, projectId),
    listarCustosProjeto(supabase, projectId),
    carregarFinanciamento(supabase, projectId),
    carregarPlanoVendas(supabase, projectId),
    carregarEstruturaCapital(supabase, projectId),
    listarHurdles(supabase, projectId),
    listarFees(supabase, projectId),
  ]);

  const abcAcimaSolo = projetoRow?.abc_acima_solo ?? null;
  const abcAbaixoSolo = projetoRow?.abc_abaixo_solo ?? null;

  const resumoPrograma = calcResumoPrograma(tipologias, abcAcimaSolo, abcAbaixoSolo);
  const abcTotal = calcAbcTotalProgramado(abcAcimaSolo, abcAbaixoSolo, tipologias);
  const eficiencia = calcEficiencia(resumoPrograma.abpTotal, abcTotal);

  const planoVendasCompleto = Boolean(
    planoVendas.dataLancamentoComercial && planoVendas.dataInicioConstrucao && planoVendas.dataFimConstrucao && planoVendas.dataEscritura
  );

  if (custos.length === 0) {
    return {
      projeto,
      dadosSuficientes: false,
      motivoInsuficiente: "Ainda não há linhas de custo na etapa \"Aquisição e custos\".",
      resumoPrograma,
      abcTotal,
      eficiencia,
      resultado: null,
      temInvestidorExterno: estruturaCapital.temInvestidorExterno,
      investidorPromotor: null,
    };
  }

  if (!planoVendasCompleto) {
    return {
      projeto,
      dadosSuficientes: false,
      motivoInsuficiente: "O Plano de Vendas ainda não está completo (faltam datas de lançamento, construção ou escritura).",
      resumoPrograma,
      abcTotal,
      eficiencia,
      resultado: null,
      temInvestidorExterno: estruturaCapital.temInvestidorExterno,
      investidorPromotor: null,
    };
  }

  const contextoCusto: ContextoCusto = {
    valorAquisicao: custos.filter((c) => c.grupo === "aquisicao").reduce((s, c) => s + c.valorInput, 0),
    abcPrincipal: (abcAcimaSolo ?? 0) + (abcAbaixoSolo ?? 0),
    abcTotal,
    numeroUnidades: resumoPrograma.totalUnidades,
  };

  const salesTableResolvida = resolverSalesTable(unidades, tipologias);
  const vgvBruto = calcVgvBruto(salesTableResolvida);

  const { linhas: recebimentos } = gerarRecebimentosMensais(vgvBruto, planoVendas);

  const resultado = calcularCashFlow({
    linhasCusto: custos,
    contextoCusto,
    recebimentos,
    parametrosFinanciamento: financiamento,
    saldoMinimoCaixa: financiamento.saldoMinimoCaixa,
  });

  let investidorPromotor: ResultadosInvestidorPromotor | null = null;
  if (estruturaCapital.temInvestidorExterno) {
    const contextoFees = {
      valorAquisicao: contextoCusto.valorAquisicao,
      hardCostsTotal: resultado.custoTotal, // aproximação: refinar quando o breakdown por grupo for exposto aqui
      capexTotal: resultado.custoTotal,
      custoTotal: resultado.custoTotal,
      abcTotal: contextoCusto.abcTotal,
      numeroUnidades: contextoCusto.numeroUnidades,
    };
    const feesTotais = agregarFees(fees, contextoFees).total;
    investidorPromotor = calcularResultadosComWaterfall(resultado.linhas, hurdles, estruturaCapital.percentagemInvestidor, feesTotais);
  }

  return {
    projeto,
    dadosSuficientes: true,
    motivoInsuficiente: null,
    resumoPrograma,
    abcTotal,
    eficiencia,
    resultado,
    temInvestidorExterno: estruturaCapital.temInvestidorExterno,
    investidorPromotor,
  };
}

export type { Typology };

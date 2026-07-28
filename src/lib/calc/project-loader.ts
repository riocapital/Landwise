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
import { gerarRecebimentosMensais, gerarRecebimentosDaSalesTable } from "./vendas";
import { gerarComissaoMensal } from "./sales-commission";
import { calcularDatasEfetivas } from "./sales-curve";
import { resolverMesInicioCashSweep } from "./financiamento";
import { calcularResultadosComWaterfall, type ResultadosInvestidorPromotor } from "./estrutura-capital";
import { agregarFees } from "./fees";
import type { ContextoCusto } from "./custos";
import {
  calcLucroTributavelEstimado,
  calcLucroTributavel,
  calcIRC,
  calcDerramaMunicipal,
  calcDerramaEstadual,
  resolverTaxaIRC,
} from "./impostos";
import { calcMetricasPorM2, calcEstruturaSobreVgv, type MetricasPorM2, type EstruturaSobreVgv } from "./metricas";

import { listarTipologiasProjeto } from "./../supabase/project-typologies";
import { listarUnidades } from "./../supabase/project-units";
import { listarCustosProjeto } from "./../supabase/project-costs";
import { carregarFinanciamento } from "./../supabase/project-financing";
import { carregarPlanoVendas } from "./../supabase/project-sales";
import { carregarEstruturaCapital, listarHurdles, listarFees } from "./../supabase/project-capital";
import { carregarImpostos } from "./../supabase/project-taxes";

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
  metricasPorM2: MetricasPorM2 | null;
  estruturaSobreVgv: EstruturaSobreVgv | null;
};

export async function carregarResultadoProjeto(supabase: SupabaseClient, projectId: string): Promise<ResultadoProjetoCompleto> {
  const { data: projetoRow } = await supabase.from("projects").select("*").eq("id", projectId).single();

  const projeto = {
    nome: projetoRow?.nome ?? "Projeto",
    tipoProjeto: projetoRow?.tipo_projeto ?? "",
    localizacao: [projetoRow?.freguesia, projetoRow?.concelho].filter(Boolean).join(", ") || projetoRow?.localizacao || null,
  };

  const [tipologias, unidades, custos, financiamento, planoVendas, estruturaCapital, hurdles, fees, impostos] = await Promise.all([
    listarTipologiasProjeto(supabase, projectId),
    listarUnidades(supabase, projectId),
    listarCustosProjeto(supabase, projectId),
    carregarFinanciamento(supabase, projectId),
    carregarPlanoVendas(supabase, projectId),
    carregarEstruturaCapital(supabase, projectId),
    listarHurdles(supabase, projectId),
    listarFees(supabase, projectId),
    carregarImpostos(supabase, projectId),
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
      metricasPorM2: null,
      estruturaSobreVgv: null,
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
      metricasPorM2: null,
      estruturaSobreVgv: null,
    };
  }

  const contextoCusto: ContextoCusto = {
    valorAquisicao: custos.filter((c) => c.grupo === "aquisicao").reduce((s, c) => s + c.valorInput, 0),
    abcAcimaSolo: abcAcimaSolo ?? 0,
    abcAbaixoSolo: abcAbaixoSolo ?? 0,
    abdTotal: resumoPrograma.areaDependenteTotal,
    numeroUnidades: resumoPrograma.totalUnidades,
  };

  const salesTableResolvida = resolverSalesTable(unidades, tipologias);
  const vgvBruto = calcVgvBruto(salesTableResolvida);

  const { linhas: recebimentos } =
    salesTableResolvida.length > 0
      ? gerarRecebimentosDaSalesTable(salesTableResolvida, tipologias, planoVendas)
      : gerarRecebimentosMensais(vgvBruto, planoVendas);

  let comissaoPorMes: Map<string, number> | undefined;
  if (salesTableResolvida.length > 0) {
    const { linhas: linhasComissao } = gerarComissaoMensal(salesTableResolvida, tipologias, planoVendas.dataLancamentoComercial, planoVendas.dataEscritura, {
      percentagemComissao: planoVendas.comissaoMediacaoPct,
      taxaIva: planoVendas.comissaoTaxaIva,
      pctPagoNoSinal: planoVendas.comissaoPctPagoSinal,
      pctPagoNaEscritura: planoVendas.comissaoPctPagoEscritura,
      ivaRecuperavelPct: planoVendas.comissaoIvaRecuperavelPct,
    });
    comissaoPorMes = new Map(linhasComissao.map((l) => [l.mes, l.total]));
  }

  let mesInicioCashSweep: string | null = null;
  if (financiamento.cashSweepAtivo) {
    const datasEfetivas =
      salesTableResolvida.length > 0
        ? calcularDatasEfetivas(
            unidades.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
            tipologias.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
            planoVendas.dataLancamentoComercial
          )
        : new Map<string, string>();
    const mesesUnicos = [...new Set(recebimentos.map((l) => l.mes))].sort();
    let vgvAcumulado = 0;
    const eventosCashSweep = mesesUnicos.map((mes) => {
      vgvAcumulado += recebimentos.filter((l) => l.mes === mes).reduce((s, l) => s + l.total, 0);
      const unidadesVendidasAteMes = [...datasEfetivas.values()].filter((d) => d <= mes).length;
      return {
        mes,
        temEscritura: planoVendas.dataEscritura ? mes >= planoVendas.dataEscritura.slice(0, 7) : false,
        pctVendidoAcumulado: unidades.length > 0 ? unidadesVendidasAteMes / unidades.length : 0,
        pctVgvRecebidoAcumulado: vgvBruto > 0 ? vgvAcumulado / vgvBruto : 0,
      };
    });
    mesInicioCashSweep = resolverMesInicioCashSweep(financiamento, eventosCashSweep);
  }

  const resultado = calcularCashFlow({
    linhasCusto: custos,
    contextoCusto,
    recebimentos,
    comissaoPorMes,
    parametrosFinanciamento: financiamento,
    mesInicioCashSweep,
    saldoMinimoCaixa: financiamento.saldoMinimoCaixa,
  });

  const contextoFees = {
    valorAquisicao: contextoCusto.valorAquisicao,
    hardCostsTotal: resultado.custoTotal, // aproximação: refinar quando o breakdown por grupo for exposto aqui
    capexTotal: resultado.custoTotal,
    custoTotal: resultado.custoTotal,
    abcTotal,
    numeroUnidades: contextoCusto.numeroUnidades,
  };
  const feesTotais = agregarFees(fees, contextoFees).total;

  let investidorPromotor: ResultadosInvestidorPromotor | null = null;
  if (estruturaCapital.temInvestidorExterno) {
    investidorPromotor = calcularResultadosComWaterfall(resultado.linhas, hurdles, estruturaCapital.percentagemInvestidor, feesTotais);
  }

  // Imposto estimado — mesma lógica da etapa de Impostos do wizard (secção
  // 29): só Empresa/SPV calcula IRC a partir do motor; os outros casos só
  // usam a simulação manual, nunca aplicam IRC automaticamente.
  let impostoEstimadoTotal = 0;
  if (impostos.estruturaFiscalAssumida === "empresa_spv") {
    const lucroTributavelAntesDeAjustes = calcLucroTributavelEstimado({
      receitasReconhecidas: resultado.gdv,
      custosFiscalmenteConsiderados: resultado.custoTotal - resultado.comissaoComercialTotal,
      comissaoDedutivel: resultado.comissaoComercialTotal,
      feesDedutiveis: 0,
      custosFinanceirosDedutiveis: resultado.financiamento.jurosTotais,
      ajustesFiscais: impostos.ircAjustesFiscais,
    });
    const lucroTributavel = calcLucroTributavel(lucroTributavelAntesDeAjustes, impostos.ircPrejuizosFiscaisAcumulados);
    const { taxa: taxaIrc } = resolverTaxaIRC(impostos.ircAnoFiscalReferencia, impostos.ircTaxaManual);
    const ircEstimado = calcIRC(lucroTributavel, taxaIrc);
    const derramaMunicipal = calcDerramaMunicipal(lucroTributavel, impostos.derramaMunicipalTaxa);
    const derramaEstadual = calcDerramaEstadual(lucroTributavel);
    impostoEstimadoTotal = ircEstimado + derramaMunicipal + derramaEstadual;
  } else {
    impostoEstimadoTotal = impostos.simulacaoImpostoEstimadoManual ?? 0;
  }

  const custosFinanceiros = resultado.financiamento.jurosTotais + resultado.financiamento.feesBancarios + resultado.financiamento.impostoSeloTotal;
  const custosAquisicaoAuxiliares = resultado.linhas.reduce((s, l) => s + l.custosAquisicao, 0);
  const hardCostsTotal = resultado.linhas.reduce((s, l) => s + l.hardCosts, 0);
  const softCostsTotal = resultado.linhas.reduce((s, l) => s + l.softCosts + l.outrosCustos, 0);

  const parametrosMetricas = {
    vgvBruto: resultado.gdv,
    vgvLiquido: resultado.gdv - resultado.comissaoComercialTotal,
    aquisicao: contextoCusto.valorAquisicao,
    custosAquisicao: custosAquisicaoAuxiliares,
    hardCosts: hardCostsTotal,
    softCosts: softCostsTotal,
    comissao: resultado.comissaoComercialTotal,
    fees: feesTotais,
    custosFinanceiros,
    impostoEstimado: impostoEstimadoTotal,
    abcTotal: abcTotal ?? 0,
    abpTotal: resumoPrograma.abpTotal,
    numeroUnidades: contextoCusto.numeroUnidades,
  };
  const metricasPorM2 = calcMetricasPorM2(parametrosMetricas);
  const estruturaSobreVgv = calcEstruturaSobreVgv(parametrosMetricas);

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
    metricasPorM2,
    estruturaSobreVgv,
  };
}

export type { Typology };

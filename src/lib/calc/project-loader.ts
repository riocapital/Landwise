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
import { resolverCustos, calcCustosAquisicaoAcessorios, type ContextoCusto } from "./custos";
import {
  calcLucroTributavelEstimado,
  calcLucroTributavel,
  calcIRC,
  calcDerramaMunicipal,
  calcDerramaEstadual,
  resolverTaxaIRC,
} from "./impostos";
import { calcMetricasPorM2, calcEstruturaSobreVgv, type MetricasPorM2, type EstruturaSobreVgv } from "./metricas";
import { extrairIndicador } from "./sensibilidades";
import { gerarAlertas, type Alerta } from "./alertas";

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
  alertas: Alerta[];

  // Lucro/margem do projeto — fonte única para TODAS as telas (Resumo,
  // Estrutura sobre VGV, Métricas por m²). Diferente de
  // resultado.lucroProjeto (cashflow.ts): esse é só o nível "core" (receita
  // − custos operacionais − custos financeiros), porque cashflow.ts não
  // conhece fees nem impostos (calculados aqui, fora do motor de cash
  // flow). lucroProjetoTotal soma tudo — é exatamente igual a
  // estruturaSobreVgv.lucro, exposto aqui com nome claro para nunca mais
  // haver dois números de "lucro" a divergir entre telas (auditoria
  // financeira: a diferença era exatamente fees + impostoEstimado).
  lucroProjetoTotal: number | null;
  margemProjetoTotal: number | null;
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
      alertas: [],
      lucroProjetoTotal: null,
      margemProjetoTotal: null,
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
      alertas: [],
      lucroProjetoTotal: null,
      margemProjetoTotal: null,
    };
  }

  // O preço de aquisição vem de projects.inputs.custoTerreno (campo próprio,
  // editável na etapa de Aquisição) — NUNCA da soma das linhas de custo do
  // grupo 'aquisicao', que inclui as próprias linhas "Sinal"/"Escritura" (o
  // preço, repartido por datas) mais os custos acessórios. Somar essas
  // linhas para "Aquisição" é exatamente o bug que fazia "Aquisição" e
  // "Custos de aquisição" mostrarem o mesmo valor (auditoria financeira).
  // Esta é a mesma fonte que o wizard já usa localmente (StepAquisicaoCustos).
  const contextoCusto: ContextoCusto = {
    valorAquisicao: projetoRow?.inputs?.custoTerreno || 0,
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
  // Custos de aquisição = só as linhas acessórias (DD, notário, registos,
  // IMT, imposto de selo, comissão de aquisição, outros) — NUNCA as linhas
  // "Sinal da aquisição"/"Escritura da aquisição"/"Reforço da aquisição",
  // que já são o preço de aquisição (contextoCusto.valorAquisicao), contado
  // ali uma única vez. Ver calcCustosAquisicaoAcessorios em custos.ts.
  const linhasCustoResolvidas = resolverCustos(custos, contextoCusto);
  // Só linhas com data entram no cash flow real (distribuirCustosPorMes em
  // cashflow.ts ignora linhas sem dataInicial/dataFinal) — hardCosts/
  // softCosts abaixo já respeitam isto por virem de `resultado.linhas`
  // (derivado do cash flow). custosAquisicaoAuxiliares tinha de ser filtrado
  // à parte, porque vem diretamente de linhasCustoResolvidas: sem isto, uma
  // linha com valor mas sem data (ex.: IMT calculado mas nunca datado)
  // contava no "Custo total do projeto" do dashboard sem nunca ter entrado
  // no cash flow/financiamento/equity reais (achado P1.2 da auditoria de
  // 2026-07-31).
  const linhasCustoResolvidasComData = linhasCustoResolvidas.filter((l) => l.dataInicial && l.dataFinal);
  const custosAquisicaoAuxiliares = calcCustosAquisicaoAcessorios(linhasCustoResolvidasComData);
  const hardCostsTotal = resultado.linhas.reduce((s, l) => s + l.hardCosts, 0);
  const softCostsTotal = resultado.linhas.reduce((s, l) => s + l.softCosts + l.outrosCustos, 0);
  // IVA não recuperável já entra no custo total do cash flow (cashflow.ts) —
  // faltava aqui, e essa omissão fazia "Estrutura sobre VGV"/"Métricas por
  // m²" mostrarem um lucro maior do que o do Resumo (auditoria financeira).
  const ivaNaoRecuperavelTotal = resultado.linhas.reduce((s, l) => s + l.ivaNaoRecuperavel, 0);

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
    ivaNaoRecuperavel: ivaNaoRecuperavelTotal,
    impostoEstimado: impostoEstimadoTotal,
    abcTotal: abcTotal ?? 0,
    abpTotal: resumoPrograma.abpTotal,
    numeroUnidades: contextoCusto.numeroUnidades,
  };
  const metricasPorM2 = calcMetricasPorM2(parametrosMetricas);
  const estruturaSobreVgv = calcEstruturaSobreVgv(parametrosMetricas);

  // --- Alertas (secção 41 do plano) ---
  const hoje = new Date().toISOString().slice(0, 10);
  const datasEfetivasAlertas =
    salesTableResolvida.length > 0
      ? calcularDatasEfetivas(
          unidades.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
          tipologias.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
          planoVendas.dataLancamentoComercial
        )
      : new Map<string, string>();
  const datasVendaOrdenadas = [...datasEfetivasAlertas.values()].sort();

  let saldoAnteriorAcumulado = 0;
  const linhasReconciliacao = resultado.linhas.map((l) => {
    const entradas = l.receitaVendas + l.drawdown + l.equityCall;
    const saidas =
      l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos + l.ivaNaoRecuperavel + l.comissaoComercial + l.jurosEFees + l.amortizacao + l.distribuicoes;
    const linha = { mes: l.mes, saldoAnterior: saldoAnteriorAcumulado, entradas, saidas, saldoAtual: l.saldoCaixaAcumulado };
    saldoAnteriorAcumulado = l.saldoCaixaAcumulado;
    return linha;
  });

  const alertas = gerarAlertas({
    temCodigoPostalValido: projetoRow ? Boolean(projetoRow.freguesia && projetoRow.concelho) : null,
    abcTotal,
    abpProgramada: resumoPrograma.abpTotal,
    eficiencia,
    totalUnidades: unidades.length,
    unidadesVendidas: unidades.filter((u) => u.estadoComercial !== "disponivel").length,
    dataLancamentoComercialPassada: Boolean(planoVendas.dataLancamentoComercial && planoVendas.dataLancamentoComercial <= hoje),
    algumaUnidadeComSinalMaisReforcosAcimaDe100Pct: salesTableResolvida.some((u) => u.sinalValor + u.reforcosValor > u.precoFinal),
    algumaTipologiaVendeuMaisDoQueAQuantidade: tipologias.some((t) => unidades.filter((u) => u.tipologiaId === t.id).length > t.quantidade),
    // Aquisição: ainda não há um modelo dedicado de sinal/reforços da aquisição distinto das linhas de custo — não implementado, nunca dispara.
    sinalMaisReforcosAquisicaoAcimaDe100Pct: false,
    temEscrituraAquisicaoSemData: false,
    existeCustoAtivoSemData: custos.some((c) => c.valorInput > 0 && (!c.dataInicial || !c.dataFinal)),
    existeHardCostSemDuracao: custos.some((c) => c.grupo === "hard_cost" && c.valorInput > 0 && !c.duracaoMeses),
    dataEscritura: planoVendas.dataEscritura || null,
    primeiraDataVendaUnidade: datasVendaOrdenadas[0] ?? null,
    dataFimConstrucao: planoVendas.dataFimConstrucao || null,
    // IVA reduzido: ainda não há uma confirmação distinta rastreada por linha — não implementado, nunca dispara.
    ivaReduzidoAplicadoSemConfirmacao: false,
    ltv: resultado.financiamento.ltv,
    algumMesComSaldoCaixaNegativoAposFinanciamento: resultado.linhas.some((l) => l.saldoCaixaAcumulado < -0.01),
    equityCommitted: resultado.equity.equityContributed,
    peakCashExposure: resultado.equity.peakCashExposure,
    irrLevered: extrairIndicador(resultado, "irr_levered"),
    gdv: resultado.gdv,
    custoTotal: resultado.custoTotal + resultado.custosFinanceiros,
    margem: resultado.margemProjeto,
    temInvestidorExterno: estruturaCapital.temInvestidorExterno,
    lucroLevered: resultado.lucroLevered,
    lucroInvestidor: investidorPromotor?.investidor.lucro ?? null,
    lucroPromotorTotal: investidorPromotor?.promotor.lucroTotal ?? null,
    feesPromotor: investidorPromotor?.promotor.fees ?? null,
    linhasReconciliacao,
    // Sensibilidade-base: exigiria recalcular a matriz completa só para este alerta — fica null (nunca dispara) até isso ser justificável.
    margemSensibilidadeBase: null,
  });

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
    alertas,
    lucroProjetoTotal: estruturaSobreVgv.lucro,
    margemProjetoTotal: resultado.gdv > 0 ? estruturaSobreVgv.lucro / resultado.gdv : null,
  };
}

export type { Typology };

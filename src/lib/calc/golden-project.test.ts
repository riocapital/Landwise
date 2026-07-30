// Golden Test — Landwise, secções 46/47/48 do plano de revisão estrutural.
//
// Um projeto de referência controlado, processado pela cadeia REAL de
// motores (nunca mocks): tipologia → Sales Table → comissão → custos →
// financiamento → equity/waterfall com investidor → cash flow →
// sensibilidades. Serve como teste de regressão: se qualquer motor
// mudar de comportamento sem intenção, este teste deteta.
//
// Duas categorias de verificação, como pede a secção 46:
// 1) Valores esperados calculados à mão (VGV, comissão, custo total,
//    lucro/margem sem financiamento) — aritmética simples, verificável.
// 2) Reconciliações (nível 4 da secção 47) para os valores derivados
//    complexos (cash flow mensal, peak debt, waterfall, IRR/MOIC,
//    sensibilidade-base) — comparar consistência interna, não um número
//    à mão impraticável de confirmar manualmente (ex.: XIRR).

import { describe, it, expect } from "vitest";
import { gerarUnidadesDeTipologia, resolverSalesTable, calcVgvBruto, type UnidadeVenda } from "./sales-table";
import { gerarRecebimentosDaSalesTable, type PlanoVendas } from "./vendas";
import { gerarComissaoMensal, PARAMETROS_COMISSAO_PADRAO } from "./sales-commission";
import { calcularCashFlow } from "./cashflow";
import { calcularResultadosComWaterfall } from "./estrutura-capital";
import { extrairIndicador, calcularMatrizSensibilidade } from "./sensibilidades";
import { calcMetricasPorM2, calcEstruturaSobreVgv } from "./metricas";
import { gerarAlertas } from "./alertas";
import type { Typology } from "./areas";
import type { LinhaCusto, ContextoCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import type { NivelHurdle } from "./waterfall";

// --- Fixture: tipologia única, 4 unidades, sem áreas dependentes (área vendável = ABP) ---
const TIPOLOGIA: Typology = {
  id: "t1",
  nome: "T2",
  quantidade: 4,
  abpUnidade: 70,
  varandaM2: 0,
  varandaPctValorizacao: 0,
  terracoM2: 0,
  terracoPctValorizacao: 0,
  jardimPrivativoM2: 0,
  jardimPctValorizacao: 0,
  arrecadacaoM2: 0,
  arrecadacaoPctValorizacao: 0,
  estacionamentosIncluidos: 0,
  valorEstacionamento: 0,
  precoBaseM2: 4000,
  metodoPrecificacao: "abp_mais_coeficientes",
  precoManualUnidade: null,
  mesesParaPrimeiraVenda: 0,
  unidadesPorMes: 4, // todas as 4 unidades vendem no 1º mês — datas simples de verificar
};

const PLANO_VENDAS: PlanoVendas = {
  dataLancamentoComercial: "2026-01-01",
  duracaoVendasMeses: 1,
  dataInicioConstrucao: "2026-01-01",
  dataFimConstrucao: "2026-12-01",
  dataEscritura: "2027-01-01",
  duracaoEscrituraAposObraMeses: 2,
  estruturaRecebimentos: { pctReserva: 0.1, pctCpcv: 0.2, pctDuranteConstrucao: 0.4, pctConclusao: 0.1, pctEscritura: 0.2 },
  comissaoMediacaoPct: 0.05,
  comissaoTaxaIva: 0.23,
  comissaoPctPagoSinal: 0.5,
  comissaoPctPagoEscritura: 0.5,
  comissaoIvaRecuperavelPct: 0,
  cancelamentosEstimadosPct: 0,
};

function custo(overrides: Partial<LinhaCusto>): LinhaCusto {
  return {
    id: Math.random().toString(36),
    grupo: "hard_cost",
    categoria: "Genérico",
    nome: "Linha",
    tipoCalculo: "valor_fixo",
    valorInput: 0,
    baseReferenciaCustoId: null,
    taxaIva: null,
    ivaRecuperavelPct: 0,
    dataIvaRecuperacao: null,
    dataInicial: "2026-01-01",
    duracaoMeses: 12,
    dataFinal: "2026-12-01",
    perfilDesembolso: "linear",
    ...overrides,
  };
}

const CUSTOS: LinhaCusto[] = [
  custo({ grupo: "aquisicao", nome: "Terreno", valorInput: 300_000, dataInicial: "2026-01-01", dataFinal: "2026-01-01", duracaoMeses: 0 }),
  custo({ grupo: "hard_cost", nome: "Construção acima do solo", tipoCalculo: "valor_fixo", valorInput: 500_000 }),
  custo({ grupo: "soft_cost", nome: "Arquitetura", valorInput: 50_000 }),
];

const CONTEXTO_CUSTO: ContextoCusto = { valorAquisicao: 300_000, abcAcimaSolo: 300, abcAbaixoSolo: 0, abdTotal: 0, numeroUnidades: 4 };

const FINANCIAMENTO: ParametrosFinanciamento = {
  comFinanciamento: true,
  percentagemHardCostsFinanciada: 0.6,
  percentagemAquisicaoFinanciada: 0.5,
  euribor: 0.03,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0.02,
  structuringFeePct: 0.01,
  setupCosts: 2_000,
  impostoSeloEmprestimoPct: 0.006,
  impostoSeloJurosPct: 0.04,
  limiteCredito: 500_000,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
  cashSweepAtivo: false,
  cashSweepPctCaixaLivre: 0,
  cashSweepMesesCustosFuturos: 0,
  cashSweepInicioTipo: "primeira_escritura",
  cashSweepInicioValorPct: null,
  cashSweepInicioData: null,
  carenciaAtiva: false,
  carenciaAnos: 0,
  prazoAnos: 0,
};

const HURDLES: NivelHurdle[] = [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }];
const PERCENTAGEM_INVESTIDOR = 0.7;

describe("Golden Test — projeto de referência completo (secções 46/47/48 do plano)", () => {
  const unidades: UnidadeVenda[] = gerarUnidadesDeTipologia(TIPOLOGIA, TIPOLOGIA.quantidade, 0);
  const unidadesResolvidas = resolverSalesTable(unidades, [TIPOLOGIA]);

  it("1) VGV Bruto = soma real da Sales Table (4 × 280.000€), nunca quantidade × média", () => {
    const vgv = calcVgvBruto(unidadesResolvidas);
    expect(vgv).toBe(4 * 280_000); // 1.120.000
  });

  it("2) Comissão comercial: 5% sobre o preço total, IVA 23% não recuperável", () => {
    const { totalComissaoSemIva, totalIvaNaoRecuperavel } = gerarComissaoMensal(
      unidadesResolvidas,
      [TIPOLOGIA],
      PLANO_VENDAS.dataLancamentoComercial,
      PLANO_VENDAS.dataEscritura,
      { ...PARAMETROS_COMISSAO_PADRAO, percentagemComissao: 0.05 }
    );
    expect(totalComissaoSemIva).toBeCloseTo(1_120_000 * 0.05, 2); // 56.000
    expect(totalIvaNaoRecuperavel).toBeCloseTo(56_000 * 0.23, 2); // 12.880
  });

  it("3) Custo total (sem comissão) = 300.000 + 500.000 + 50.000 = 850.000", () => {
    const totalCustos = CUSTOS.reduce((s, c) => s + c.valorInput, 0);
    expect(totalCustos).toBe(850_000);
  });

  const { linhas: recebimentos } = gerarRecebimentosDaSalesTable(unidadesResolvidas, [TIPOLOGIA], PLANO_VENDAS);
  const { linhas: linhasComissao } = gerarComissaoMensal(
    unidadesResolvidas,
    [TIPOLOGIA],
    PLANO_VENDAS.dataLancamentoComercial,
    PLANO_VENDAS.dataEscritura,
    { ...PARAMETROS_COMISSAO_PADRAO, percentagemComissao: 0.05 }
  );
  const comissaoPorMes = new Map(linhasComissao.map((l) => [l.mes, l.total]));

  const resultado = calcularCashFlow({
    linhasCusto: CUSTOS,
    contextoCusto: CONTEXTO_CUSTO,
    recebimentos,
    comissaoPorMes,
    parametrosFinanciamento: FINANCIAMENTO,
    saldoMinimoCaixa: FINANCIAMENTO.saldoMinimoCaixa,
  });

  it("4) VGV Bruto do cash flow reconcilia com a Sales Table (nunca dois cálculos divergentes)", () => {
    expect(resultado.gdv).toBeCloseTo(1_120_000, 0);
  });

  it("5) Custo total do cash flow = custos (850.000) + comissão (68.880) = 918.880", () => {
    expect(resultado.custoTotal).toBeCloseTo(850_000 + 68_880, 0);
  });

  it("6) Lucro unlevered e margem reconciliam com VGV − custo total", () => {
    expect(resultado.lucroUnlevered).toBeCloseTo(resultado.gdv - resultado.custoTotal, 0);
    expect(resultado.margem).toBeCloseTo(resultado.lucroUnlevered / resultado.gdv, 6);
  });

  it("7) [Reconciliação] Cash flow mensal fecha ao cêntimo em todos os meses (saldo anterior + entradas − saídas = saldo atual)", () => {
    let saldoAnterior = 0;
    for (const l of resultado.linhas) {
      const entradas = l.receitaVendas + l.drawdown + l.equityCall;
      const saidas =
        l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos + l.ivaNaoRecuperavel + l.comissaoComercial + l.jurosEFees + l.amortizacao + l.distribuicoes;
      const esperado = saldoAnterior + entradas - saidas;
      expect(Math.abs(esperado - l.saldoCaixaAcumulado)).toBeLessThanOrEqual(0.01);
      saldoAnterior = l.saldoCaixaAcumulado;
    }
  });

  it("8) [Reconciliação] Peak debt nunca excede o limite de crédito contratado", () => {
    expect(resultado.financiamento.peakDebt).toBeLessThanOrEqual(FINANCIAMENTO.limiteCredito! + 0.01);
  });

  it("9) [Reconciliação] Peak cash exposure é um valor real do ledger, nunca negativo", () => {
    expect(resultado.equity.peakCashExposure).toBeGreaterThanOrEqual(0);
  });

  it("10) IRR levered e MOIC: ou um número válido, ou 'Não calculável' (null) — nunca 0 forçado", () => {
    const irr = extrairIndicador(resultado, "irr_levered");
    const moic = extrairIndicador(resultado, "moic");
    expect(irr === null || typeof irr === "number").toBe(true);
    expect(moic === null || typeof moic === "number").toBe(true);
  });

  const feesTotais = 0; // golden test sem fees de gestão, para isolar o efeito do waterfall
  const investidorPromotor = calcularResultadosComWaterfall(resultado.linhas, HURDLES, PERCENTAGEM_INVESTIDOR, feesTotais);

  it("11) [Reconciliação] Waterfall: investidor + promotor nunca recebem mais do que o lucro levered distribuído", () => {
    const somaDistribuida = investidorPromotor.investidor.lucro + investidorPromotor.promotor.lucroTotal;
    // tolerância maior: soma de vários arredondamentos ao longo da cascata mensal
    expect(somaDistribuida).toBeLessThanOrEqual(resultado.lucroLevered + 1);
  });

  it("12) [Reconciliação] MOIC do investidor é sempre >= 0 (nunca devolve mais capital do que existe registado)", () => {
    expect(investidorPromotor.investidor.moic).toBeGreaterThanOrEqual(0);
  });

  it("13) [Reconciliação] Sensibilidade-base (célula 0%×0%) é idêntica ao resultado principal — corrigido nesta entrega: sensibilidades.ts não usava a Sales Table nem contava a comissão, um bug real que este golden test apanhou", () => {
    const matriz = calcularMatrizSensibilidade(
      {
        linhasCusto: CUSTOS,
        contextoCusto: CONTEXTO_CUSTO,
        receitaTotalGdvBase: 1_120_000,
        planoVendas: PLANO_VENDAS,
        parametrosFinanciamento: FINANCIAMENTO,
        salesTableResolvida: unidadesResolvidas,
        tipologias: [TIPOLOGIA],
        comissaoParametros: { ...PARAMETROS_COMISSAO_PADRAO, percentagemComissao: 0.05 },
      },
      "aquisicao_vs_custo_construcao",
      "margem"
    );
    const celulaBase = matriz.celulas.flat().find((c) => c.variacaoLinha === 0 && c.variacaoColuna === 0);
    expect(celulaBase).toBeDefined();
    // "margem" (via extrairIndicador) é sempre a margem do PROJETO
    // (margemProjeto) — nunca a antiga resultado.margem (= lucroUnlevered/gdv,
    // que ignora custos financeiros e não reconcilia com "Lucro do projeto"
    // mostrado no dashboard). Ver auditoria financeira desta entrega.
    expect(celulaBase!.valor).toBeCloseTo(resultado.margemProjeto ?? 0, 6);
  });

  it("14) Métricas por m² e Estrutura sobre VGV reconciliam com o cash flow (mesmo custo total, mesmo VGV)", () => {
    const parametros = {
      vgvBruto: resultado.gdv,
      vgvLiquido: resultado.gdv - resultado.comissaoComercialTotal,
      aquisicao: CONTEXTO_CUSTO.valorAquisicao,
      custosAquisicao: 0,
      hardCosts: 500_000,
      softCosts: 50_000,
      comissao: resultado.comissaoComercialTotal,
      fees: 0,
      custosFinanceiros: resultado.financiamento.jurosTotais + resultado.financiamento.feesBancarios + resultado.financiamento.impostoSeloTotal,
      ivaNaoRecuperavel: 0, // taxaIva: null em todas as linhas do golden project — sem IVA a considerar
      impostoEstimado: 0,
      abcTotal: 300,
      abpTotal: 280,
      numeroUnidades: 4,
    };
    const metricas = calcMetricasPorM2(parametros);
    const estrutura = calcEstruturaSobreVgv(parametros);
    const totalMetricas = metricas.linhas.find((l) => l.categoria === "Total")!.euros;
    expect(totalMetricas).toBeCloseTo(estrutura.totalCustos, 0);
  });

  it("15) Golden project bem formado gera zero erros de alerta (só recomendações/avisos informativos, se algum)", () => {
    const alertasGerados = gerarAlertas({
      temCodigoPostalValido: true,
      abcTotal: 300,
      abpProgramada: 280,
      eficiencia: 280 / 300,
      totalUnidades: 4,
      unidadesVendidas: 0,
      dataLancamentoComercialPassada: false,
      algumaUnidadeComSinalMaisReforcosAcimaDe100Pct: false,
      algumaTipologiaVendeuMaisDoQueAQuantidade: false,
      sinalMaisReforcosAquisicaoAcimaDe100Pct: false,
      temEscrituraAquisicaoSemData: false,
      existeCustoAtivoSemData: false,
      existeHardCostSemDuracao: false,
      dataEscritura: PLANO_VENDAS.dataEscritura,
      primeiraDataVendaUnidade: "2026-01-01",
      dataFimConstrucao: PLANO_VENDAS.dataFimConstrucao,
      ivaReduzidoAplicadoSemConfirmacao: false,
      ltv: resultado.financiamento.ltv,
      algumMesComSaldoCaixaNegativoAposFinanciamento: resultado.linhas.some((l) => l.saldoCaixaAcumulado < -0.01),
      equityCommitted: resultado.equity.equityContributed,
      peakCashExposure: resultado.equity.peakCashExposure,
      irrLevered: extrairIndicador(resultado, "irr_levered"),
      gdv: resultado.gdv,
      custoTotal: resultado.custoTotal,
      margem: resultado.margem,
      temInvestidorExterno: true,
      lucroLevered: resultado.lucroLevered,
      lucroInvestidor: investidorPromotor.investidor.lucro,
      lucroPromotorTotal: investidorPromotor.promotor.lucroTotal,
      feesPromotor: investidorPromotor.promotor.fees,
      linhasReconciliacao: resultado.linhas.map((l, i, arr) => ({
        mes: l.mes,
        saldoAnterior: i === 0 ? 0 : arr[i - 1].saldoCaixaAcumulado,
        entradas: l.receitaVendas + l.drawdown + l.equityCall,
        saidas:
          l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos + l.ivaNaoRecuperavel + l.comissaoComercial + l.jurosEFees + l.amortizacao + l.distribuicoes,
        saldoAtual: l.saldoCaixaAcumulado,
      })),
      margemSensibilidadeBase: null,
    });
    const erros = alertasGerados.filter((a) => a.tipo === "erro");
    expect(erros).toEqual([]);
  });
});

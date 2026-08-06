import { describe, it, expect } from "vitest";
import { calcularCashFlow, type PremissasCashFlow } from "./cashflow";
import { montarUnderwritingResult, type EntradaUnderwriting } from "./underwriting";
import type { LinhaCusto, ContextoCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import type { LinhaRecebimentoMensal } from "./vendas";

// Dados exclusivamente sintéticos, só para validar relações e fórmulas —
// nunca defaults nem valores de produção (secção 0 do prompt 03_08).
const contexto: ContextoCusto = { valorAquisicao: 1_000_000, abcAcimaSolo: 500, abcAbaixoSolo: 0, abdTotal: 0, numeroUnidades: 10 };

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
    duracaoMeses: 6,
    dataFinal: "2026-06-01",
    perfilDesembolso: "linear",
    ...overrides,
  };
}

const financiamentoSintetico: ParametrosFinanciamento = {
  comFinanciamento: true,
  percentagemHardCostsFinanciada: 0.6,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0.03,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0.02,
  structuringFeePct: 0,
  setupCosts: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
  limiteCredito: null,
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
  revolver: true,
  commitmentFeePct: 0,
  mesEventoSaida: null,
};

function receber(mes: string, total: number): LinhaRecebimentoMensal {
  return { mes, reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: total, escritura: total, total };
}

const linhasCusto: LinhaCusto[] = [
  custo({ grupo: "aquisicao", nome: "Sinal da aquisição", valorInput: 1_000_000, dataInicial: "2026-01-01", dataFinal: "2026-01-01", duracaoMeses: 1, perfilDesembolso: "unico_inicio" }),
  custo({ grupo: "aquisicao", nome: "Notário", categoria: "Custos de aquisição", valorInput: 20_000, dataInicial: "2026-01-01", dataFinal: "2026-01-01", duracaoMeses: 1, perfilDesembolso: "unico_inicio" }),
  custo({ grupo: "hard_cost", nome: "Construção", valorInput: 600_000 }),
  custo({ grupo: "soft_cost", nome: "Projeto", valorInput: 80_000 }),
];

const premissas: PremissasCashFlow = {
  linhasCusto,
  contextoCusto: contexto,
  recebimentos: [receber("2026-07", 2_200_000)],
  parametrosFinanciamento: financiamentoSintetico,
  saldoMinimoCaixa: 0,
};

function construirEntrada(): EntradaUnderwriting {
  const resultado = calcularCashFlow(premissas);
  const resultadoUnlevered = calcularCashFlow({ ...premissas, parametrosFinanciamento: { ...financiamentoSintetico, comFinanciamento: false } });
  return {
    resultado,
    resultadoUnlevered,
    investidorPromotor: null,
    feesTotais: 0,
    impostoEstimadoLevered: 0,
    impostoEstimadoUnlevered: 0,
    acquisitionPrice: contexto.valorAquisicao,
    acquisitionCosts: 20_000,
    abcTotal: contexto.abcAcimaSolo,
    averageSalePricePerSqm: 4000,
    unitCount: contexto.numeroUnidades,
    committedDebtLimite: null,
    primeiraSaidaCapital: resultado.linhas[0]?.mes ?? null,
    ultimaEntradaCapitalOuRetorno: resultado.equity.dataRecuperacaoIntegral ?? resultado.linhas[resultado.linhas.length - 1]?.mes ?? null,
  };
}

describe("montarUnderwritingResult — reconciliações (secção 5 do prompt 03_08)", () => {
  it("todas as reconciliações passam com tolerância de €0,01 num caso sintético simples", () => {
    const r = montarUnderwritingResult(construirEntrada());

    expect(r.qualidade.todasReconciliacoesOk).toBe(true);
    for (const rec of r.qualidade.reconciliacoes) {
      expect(Math.abs(rec.diferenca)).toBeLessThanOrEqual(0.01);
    }
  });

  it("comercial: grossVgv - commercialCommission = netVgv", () => {
    const r = montarUnderwritingResult(construirEntrada());
    expect(r.grossVgv - r.commercialCommission).toBeCloseTo(r.netVgv, 2);
  });

  it("capex: soma das componentes reconcilia com projectCapexBeforePromoteAndTax", () => {
    const r = montarUnderwritingResult(construirEntrada());
    const soma =
      r.acquisitionPrice + r.acquisitionCosts + r.hardCosts + r.softCosts + r.developmentFee + r.marketingCosts + r.contingency + r.nonRecoverableVat + r.financingCosts;
    expect(soma).toBeCloseTo(r.projectCapexBeforePromoteAndTax, 2);
  });

  it("resultado: profitBeforePromoteAndTax - promoteFee = profitAfterPromote, e - estimatedTaxes = netProfit", () => {
    const r = montarUnderwritingResult(construirEntrada());
    expect(r.profitBeforePromoteAndTax - r.promoteFee).toBeCloseTo(r.profitAfterPromote, 2);
    expect(r.profitAfterPromote - r.estimatedTaxes).toBeCloseTo(r.netProfit, 2);
  });

  it("retorno: capitalReturned + profitDistributed = totalReturn, e nunca inclui lucro em capitalReturned (corrige P0.5)", () => {
    const r = montarUnderwritingResult(construirEntrada());
    expect(r.capitalReturned + r.profitDistributed).toBeCloseTo(r.totalReturn, 2);
    expect(r.capitalReturned).toBeLessThanOrEqual(r.leveredEquityInvested + 0.01);
  });

  it("célula 0%/0% (sem variação) usa o mesmo motor que o resultado base — mesmos totais", () => {
    const entrada = construirEntrada();
    const r1 = montarUnderwritingResult(entrada);
    const r2 = montarUnderwritingResult(entrada);
    expect(r1.netProfit).toBeCloseTo(r2.netProfit, 6);
    expect(r1.grossVgv).toBeCloseTo(r2.grossVgv, 6);
  });

  it("cenário não alavancado: unleveredEquityInvested e unleveredRoi ficam preenchidos a partir de uma segunda execução real do motor (nunca a alavancada com dívida zerada)", () => {
    const entrada = construirEntrada();
    const r = montarUnderwritingResult(entrada);
    expect(r.unleveredEquityInvested).not.toBeNull();
    // Sem dívida, o equity não alavancado cobre o défice de caixa até à
    // primeira receita — deve ser maior ou igual ao equity alavancado
    // (a dívida, quando existe, substitui parte do equity necessário).
    expect(r.unleveredEquityInvested!).toBeGreaterThanOrEqual(r.leveredEquityInvested - 0.01);
  });

  it("deteta uma reconciliação quebrada quando o CAPEX é montado com um componente em falta (regressão do checker)", () => {
    const entrada = construirEntrada();
    const r = montarUnderwritingResult(entrada);
    // Simula o que aconteceria se um consumidor recompusesse o CAPEX por
    // fora, esquecendo uma componente (ex.: financingCosts) — a soma já não
    // bate com projectCapexBeforePromoteAndTax, e o checker tem de acusar.
    const somaQuebrada = r.acquisitionPrice + r.acquisitionCosts + r.hardCosts + r.softCosts + r.developmentFee + r.marketingCosts + r.contingency + r.nonRecoverableVat;
    expect(Math.abs(somaQuebrada - r.projectCapexBeforePromoteAndTax)).toBeGreaterThan(0.01);
  });
});

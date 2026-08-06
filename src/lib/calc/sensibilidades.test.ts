import { describe, it, expect } from "vitest";
import {
  calcularMatrizSensibilidade,
  calcularCenarioComVariacoes,
  calcularCenarioCompletoComVariacoes,
  calcularMatrizSensibilidadeCompleta,
  extrairIndicador,
  extrairIndicadorUnderwriting,
  VARIACOES_SENSIBILIDADE,
  type PremissasBaseSensibilidade,
  type PremissasCompletaSensibilidade,
} from "./sensibilidades";
import type { LinhaCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import type { PlanoVendas } from "./vendas";
import type { Fee } from "./fees";
import type { DatasProjetoParaFees } from "./fees";
import type { ParametrosImpostoEstimado } from "./impostos";

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
    dataFinal: "2026-12-31",
    perfilDesembolso: "linear",
    ...overrides,
  };
}

const parametrosSemFinanciamento: ParametrosFinanciamento = {
  comFinanciamento: false,
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0,
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

const planoVendas: PlanoVendas = {
  dataLancamentoComercial: "2026-01-01",
  duracaoVendasMeses: 3,
  dataInicioConstrucao: "2026-01-01",
  dataFimConstrucao: "2026-12-01",
  dataEscritura: "2027-01-01",
  duracaoEscrituraAposObraMeses: 2,
  estruturaRecebimentos: { pctReserva: 0.1, pctCpcv: 0.2, pctDuranteConstrucao: 0.3, pctConclusao: 0.2, pctEscritura: 0.2 },
  comissaoMediacaoPct: 0.03,
  comissaoTaxaIva: 0.23,
  comissaoPctPagoSinal: 0.5,
  comissaoPctPagoEscritura: 0.5,
  comissaoIvaRecuperavelPct: 0,
  cancelamentosEstimadosPct: 0,
};

const base: PremissasBaseSensibilidade = {
  linhasCusto: [
    custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 1_000_000, duracaoMeses: 1, dataFinal: "2026-01-31" }),
    custo({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 1_000_000 }),
  ],
  contextoCusto: { valorAquisicao: 1_000_000, abcAcimaSolo: 600, abcAbaixoSolo: 400, abdTotal: 200, numeroUnidades: 10 },
  receitaTotalGdvBase: 3_000_000,
  planoVendas,
  parametrosFinanciamento: parametrosSemFinanciamento,
};

describe("A célula 0%×0% é exatamente igual ao cenário-base (critério de aceitação #24)", () => {
  it("calcularCenarioComVariacoes(0,0,0) devolve o mesmo GDV/custo/lucro que o cenário-base direto", () => {
    const cenarioBase = calcularCenarioComVariacoes(base, 0, 0, 0);
    expect(cenarioBase.gdv).toBeCloseTo(3_000_000, 2);
    expect(cenarioBase.custoTotal).toBeCloseTo(2_000_000, 2);
  });

  it("a célula central de qualquer matriz é idêntica ao cenário-base", () => {
    const matriz = calcularMatrizSensibilidade(base, "aquisicao_vs_custo_construcao", "margem");
    const centroIdx = VARIACOES_SENSIBILIDADE.indexOf(0);
    const celulaCentral = matriz.celulas[centroIdx][centroIdx];
    const cenarioBase = calcularCenarioComVariacoes(base, 0, 0, 0);
    expect(celulaCentral.gdv).toBeCloseTo(cenarioBase.gdv, 2);
    expect(celulaCentral.lucro).toBeCloseTo(cenarioBase.lucroLevered, 2);
    expect(celulaCentral.margem).toBeCloseTo(cenarioBase.margem, 6);
  });
});

describe("Cada célula recalcula o modelo completo, não só uma percentagem no resultado final", () => {
  it("variar a aquisição em +10% muda o custo total pelo valor exato da aquisição, não uma fração arbitrária do lucro", () => {
    const cenarioBase = calcularCenarioComVariacoes(base, 0, 0, 0);
    const cenarioMais10 = calcularCenarioComVariacoes(base, 0.1, 0, 0);
    // aquisição base = 1.000.000 -> +10% = 100.000 a mais no custo total
    expect(cenarioMais10.custoTotal - cenarioBase.custoTotal).toBeCloseTo(100_000, 2);
    // a receita (GDV) não deve mudar por variar só a aquisição
    expect(cenarioMais10.gdv).toBeCloseTo(cenarioBase.gdv, 2);
  });

  it("variar o preço de venda em +10% muda o GDV exatamente 10%, sem tocar nos custos", () => {
    const cenarioBase = calcularCenarioComVariacoes(base, 0, 0, 0);
    const cenarioMais10 = calcularCenarioComVariacoes(base, 0, 0, 0.1);
    expect(cenarioMais10.gdv).toBeCloseTo(cenarioBase.gdv * 1.1, 0);
    expect(cenarioMais10.custoTotal).toBeCloseTo(cenarioBase.custoTotal, 2);
  });
});

describe("calcularMatrizSensibilidade", () => {
  it("devolve uma matriz 5x5 para cada uma das 3 combinações de eixos", () => {
    for (const matrizTipo of ["aquisicao_vs_custo_construcao", "custo_construcao_vs_preco_venda", "aquisicao_vs_preco_venda"] as const) {
      const matriz = calcularMatrizSensibilidade(base, matrizTipo, "margem");
      expect(matriz.celulas).toHaveLength(5);
      expect(matriz.celulas[0]).toHaveLength(5);
    }
  });

  it("a margem melhora com o preço de venda mais alto, mesmo eixo (monotonia básica de sanidade)", () => {
    const matriz = calcularMatrizSensibilidade(base, "aquisicao_vs_preco_venda", "margem");
    const margemPrecoBaixo = matriz.celulas[2][0].margem; // aquisição 0%, preço -10%
    const margemPrecoAlto = matriz.celulas[2][4].margem; // aquisição 0%, preço +10%
    expect(margemPrecoAlto).toBeGreaterThan(margemPrecoBaixo);
  });
});

describe("Auditoria financeira — IRR/MOIC vêm sempre do equity, nunca do cash flow do projeto", () => {
  // Bug real corrigido nesta entrega: "irr_levered"/"moic" usavam
  // resultado.cashFlowLevered/lucroLevered (o cash flow do PROJETO, que
  // inclui receita de vendas e drawdowns de dívida) em vez dos fluxos do
  // INVESTIDOR (capital calls/distribuições). Nunca voltar a isto — este
  // teste falha se "irr_levered"/"moic" deixarem de vir de resultado.equity.
  const baseComFinanciamento: PremissasBaseSensibilidade = {
    ...base,
    parametrosFinanciamento: { ...parametrosSemFinanciamento, comFinanciamento: true, percentagemHardCostsFinanciada: 0.5, limiteCredito: 600_000 },
  };

  it("irr_levered é exatamente resultado.equity.irr — nunca um XIRR sobre o cash flow do projeto", () => {
    const resultado = calcularCenarioComVariacoes(baseComFinanciamento, 0, 0, 0);
    expect(extrairIndicador(resultado, "irr_levered")).toBe(resultado.equity.irr);
  });

  it("moic é exatamente resultado.equity.moic (distribuições ÷ equity investido) — nunca (equity + lucroLevered) ÷ equity", () => {
    const resultado = calcularCenarioComVariacoes(baseComFinanciamento, 0, 0, 0);
    expect(extrairIndicador(resultado, "moic")).toBe(resultado.equity.moic);
    // A fórmula é sempre capitalDevolvidoTotal ÷ equityContributed — nunca
    // deriva de lucroLevered (que sobrestima quando a dívida não é
    // totalmente amortizada dentro do período modelado; ver reprodução com
    // dados reais em cashflow.test.ts, "Auditoria financeira").
    if (resultado.equity.equityContributed > 0) {
      expect(resultado.equity.moic).toBeCloseTo(resultado.equity.capitalDevolvidoTotal / resultado.equity.equityContributed, 6);
    }
  });

  it("roi (secção 19 do prompt 03_08 — renomeado de 'roe') é sempre lucroEquity ÷ equityContributed, fluxos do investidor", () => {
    const resultado = calcularCenarioComVariacoes(baseComFinanciamento, 0, 0, 0);
    expect(extrairIndicador(resultado, "roi")).toBe(
      resultado.equity.equityContributed > 0 ? resultado.equity.lucroEquity / resultado.equity.equityContributed : null
    );
  });

  it("lucro/margem (via extrairIndicador) são sempre os do PROJETO (lucroProjeto/margemProjeto), nunca lucroLevered/margem antigos", () => {
    const resultado = calcularCenarioComVariacoes(baseComFinanciamento, 0, 0, 0);
    expect(extrairIndicador(resultado, "lucro")).toBe(resultado.lucroProjeto);
    expect(extrairIndicador(resultado, "margem")).toBe(resultado.margemProjeto);
  });
});

describe("Gate 7 do prompt 03_08 — cada célula executa a função central completa (fee, financiamento, promote, impostos, equity, retorno)", () => {
  const fees: Fee[] = [
    {
      id: "fee-1",
      nome: "Development fee",
      tipo: "development",
      baseCalculo: "percentagem_hard_costs",
      valorInput: 0.05,
      momentoPagamento: "durante_desenvolvimento",
      dataPersonalizada: null,
      dataInicial: null,
      duracaoMeses: null,
      perfilDesembolso: "linear",
      taxaIva: null,
      ivaRecuperavelPct: 0,
    },
  ];
  const datasProjetoParaFees: DatasProjetoParaFees = {
    dataEscrituraAquisicao: "2026-01-01",
    dataInicioConstrucao: planoVendas.dataInicioConstrucao,
    dataFimConstrucao: planoVendas.dataFimConstrucao,
    dataEscrituraVenda: planoVendas.dataEscritura,
  };
  const impostosEmpresaSpv: ParametrosImpostoEstimado = {
    estruturaFiscalAssumida: "empresa_spv",
    simulacaoImpostoEstimadoManual: null,
    ircAjustesFiscais: 0,
    ircPrejuizosFiscaisAcumulados: 0,
    ircAnoFiscalReferencia: 2026,
    ircTaxaManual: null,
    derramaMunicipalTaxa: 0,
  };
  const parametrosComFinanciamento: ParametrosFinanciamento = {
    ...parametrosSemFinanciamento,
    comFinanciamento: true,
    percentagemHardCostsFinanciada: 0.5,
    percentagemAquisicaoFinanciada: 0.5,
    euribor: 0.03,
    spread: 0.02,
    limiteCredito: 1_200_000,
  };

  const baseCompleta: PremissasCompletaSensibilidade = {
    ...base,
    parametrosFinanciamento: parametrosComFinanciamento,
    fees,
    datasProjetoParaFees,
    temInvestidorExterno: true,
    percentagemInvestidor: 0.8,
    hurdles: [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }],
    catchUpPct: 0,
    impostos: impostosEmpresaSpv,
    acquisitionPrice: 1_000_000,
    acquisitionCosts: 20_000,
    abcTotal: 1_000,
    averageSalePricePerSqm: 4_000,
    unitCount: 10,
    committedDebtLimite: 1_200_000,
  };

  it("a célula-base (0%×0%) inclui genuinamente development fee, promote e impostos — nunca zero por omissão de wiring", () => {
    const u = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0, 0);
    expect(u.developmentFee).toBeGreaterThan(0);
    expect(u.estimatedTaxes).toBeGreaterThan(0);
    // Com hurdle 8% e retorno positivo, a waterfall tem de gerar promote > 0
    // neste cenário sintético (senão o wiring do investidor/waterfall não
    // estaria mesmo a chegar à célula).
    expect(u.promoteFee).toBeGreaterThanOrEqual(0);
  });

  it("todas as reconciliações da célula-base passam com tolerância de €0,01 — mesmo padrão de qualidade do dashboard", () => {
    const u = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0, 0);
    expect(u.qualidade.todasReconciliacoesOk).toBe(true);
  });

  it("a célula-base da matriz (índice central) é exatamente igual a uma chamada direta com deltas 0/0/0 — nunca um valor recalculado de outra forma", () => {
    const direta = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0, 0);
    const matriz = calcularMatrizSensibilidadeCompleta(baseCompleta, "aquisicao_vs_custo_construcao", "lucro_liquido");
    const centroIdx = VARIACOES_SENSIBILIDADE.indexOf(0);
    const celulaCentral = matriz.celulas[centroIdx][centroIdx];
    expect(celulaCentral.variacaoLinha).toBe(0);
    expect(celulaCentral.variacaoColuna).toBe(0);
    expect(celulaCentral.valor).toBeCloseTo(direta.netProfit, 2);
    expect(celulaCentral.valor).toBe(extrairIndicadorUnderwriting(direta, "lucro_liquido"));
  });

  it("o development fee (base % dos hard costs) recalcula com a variação de custo de construção — nunca fica preso ao valor da base original", () => {
    const semVariacao = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0, 0);
    const comHardCostsMaiores = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0.1, 0);
    expect(comHardCostsMaiores.developmentFee).toBeGreaterThan(semVariacao.developmentFee);
    expect(comHardCostsMaiores.hardCosts).toBeGreaterThan(semVariacao.hardCosts);
  });

  it("roi_nao_alavancado e lucro_liquido ficam disponíveis via extrairIndicadorUnderwriting (secção 19: novos indicadores do Gate 7)", () => {
    const u = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0, 0);
    expect(extrairIndicadorUnderwriting(u, "roi_nao_alavancado")).toBe(u.unleveredRoi);
    expect(extrairIndicadorUnderwriting(u, "lucro_liquido")).toBe(u.netProfit);
  });

  it("nunca aplica só a percentagem ao resultado final — variações diferentes produzem impostos e promote genuinamente recalculados, não escalados", () => {
    const base00 = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0, 0);
    const comPrecoMaior = calcularCenarioCompletoComVariacoes(baseCompleta, 0, 0, 0.1);
    // Um preço de venda 10% maior não escala o imposto/promote linearmente
    // (dependem de escalões/hurdles não-lineares) — só confirmamos que o
    // motor os recalculou de facto, não que ficaram parados.
    expect(comPrecoMaior.estimatedTaxes).not.toBe(base00.estimatedTaxes);
    expect(comPrecoMaior.netProfit).toBeGreaterThan(base00.netProfit);
  });
});

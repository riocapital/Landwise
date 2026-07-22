import { describe, it, expect } from "vitest";
import {
  simularFinanciamento,
  calcResultadosFinanciamento,
  taxaAnual,
  taxaMensal,
  normalizarParametrosSemFinanciamento,
  type ParametrosFinanciamento,
  type NecessidadeMensal,
} from "./financiamento";

const parametrosBase: ParametrosFinanciamento = {
  comFinanciamento: true,
  percentagemHardCostsFinanciada: 0.6,
  percentagemAquisicaoFinanciada: 0.5,
  euribor: 0.03,
  spread: 0.02,
  structuringFeePct: 0.01,
  setupCosts: 5000,
  impostoSeloEmprestimoPct: 0.006,
  impostoSeloJurosPct: 0.04,
  limiteCredito: 2_000_000,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
};

describe("Taxas", () => {
  it("taxa anual = euribor + spread", () => {
    expect(taxaAnual(parametrosBase)).toBeCloseTo(0.05, 6);
  });
  it("taxa mensal nominal_anual_div_12 = taxa anual / 12", () => {
    expect(taxaMensal(parametrosBase)).toBeCloseTo(0.05 / 12, 8);
  });
  it("taxa mensal equivalente usa a fórmula composta", () => {
    const p = { ...parametrosBase, metodoTaxaMensal: "mensal_equivalente" as const };
    expect(taxaMensal(p)).toBeCloseTo(Math.pow(1.05, 1 / 12) - 1, 8);
  });
});

describe("Regra crítica: financiamento bancário = Não zera tudo (secção 20 do plano)", () => {
  it("normalizarParametrosSemFinanciamento zera todos os campos bancários", () => {
    const p = normalizarParametrosSemFinanciamento({ ...parametrosBase, comFinanciamento: false });
    expect(p.percentagemHardCostsFinanciada).toBe(0);
    expect(p.percentagemAquisicaoFinanciada).toBe(0);
    expect(p.euribor).toBe(0);
    expect(p.spread).toBe(0);
    expect(p.structuringFeePct).toBe(0);
    expect(p.setupCosts).toBe(0);
    expect(p.impostoSeloEmprestimoPct).toBe(0);
    expect(p.impostoSeloJurosPct).toBe(0);
    expect(p.limiteCredito).toBe(0);
  });

  it("simularFinanciamento devolve todas as linhas a zero quando comFinanciamento = false", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -1_000_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 200_000, saldoCaixaAntesFinanciamento: -200_000 },
    ];
    const linhas = simularFinanciamento(necessidades, { ...parametrosBase, comFinanciamento: false });
    for (const l of linhas) {
      expect(l.drawdown).toBe(0);
      expect(l.juros).toBe(0);
      expect(l.fees).toBe(0);
      expect(l.impostoSelo).toBe(0);
      expect(l.saldoFinal).toBe(0);
    }
    const resultados = calcResultadosFinanciamento(linhas, 5_000_000, 1_200_000);
    expect(resultados.peakDebt).toBe(0);
    expect(resultados.dividaTotalLevantada).toBe(0);
    expect(resultados.ltv).toBe(0);
    expect(resultados.ltc).toBe(0);
  });
});

describe("Drawdown mensal — nunca lança tudo no primeiro mês sem necessidade", () => {
  it("só levanta dívida na medida da necessidade elegível e do saldo de caixa negativo", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -400_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 500_000, saldoCaixaAntesFinanciamento: -300_000 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    // mês 1: elegível = 1.000.000*0.5 = 500.000; necessidade real = min(500000, 400000) = 400.000
    expect(linhas[0].drawdown).toBe(400_000);
    // mês 2: elegível = 500.000*0.6 = 300.000; necessidade real = min(300000, 300000) = 300.000
    expect(linhas[1].drawdown).toBe(300_000);
  });

  it("respeita o limite de crédito mesmo que a necessidade elegível seja maior", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 5_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -3_000_000 },
    ];
    const p = { ...parametrosBase, limiteCredito: 1_000_000 };
    const linhas = simularFinanciamento(necessidades, p);
    expect(linhas[0].drawdown).toBe(1_000_000);
  });

  it("juros incidem sobre o saldo inicial do mês (dívida acumulada), não sobre o drawdown do próprio mês", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    expect(linhas[0].juros).toBe(0); // saldo inicial do mês 1 é zero
    expect(linhas[1].juros).toBeCloseTo(linhas[0].saldoFinal * taxaMensal(parametrosBase), 6);
  });

  it("fees e imposto de selo do empréstimo só são lançados uma vez, no primeiro drawdown", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -400_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 500_000, saldoCaixaAntesFinanciamento: -300_000 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    expect(linhas[0].fees).toBeGreaterThan(0);
    expect(linhas[1].fees).toBe(0);
  });
});

describe("calcResultadosFinanciamento", () => {
  it("calcula peak debt, LTV e LTC corretamente", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    const resultados = calcResultadosFinanciamento(linhas, 4_000_000, 1_000_000);
    expect(resultados.peakDebt).toBe(linhas[0].saldoFinal);
    expect(resultados.ltv).toBeCloseTo(resultados.peakDebt / 4_000_000, 6);
    expect(resultados.ltc).toBeCloseTo(resultados.peakDebt / 1_000_000, 6);
  });
});

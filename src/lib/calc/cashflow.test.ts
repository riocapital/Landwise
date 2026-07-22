import { describe, it, expect } from "vitest";
import { calcularCashFlow, type PremissasCashFlow } from "./cashflow";
import type { LinhaCusto, ContextoCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import type { LinhaRecebimentoMensal } from "./vendas";

const contexto: ContextoCusto = { valorAquisicao: 1_000_000, abcTotal: 1000, gcaTotal: 1200, numeroUnidades: 10 };

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

const parametrosSemFinanciamento: ParametrosFinanciamento = {
  comFinanciamento: false,
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  spread: 0,
  structuringFeePct: 0,
  setupCosts: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
  limiteCredito: null,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
};

function receber(mes: string, total: number): LinhaRecebimentoMensal {
  return { mes, reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: total, escritura: 0, total };
}

describe("calcularCashFlow — caso simples, sem financiamento", () => {
  it("junta custos e receitas num ledger mensal coerente, com margem correta", () => {
    const premissas: PremissasCashFlow = {
      linhasCusto: [
        custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" }),
        custo({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 12, dataFinal: "2026-12-31" }),
      ],
      contextoCusto: contexto,
      recebimentos: [receber("2027-01", 3_000_000)],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);
    expect(resultado.gdv).toBe(3_000_000);
    expect(resultado.custoTotal).toBeCloseTo(2_000_000, 6);
    expect(resultado.lucroUnlevered).toBeCloseTo(1_000_000, 2);
    expect(resultado.margem).toBeCloseTo(1_000_000 / 3_000_000, 6);
  });

  it("sem financiamento, todo o défice de caixa é coberto por equity (nunca por dívida)", () => {
    const premissas: PremissasCashFlow = {
      linhasCusto: [custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 500_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" })],
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);
    expect(resultado.financiamento.dividaTotalLevantada).toBe(0);
    expect(resultado.equity.equityContributed).toBeGreaterThan(0);
  });
});

describe("calcularCashFlow — com financiamento bancário", () => {
  const parametrosComFinanciamento: ParametrosFinanciamento = {
    ...parametrosSemFinanciamento,
    comFinanciamento: true,
    percentagemAquisicaoFinanciada: 0.5,
    percentagemHardCostsFinanciada: 0.6,
    euribor: 0.03,
    spread: 0.02,
  };

  it("o drawdown reduz a necessidade de equity face ao cenário sem financiamento", () => {
    const linhasCusto = [
      custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" }),
    ];

    const semFin = calcularCashFlow({
      linhasCusto,
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    });
    const comFin = calcularCashFlow({
      linhasCusto,
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosComFinanciamento,
      saldoMinimoCaixa: 0,
    });

    expect(comFin.equity.equityContributed).toBeLessThan(semFin.equity.equityContributed);
    expect(comFin.financiamento.dividaTotalLevantada).toBeGreaterThan(0);
  });
});

describe("calcularCashFlow — caso vazio", () => {
  it("devolve resultado zerado sem lançar erro quando não há custos nem receitas", () => {
    const resultado = calcularCashFlow({
      linhasCusto: [],
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    });
    expect(resultado.linhas).toHaveLength(0);
    expect(resultado.gdv).toBe(0);
    expect(resultado.margem).toBe(0);
  });
});

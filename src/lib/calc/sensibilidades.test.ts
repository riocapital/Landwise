import { describe, it, expect } from "vitest";
import {
  calcularMatrizSensibilidade,
  calcularCenarioComVariacoes,
  VARIACOES_SENSIBILIDADE,
  type PremissasBaseSensibilidade,
} from "./sensibilidades";
import type { LinhaCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import type { PlanoVendas } from "./vendas";

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
  spread: 0,
  structuringFeePct: 0,
  setupCosts: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
  limiteCredito: null,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
};

const planoVendas: PlanoVendas = {
  dataLancamentoComercial: "2026-01-01",
  duracaoVendasMeses: 3,
  dataInicioConstrucao: "2026-01-01",
  dataFimConstrucao: "2026-12-01",
  dataEscritura: "2027-01-01",
  estruturaRecebimentos: { pctReserva: 0.1, pctCpcv: 0.2, pctDuranteConstrucao: 0.3, pctConclusao: 0.2, pctEscritura: 0.2 },
  comissaoMediacaoPct: 0.03,
  cancelamentosEstimadosPct: 0,
};

const base: PremissasBaseSensibilidade = {
  linhasCusto: [
    custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 1_000_000, duracaoMeses: 1, dataFinal: "2026-01-31" }),
    custo({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 1_000_000 }),
  ],
  contextoCusto: { valorAquisicao: 1_000_000, abcTotal: 1000, gcaTotal: 1200, numeroUnidades: 10 },
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

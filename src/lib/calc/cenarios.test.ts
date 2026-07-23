import { describe, it, expect } from "vitest";
import {
  criarCenarioBase,
  criarCenarioConservador,
  criarCenarioOtimista,
  duplicarCenario,
  podeApagarCenario,
  compararCenarios,
} from "./cenarios";
import type { PremissasBaseSensibilidade } from "./sensibilidades";
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

describe("criarCenarioBase", () => {
  it("tem todas as variações a zero e está marcado como base", () => {
    const cenario = criarCenarioBase();
    expect(cenario.ehBase).toBe(true);
    expect(cenario.deltaAquisicao).toBe(0);
    expect(cenario.deltaConstrucao).toBe(0);
    expect(cenario.deltaPreco).toBe(0);
  });
});

describe("Conservador e Otimista têm direções opostas e coerentes", () => {
  it("conservador: custos mais altos, preço mais baixo", () => {
    const c = criarCenarioConservador(null);
    expect(c.deltaAquisicao).toBeGreaterThan(0);
    expect(c.deltaConstrucao).toBeGreaterThan(0);
    expect(c.deltaPreco).toBeLessThan(0);
  });

  it("otimista: custos mais baixos, preço mais alto", () => {
    const c = criarCenarioOtimista(null);
    expect(c.deltaAquisicao).toBeLessThan(0);
    expect(c.deltaConstrucao).toBeLessThan(0);
    expect(c.deltaPreco).toBeGreaterThan(0);
  });
});

describe("duplicarCenario", () => {
  it("a cópia nunca é marcada como base, mesmo duplicando o cenário-base", () => {
    const original = criarCenarioBase();
    const copia = duplicarCenario(original, "Minha cópia", "user-1");
    expect(copia.ehBase).toBe(false);
    expect(copia.id).not.toBe(original.id);
    expect(copia.nome).toBe("Minha cópia");
  });
});

describe("podeApagarCenario", () => {
  it("nunca permite apagar o cenário-base", () => {
    expect(podeApagarCenario(criarCenarioBase())).toBe(false);
  });
  it("permite apagar cenários que não são base", () => {
    expect(podeApagarCenario(criarCenarioConservador(null))).toBe(true);
  });
});

describe("compararCenarios", () => {
  it("recalcula cada cenário com o motor completo e devolve os campos pedidos pela secção 15 do plano", () => {
    const cenarios = [criarCenarioBase(), criarCenarioConservador("user-1"), criarCenarioOtimista("user-1")];
    const linhas = compararCenarios(base, cenarios);
    expect(linhas).toHaveLength(3);
    const [linhaBase, linhaConservador, linhaOtimista] = linhas;

    expect(linhaBase.gdv).toBeCloseTo(3_000_000, 2);
    expect(linhaConservador.margem).toBeLessThan(linhaBase.margem);
    expect(linhaOtimista.margem).toBeGreaterThan(linhaBase.margem);
  });

  it("cada linha inclui todos os campos de comparação exigidos pelo plano", () => {
    const linhas = compararCenarios(base, [criarCenarioBase()]);
    const linha = linhas[0];
    for (const campo of ["aquisicao", "precoVenda", "custoConstrucao", "gdv", "custoTotal", "equity", "peakExposure", "divida", "lucro", "margem", "irr", "moic"] as const) {
      expect(linha).toHaveProperty(campo);
    }
  });
});

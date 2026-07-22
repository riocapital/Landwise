import { describe, it, expect } from "vitest";
import { criarFeeZerado, resolverValorFee, agregarFees, type Fee, type ContextoFees } from "./fees";

const contexto: ContextoFees = {
  valorAquisicao: 1_000_000,
  hardCostsTotal: 2_000_000,
  capexTotal: 3_500_000,
  custoTotal: 4_000_000,
  abcTotal: 1000,
  numeroUnidades: 10,
};

describe("criarFeeZerado", () => {
  it("cria sempre um fee com valor 0 — nunca um valor pré-definido sem modelo escolhido", () => {
    const fee = criarFeeZerado("1", "Origination fee", "origination");
    expect(fee.valorInput).toBe(0);
    expect(resolverValorFee(fee, contexto)).toBe(0);
  });
});

describe("resolverValorFee", () => {
  const base: Omit<Fee, "baseCalculo" | "valorInput"> = {
    id: "1",
    nome: "Fee",
    tipo: "development",
    momentoPagamento: "conclusao",
    dataPersonalizada: null,
  };

  it("percentagem_aquisicao", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_aquisicao", valorInput: 0.01 }, contexto)).toBe(10_000);
  });

  it("percentagem_hard_costs", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_hard_costs", valorInput: 0.03 }, contexto)).toBe(60_000);
  });

  it("percentagem_capex — usa o capex já resolvido pelo motor de custos, nunca recalcula com os próprios fees incluídos", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_capex", valorInput: 0.02 }, contexto)).toBe(70_000);
  });

  it("percentagem_custo_total", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_custo_total", valorInput: 0.015 }, contexto)).toBe(60_000);
  });

  it("eur_m2 e eur_unidade", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "eur_m2", valorInput: 15 }, contexto)).toBe(15_000);
    expect(resolverValorFee({ ...base, baseCalculo: "eur_unidade", valorInput: 5000 }, contexto)).toBe(50_000);
  });
});

describe("agregarFees", () => {
  it("soma corretamente por tipo e no total, sem misturar categorias", () => {
    const fees: Fee[] = [
      { id: "1", nome: "Origination", tipo: "origination", baseCalculo: "percentagem_aquisicao", valorInput: 0.01, momentoPagamento: "aquisicao", dataPersonalizada: null },
      { id: "2", nome: "Development", tipo: "development", baseCalculo: "percentagem_hard_costs", valorInput: 0.02, momentoPagamento: "proporcional_capex", dataPersonalizada: null },
    ];
    const resumo = agregarFees(fees, contexto);
    expect(resumo.porTipo.origination).toBe(10_000);
    expect(resumo.porTipo.development).toBe(40_000);
    expect(resumo.porTipo.acquisition).toBe(0);
    expect(resumo.total).toBe(50_000);
  });
});

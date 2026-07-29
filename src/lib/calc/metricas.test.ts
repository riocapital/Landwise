import { describe, it, expect } from "vitest";
import { calcMetricasPorM2, calcEstruturaSobreVgv, calcSemaforoAquisicaoVgv, type ParametrosMetricas } from "./metricas";

function parametros(overrides: Partial<ParametrosMetricas> = {}): ParametrosMetricas {
  return {
    vgvBruto: 4_000_000,
    vgvLiquido: 3_880_000, // menos 3% de comissão
    aquisicao: 1_000_000,
    custosAquisicao: 80_000,
    hardCosts: 1_500_000,
    softCosts: 300_000,
    comissao: 120_000,
    fees: 50_000,
    custosFinanceiros: 100_000,
    impostoEstimado: 150_000,
    abcTotal: 2000,
    abpTotal: 1600,
    numeroUnidades: 40,
    ...overrides,
  };
}

describe("calcMetricasPorM2 — nunca €/m² sem base explícita", () => {
  it("cada linha tem €/ABC e €/ABP quando as áreas são positivas", () => {
    const r = calcMetricasPorM2(parametros());
    const compra = r.linhas.find((l) => l.categoria === "Compra")!;
    expect(compra.eurPorAbc).toBeCloseTo(1_000_000 / 2000, 6);
    expect(compra.eurPorAbp).toBeCloseTo(1_000_000 / 1600, 6);
  });

  it("devolve null (nunca 0 nem Infinity) quando a área-base é zero", () => {
    const r = calcMetricasPorM2(parametros({ abcTotal: 0, abpTotal: 0 }));
    const compra = r.linhas.find((l) => l.categoria === "Compra")!;
    expect(compra.eurPorAbc).toBeNull();
    expect(compra.eurPorAbp).toBeNull();
  });

  it("lucro = venda líquida − custo total", () => {
    const p = parametros();
    const r = calcMetricasPorM2(p);
    const custoTotal = p.aquisicao + p.custosAquisicao + p.hardCosts + p.softCosts + p.comissao + p.fees + p.custosFinanceiros + p.impostoEstimado;
    expect(r.lucro).toBeCloseTo(p.vgvLiquido - custoTotal, 6);
  });
});

describe("calcEstruturaSobreVgv", () => {
  it("cada categoria mostra euros, % VGV, €/ABC, €/ABP e €/unidade", () => {
    const r = calcEstruturaSobreVgv(parametros());
    const aquisicao = r.linhas.find((l) => l.categoria === "Aquisição")!;
    expect(aquisicao.euros).toBe(1_000_000);
    expect(aquisicao.pctVgv).toBeCloseTo(1_000_000 / 4_000_000, 6);
    expect(aquisicao.eurPorUnidade).toBeCloseTo(1_000_000 / 40, 6);
  });

  it("inclui as linhas Total e Lucro no final", () => {
    const r = calcEstruturaSobreVgv(parametros());
    expect(r.linhas.map((l) => l.categoria)).toContain("Total");
    expect(r.linhas.map((l) => l.categoria)).toContain("Lucro");
    expect(r.lucro).toBeCloseTo(4_000_000 - r.totalCustos, 6);
  });

  it("rácio aquisição/VGV calculado corretamente", () => {
    const r = calcEstruturaSobreVgv(parametros());
    expect(r.racioAquisicaoVgv).toBeCloseTo(1_000_000 / 4_000_000, 6); // 25%
  });
});

describe("calcSemaforoAquisicaoVgv — régua de referência Landwise (secção 36)", () => {
  it("verde quando < 35%", () => {
    expect(calcSemaforoAquisicaoVgv(0.34)).toBe("verde");
    expect(calcSemaforoAquisicaoVgv(0)).toBe("verde");
  });
  it("amarelo entre 35% e 45% (inclusive)", () => {
    expect(calcSemaforoAquisicaoVgv(0.35)).toBe("amarelo");
    expect(calcSemaforoAquisicaoVgv(0.45)).toBe("amarelo");
    expect(calcSemaforoAquisicaoVgv(0.4)).toBe("amarelo");
  });
  it("vermelho quando > 45%", () => {
    expect(calcSemaforoAquisicaoVgv(0.46)).toBe("vermelho");
    expect(calcSemaforoAquisicaoVgv(0.9)).toBe("vermelho");
  });
});

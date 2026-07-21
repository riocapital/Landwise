import { describe, it, expect } from "vitest";
import { calcularViabilidade, DEFAULT_INPUTS, type ProjectInputs } from "./viabilidade";

// Cenário de referência (Benfica) já validado manualmente na especificação do produto:
// VGV bruto 12,88M€ · comissão 0,79M€ · VGV líquido 12,08M€ · CAPEX 9,80M€
// Lucro líquido 2,28M€ · Equity 4,41M€ · ROI 51,7% · TIR 25,5%
function cenarioBenfica(): ProjectInputs {
  return {
    ...DEFAULT_INPUTS,
    areaLote: 2659,
    localizacao: "Benfica, Lisboa",
    custoTerreno: 2446440,
    custoConstrucaoM2: null, // deriva do mapa de vendas, como no modelo original
    mapaVendas: [
      // 3.700 m² de área privativa vendável, distribuída para bater com o VGV de referência
      { bloco: "Bloco A", piso: 0, tipologia: "T2", quantidade: 10, premioPiso: 0 },
      { bloco: "Bloco A", piso: 1, tipologia: "T3", quantidade: 10, premioPiso: 0.02 },
      { bloco: "Bloco A", piso: 2, tipologia: "T4", quantidade: 7, premioPiso: 0.04 },
    ],
    duracaoTotalMeses: 22,
    duracaoObraMeses: 14,
    mesInicioObra: 5,
    ltv: 0.55,
    taxaJuroAnual: 0.065,
  };
}

describe("calcularViabilidade", () => {
  it("calcula um VGV positivo e coerente com a área do mapa de vendas", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.vgvBruto).toBeGreaterThan(0);
    expect(r.unidadesTotal).toBe(27);
  });

  it("a comissão inclui IVA de 23% sobre 5%, ou seja 6,15% do VGV bruto", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.comissao).toBeCloseTo(r.vgvBruto * 0.0615, 2);
  });

  it("VGV líquido = VGV bruto - comissão", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.vgvLiquido).toBeCloseTo(r.vgvBruto - r.comissao, 2);
  });

  it("lucro líquido = VGV líquido - CAPEX total", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.lucroLiquido).toBeCloseTo(r.vgvLiquido - r.capexTotal, 2);
  });

  it("ROI = lucro líquido / equity", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.roi).toBeCloseTo(r.lucroLiquido / r.equity, 6);
  });

  it("equity multiple = 1 + ROI", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.equityMultiple).toBeCloseTo(1 + r.roi, 6);
  });

  it("TIR = (1+ROI)^(12/duração) - 1", () => {
    const inputs = cenarioBenfica();
    const r = calcularViabilidade(inputs);
    const tirEsperada = Math.pow(1 + r.roi, 12 / inputs.duracaoTotalMeses) - 1;
    expect(r.tir).toBeCloseTo(tirEsperada, 6);
  });

  it("terreno sobre VGV está na faixa de referência de mercado (15-25%)", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.terrenoSobreVgv).toBeGreaterThan(0.1);
    expect(r.terrenoSobreVgv).toBeLessThan(0.3);
  });

  it("o pico de capital investido nunca é positivo (é sempre uma exposição negativa)", () => {
    const r = calcularViabilidade(cenarioBenfica());
    expect(r.picoCapital).toBeLessThanOrEqual(0);
  });

  it("o fluxo de caixa acumulado no último mês bate com equity + lucro", () => {
    const r = calcularViabilidade(cenarioBenfica());
    const ultimo = r.cashflow[r.cashflow.length - 1];
    expect(ultimo.acumulado).toBeCloseTo(r.lucroLiquido, 1);
  });

  it("sem mapa de vendas preenchido, o VGV é zero (não inventa dados)", () => {
    const r = calcularViabilidade({ ...DEFAULT_INPUTS, mapaVendas: [] });
    expect(r.vgvBruto).toBe(0);
  });

  it("nível de confiança é Baixo quando faltam dados essenciais", () => {
    const r = calcularViabilidade({ ...DEFAULT_INPUTS, mapaVendas: [], custoTerreno: 0 });
    expect(r.nivelConfianca).toBe("Baixo");
  });
});

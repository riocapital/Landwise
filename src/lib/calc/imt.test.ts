import { describe, it, expect } from "vitest";
import { calcularImt } from "./imt";

// Valores de referência tirados diretamente do Ofício Circulado da AT n.º
// 40129/2026 (tabelas I a VI) — ver comentário de fonte em imt.ts.
describe("calcularImt — habitação própria e permanente (continente)", () => {
  it("isenta até ao 1.º escalão (106.346€)", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 50_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBe(0);
  });

  it("aplica taxa marginal com parcela a abater no 4.º escalão (198.347–330.539€, 7%)", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 200_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(3_542.04, 2);
  });

  it("aplica taxa única de 6% entre 660.982€ e 1.150.853€ (sem parcela a abater)", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 700_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(42_000, 2);
  });

  it("aplica taxa única de 7,5% acima de 1.150.853€", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 2_000_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(150_000, 2);
  });

  it("jovem até 35 anos: isento até 330.539€", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 300_000, regiaoAutonoma: false, jovemAte35: true, offshore: false });
    expect(r.imt).toBe(0);
  });

  it("jovem até 35 anos: 8% com parcela a abater de 26.443,12€ acima de 330.539€", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 500_000, regiaoAutonoma: false, jovemAte35: true, offshore: false });
    expect(r.imt).toBeCloseTo(13_556.88, 2);
  });
});

describe("calcularImt — habitação secundária/arrendamento (continente)", () => {
  it("nunca isenta — taxa mínima de 1% mesmo no 1.º escalão", () => {
    const r = calcularImt({ tipoImovel: "habitacao_secundaria_ou_arrendamento", valor: 50_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(500, 2);
  });

  it("o 5.º escalão (8%) termina em 633.931€, não em 660.982€ — diferente do escalão de HPP", () => {
    const r = calcularImt({ tipoImovel: "habitacao_secundaria_ou_arrendamento", valor: 633_931, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(633_931 * 0.08 - 12_699.89, 2);
    const rAcima = calcularImt({ tipoImovel: "habitacao_secundaria_ou_arrendamento", valor: 700_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(rAcima.imt).toBeCloseTo(700_000 * 0.06, 2); // já em taxa única de 6%
  });
});

describe("calcularImt — regiões autónomas (limites 25% superiores ao continente)", () => {
  it("HPP isenta até 132.933€", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 100_000, regiaoAutonoma: true, jovemAte35: false, offshore: false });
    expect(r.imt).toBe(0);
  });

  it("secundária: 5% com parcela a abater de 6.784,47€ no escalão 181.838–247.934€", () => {
    const r = calcularImt({ tipoImovel: "habitacao_secundaria_ou_arrendamento", valor: 200_000, regiaoAutonoma: true, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(200_000 * 0.05 - 6_784.47, 2);
  });
});

describe("calcularImt — taxas fixas (art. 17.º, n.º 1 CIMT)", () => {
  it("prédio rústico: 5% fixo sobre o valor total, sem escalões", () => {
    const r = calcularImt({ tipoImovel: "predio_rustico", valor: 300_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(15_000, 2);
  });

  it("terreno para construção / outro urbano: 6,5% fixo sobre o valor total", () => {
    const r = calcularImt({ tipoImovel: "outro_urbano_ou_terreno_construcao", valor: 1_000_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBeCloseTo(65_000, 2);
  });
});

describe("calcularImt — agravamento offshore", () => {
  it("10% fixo sobre o valor total, sobrepõe-se a qualquer tipo de imóvel ou escalão", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 500_000, regiaoAutonoma: false, jovemAte35: false, offshore: true });
    expect(r.imt).toBeCloseTo(50_000, 2);
  });
});

describe("calcularImt — imposto do selo (verba 1.1 da TGIS)", () => {
  it("0,8% do valor, sempre, independentemente do tipo de imóvel ou isenção de IMT", () => {
    const r = calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 50_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.imt).toBe(0); // isento de IMT
    expect(r.impostoSelo).toBeCloseTo(400, 2); // mas nunca isento de selo
    expect(r.total).toBeCloseTo(400, 2);
  });

  it("total é sempre imt + impostoSelo, nunca só um dos dois", () => {
    const r = calcularImt({ tipoImovel: "outro_urbano_ou_terreno_construcao", valor: 1_000_000, regiaoAutonoma: false, jovemAte35: false, offshore: false });
    expect(r.total).toBeCloseTo(r.imt + r.impostoSelo, 2);
    expect(r.total).toBeCloseTo(73_000, 2);
  });
});

describe("calcularImt — casos-limite", () => {
  it("valor zero ou negativo nunca produz imposto negativo", () => {
    expect(calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: 0, regiaoAutonoma: false, jovemAte35: false, offshore: false }).imt).toBe(0);
    expect(calcularImt({ tipoImovel: "habitacao_propria_permanente", valor: -100, regiaoAutonoma: false, jovemAte35: false, offshore: false }).imt).toBe(0);
  });
});

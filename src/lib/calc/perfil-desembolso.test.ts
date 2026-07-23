import { describe, it, expect } from "vitest";
import { gerarMesesEntre, distribuirValorPorPerfil, validarPesosPersonalizados } from "./perfil-desembolso";

describe("gerarMesesEntre", () => {
  it("gera a lista de meses inclusive, incluindo virada de ano", () => {
    expect(gerarMesesEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("um único mês devolve uma lista de 1", () => {
    expect(gerarMesesEntre("2026-05", "2026-05")).toEqual(["2026-05"]);
  });
});

describe("distribuirValorPorPerfil", () => {
  it("unico_inicio lança tudo no primeiro mês", () => {
    const r = distribuirValorPorPerfil(12000, "2026-01", "2026-04", "unico_inicio");
    expect(r.get("2026-01")).toBe(12000);
    expect(r.get("2026-02")).toBe(0);
  });

  it("unico_fim lança tudo no último mês", () => {
    const r = distribuirValorPorPerfil(12000, "2026-01", "2026-04", "unico_fim");
    expect(r.get("2026-04")).toBe(12000);
    expect(r.get("2026-01")).toBe(0);
  });

  it("linear reparte igualmente por todos os meses", () => {
    const r = distribuirValorPorPerfil(4000, "2026-01", "2026-04", "linear");
    expect(r.get("2026-01")).toBe(1000);
    expect(r.get("2026-04")).toBe(1000);
  });

  it("a soma de qualquer perfil é sempre igual ao valor total (ajuste no último mês)", () => {
    for (const perfil of ["unico_inicio", "unico_fim", "linear", "curva_s", "front_loaded", "back_loaded"] as const) {
      const r = distribuirValorPorPerfil(10_000, "2026-01", "2026-07", perfil);
      const soma = [...r.values()].reduce((s, v) => s + v, 0);
      expect(soma).toBeCloseTo(10_000, 2);
    }
  });

  it("front_loaded concentra mais valor nos primeiros meses que nos últimos", () => {
    const r = distribuirValorPorPerfil(10_000, "2026-01", "2026-06", "front_loaded");
    expect(r.get("2026-01")!).toBeGreaterThan(r.get("2026-06")!);
  });

  it("back_loaded concentra mais valor nos últimos meses que nos primeiros", () => {
    const r = distribuirValorPorPerfil(10_000, "2026-01", "2026-06", "back_loaded");
    expect(r.get("2026-06")!).toBeGreaterThan(r.get("2026-01")!);
  });

  it("personalizado usa os pesos fornecidos quando somam 100%", () => {
    const r = distribuirValorPorPerfil(1000, "2026-01", "2026-03", "personalizado", [0.5, 0.3, 0.2]);
    expect(r.get("2026-01")).toBe(500);
    expect(r.get("2026-02")).toBe(300);
  });
});

describe("validarPesosPersonalizados", () => {
  it("aceita pesos que somam exatamente 100%", () => {
    expect(validarPesosPersonalizados([0.5, 0.3, 0.2])).toBe(true);
  });
  it("rejeita pesos que não somam 100%", () => {
    expect(validarPesosPersonalizados([0.5, 0.3, 0.1])).toBe(false);
  });
});

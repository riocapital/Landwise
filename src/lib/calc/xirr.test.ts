import { describe, it, expect } from "vitest";
import { calcXIRR } from "./xirr";

describe("calcXIRR", () => {
  it("devolve null quando só há fluxos negativos", () => {
    expect(calcXIRR([{ data: "2026-01-01", valor: -1000 }])).toBeNull();
  });

  it("devolve null quando só há fluxos positivos", () => {
    expect(calcXIRR([{ data: "2026-01-01", valor: 1000 }])).toBeNull();
  });

  it("devolve null com menos de 2 fluxos relevantes", () => {
    expect(calcXIRR([{ data: "2026-01-01", valor: -1000 }, { data: "2026-06-01", valor: 0 }])).toBeNull();
  });

  it("calcula corretamente um investimento simples de 1 ano com retorno de 10%", () => {
    const irr = calcXIRR([
      { data: "2026-01-01", valor: -1000 },
      { data: "2027-01-01", valor: 1100 },
    ]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.1, 2);
  });

  it("calcula corretamente com datas não redondas (meio de ano)", () => {
    const irr = calcXIRR([
      { data: "2026-01-01", valor: -1000 },
      { data: "2026-07-02", valor: 1050 }, // ~6 meses, deve dar perto de (1.05)^2 - 1 ≈ 10.25% anualizado
    ]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.08);
    expect(irr!).toBeLessThan(0.15);
  });

  it("lida com múltiplos fluxos intermédios (capital calls e distribuições)", () => {
    const irr = calcXIRR([
      { data: "2026-01-01", valor: -500 },
      { data: "2026-06-01", valor: -500 },
      { data: "2027-06-01", valor: 600 },
      { data: "2028-01-01", valor: 600 },
    ]);
    expect(irr).not.toBeNull();
    expect(Number.isFinite(irr)).toBe(true);
  });

  it("retorno negativo (perda) dá IRR negativa, não null", () => {
    const irr = calcXIRR([
      { data: "2026-01-01", valor: -1000 },
      { data: "2027-01-01", valor: 800 },
    ]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeLessThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { gerarAgendaAbsorcao, atribuirDatasAbsorcao, calcResumoAbsorcao, calcularDatasEfetivas, type UnidadeParaAgendar } from "./sales-curve";

describe("gerarAgendaAbsorcao — nunca fraciona unidades, nunca excede o stock", () => {
  it("velocidade inteira: distribui exatamente 2/mês até esgotar o stock", () => {
    const agenda = gerarAgendaAbsorcao(10, 3, 2, "2026-01-01");
    expect(agenda.every((m) => Number.isInteger(m.unidadesNoMes))).toBe(true);
    expect(agenda.reduce((s, m) => s + m.unidadesNoMes, 0)).toBe(10);
    expect(agenda[0].mes).toBe("2026-04"); // 3 meses após o lançamento
  });

  it("velocidade fracionária (1.5/mês): ainda assim só atribui unidades inteiras por mês", () => {
    const agenda = gerarAgendaAbsorcao(9, 0, 1.5, "2026-01-01");
    expect(agenda.every((m) => Number.isInteger(m.unidadesNoMes))).toBe(true);
    expect(agenda.reduce((s, m) => s + m.unidadesNoMes, 0)).toBe(9);
  });

  it("nunca vende mais do que o stock total, mesmo com velocidade muito alta", () => {
    const agenda = gerarAgendaAbsorcao(5, 0, 100, "2026-01-01");
    expect(agenda.reduce((s, m) => s + m.unidadesNoMes, 0)).toBe(5);
  });

  it("sem stock ou sem velocidade, devolve agenda vazia (nunca inventa um mês)", () => {
    expect(gerarAgendaAbsorcao(0, 0, 2, "2026-01-01")).toHaveLength(0);
    expect(gerarAgendaAbsorcao(10, 0, 0, "2026-01-01")).toHaveLength(0);
  });

  it("sem data de lançamento válida devolve vazio e não quebra o calendário", () => {
    expect(gerarAgendaAbsorcao(10, 2, 1, "")).toEqual([]);
    expect(gerarAgendaAbsorcao(10, 2, 1, "2026-99-01")).toEqual([]);
  });

  it("nunca entra em ciclo infinito, mesmo com velocidade quase zero", () => {
    const agenda = gerarAgendaAbsorcao(10, 0, 0.001, "2026-01-01");
    expect(agenda.length).toBeLessThanOrEqual(601);
  });
});

describe("atribuirDatasAbsorcao — nunca reatribui unidade já vendida ou com data manual", () => {
  function unidade(overrides: Partial<UnidadeParaAgendar>): UnidadeParaAgendar {
    return { id: Math.random().toString(36), ordem: 0, jaTemDataVenda: false, disponivel: true, ...overrides };
  }

  it("atribui datas só às unidades disponíveis e sem data própria, pela ordem", () => {
    const unidades = [
      unidade({ id: "u1", ordem: 0 }),
      unidade({ id: "u2", ordem: 1 }),
      unidade({ id: "u3", ordem: 2, jaTemDataVenda: true }), // já tem data — não deve ser tocada
      unidade({ id: "u4", ordem: 3, disponivel: false }), // vendida — não deve ser tocada
    ];
    const agenda = [{ mes: "2026-04", unidadesNoMes: 2 }];
    const atribuicoes = atribuirDatasAbsorcao(unidades, agenda);

    expect(atribuicoes).toHaveLength(2);
    expect(atribuicoes.map((a) => a.unidadeId)).toEqual(["u1", "u2"]);
    expect(atribuicoes.every((a) => a.dataVenda === "2026-04-01")).toBe(true);
  });

  it("nunca atribui mais datas do que unidades elegíveis existem", () => {
    const unidades = [unidade({ id: "u1" })];
    const agenda = [{ mes: "2026-01", unidadesNoMes: 5 }];
    const atribuicoes = atribuirDatasAbsorcao(unidades, agenda);
    expect(atribuicoes).toHaveLength(1);
  });
});

describe("calcResumoAbsorcao", () => {
  it("acumula corretamente e calcula % vendido e stock restante", () => {
    const resumo = calcResumoAbsorcao(
      [
        { mes: "2026-01", unidadesNoMes: 2 },
        { mes: "2026-02", unidadesNoMes: 3 },
      ],
      10
    );
    expect(resumo[0].acumulado).toBe(2);
    expect(resumo[0].stockRestante).toBe(8);
    expect(resumo[1].acumulado).toBe(5);
    expect(resumo[1].pctVendido).toBeCloseTo(0.5, 6);
    expect(resumo[1].stockRestante).toBe(5);
  });
});

describe("calcularDatasEfetivas — combina data real com projeção da curva", () => {
  it("usa a data real quando existe, projeta pela curva quando não existe", () => {
    const unidades = [
      { id: "u1", tipologiaId: "t1", ordem: 0, dataVenda: "2026-03-15", estadoComercial: "vendido" },
      { id: "u2", tipologiaId: "t1", ordem: 1, dataVenda: null, estadoComercial: "disponivel" },
    ];
    const tipologias = [{ id: "t1", quantidade: 2, mesesParaPrimeiraVenda: 2, unidadesPorMes: 1 }];
    const datas = calcularDatasEfetivas(unidades, tipologias, "2026-01-01");

    expect(datas.get("u1")).toBe("2026-03-15"); // real, nunca substituída
    expect(datas.get("u2")).toBe("2026-03-01"); // projetada: lançamento + 2 meses
  });

  it("nunca mistura unidades de tipologias diferentes na mesma agenda", () => {
    const unidades = [
      { id: "u1", tipologiaId: "t1", ordem: 0, dataVenda: null, estadoComercial: "disponivel" },
      { id: "u2", tipologiaId: "t2", ordem: 0, dataVenda: null, estadoComercial: "disponivel" },
    ];
    const tipologias = [
      { id: "t1", quantidade: 1, mesesParaPrimeiraVenda: 1, unidadesPorMes: 1 },
      { id: "t2", quantidade: 1, mesesParaPrimeiraVenda: 5, unidadesPorMes: 1 },
    ];
    const datas = calcularDatasEfetivas(unidades, tipologias, "2026-01-01");
    expect(datas.get("u1")).toBe("2026-02-01");
    expect(datas.get("u2")).toBe("2026-06-01");
  });
});

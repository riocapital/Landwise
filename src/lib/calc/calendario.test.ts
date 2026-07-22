import { describe, it, expect } from "vitest";
import {
  calcDataFinal,
  calcDuracaoMeses,
  diaSeguinte,
  aoEditarDataFinal,
  aoEditarDuracao,
  aoEditarDataInicial,
  resolverAtividadesEncadeadas,
  gerarDadosGantt,
  type Atividade,
} from "./calendario";

function atividade(overrides: Partial<Atividade>): Atividade {
  return {
    id: Math.random().toString(36),
    nome: "Atividade",
    dataInicial: null,
    duracaoMeses: null,
    dataFinal: null,
    perfilDesembolso: "linear",
    dependenciaId: null,
    observacoes: null,
    ordem: 0,
    ...overrides,
  };
}

describe("Início + duração = fim (regra da secção 11 do plano)", () => {
  it("duração de 1 mês termina no último dia do mesmo mês", () => {
    expect(calcDataFinal("2026-09-01", 1)).toBe("2026-09-30");
  });

  it("exemplo exato do plano: início set/2026 + 24 meses = fim ago/2028", () => {
    expect(calcDataFinal("2026-09-01", 24)).toBe("2028-08-31");
  });

  it("calcDuracaoMeses é o inverso de calcDataFinal", () => {
    const inicio = "2026-03-15";
    const fim = calcDataFinal(inicio, 6);
    expect(calcDuracaoMeses(inicio, fim)).toBe(6);
  });
});

describe("Edição manual — mantém o que não foi tocado, recalcula o resto", () => {
  it("editar a data final recalcula a duração, mantendo a data inicial", () => {
    const r = aoEditarDataFinal("2026-01-01", "2026-06-30");
    expect(r.duracaoMeses).toBe(6);
  });

  it("editar a duração recalcula a data final, mantendo a data inicial", () => {
    const r = aoEditarDuracao("2026-01-01", 3);
    expect(r.dataFinal).toBe("2026-03-31");
  });

  it("editar a data inicial mantém a duração e recalcula a data final", () => {
    const r = aoEditarDataInicial("2026-02-01", 2);
    expect(r.dataFinal).toBe("2026-03-31");
  });
});

describe("diaSeguinte", () => {
  it("avança um dia, incluindo virada de mês", () => {
    expect(diaSeguinte("2026-01-31")).toBe("2026-02-01");
  });
});

describe("Encadeamento por dependência", () => {
  it("a atividade dependente começa no dia seguinte ao fim da anterior", () => {
    const obra = atividade({ id: "obra", nome: "Obra acima do solo", dataInicial: "2026-09-01", duracaoMeses: 24 });
    const entrega = atividade({ id: "entrega", nome: "Entrega", dependenciaId: "obra", duracaoMeses: 1 });
    const { atividades, alertas } = resolverAtividadesEncadeadas([obra, entrega]);
    const entregaResolvida = atividades.find((a) => a.id === "entrega")!;
    expect(entregaResolvida.dataInicial).toBe("2028-09-01"); // dia seguinte a 2028-08-31
    expect(entregaResolvida.dataFinal).toBe("2028-09-30");
    expect(alertas).toHaveLength(0);
  });

  it("encadeia várias atividades em sequência", () => {
    const a = atividade({ id: "a", nome: "A", dataInicial: "2026-01-01", duracaoMeses: 2 });
    const b = atividade({ id: "b", nome: "B", dependenciaId: "a", duracaoMeses: 3 });
    const c = atividade({ id: "c", nome: "C", dependenciaId: "b", duracaoMeses: 1 });
    const { atividades } = resolverAtividadesEncadeadas([c, b, a]); // ordem de entrada não importa
    const cResolvida = atividades.find((x) => x.id === "c")!;
    // a: jan-fev (fim 28/02) -> b: 01/03 + 3m = fim 31/05 -> c: 01/06 + 1m = fim 30/06
    expect(cResolvida.dataInicial).toBe("2026-06-01");
    expect(cResolvida.dataFinal).toBe("2026-06-30");
  });

  it("deteta dependência circular e devolve um alerta, sem entrar em ciclo infinito", () => {
    const a = atividade({ id: "a", nome: "A", dependenciaId: "b", duracaoMeses: 1 });
    const b = atividade({ id: "b", nome: "B", dependenciaId: "a", duracaoMeses: 1 });
    const { alertas } = resolverAtividadesEncadeadas([a, b]);
    expect(alertas.some((al) => al.tipo === "erro" && /circular/i.test(al.mensagem))).toBe(true);
  });
});

describe("gerarDadosGantt", () => {
  it("só inclui atividades com datas resolvidas, ordenadas", () => {
    const atividades = [
      atividade({ id: "1", nome: "Segunda", dataInicial: "2026-02-01", dataFinal: "2026-02-28", ordem: 2 }),
      atividade({ id: "2", nome: "Primeira", dataInicial: "2026-01-01", dataFinal: "2026-01-31", ordem: 1 }),
      atividade({ id: "3", nome: "Sem datas", ordem: 3 }),
    ];
    const gantt = gerarDadosGantt(atividades);
    expect(gantt).toHaveLength(2);
    expect(gantt[0].nome).toBe("Primeira");
  });
});

import { describe, it, expect } from "vitest";
import { calcAjustePrecoAtivo, calcularAjustesParaSalesTable, type RegraEvolucaoPreco, type UnidadeParaEvolucaoPreco } from "./price-escalation";

function regra(overrides: Partial<RegraEvolucaoPreco>): RegraEvolucaoPreco {
  return {
    id: Math.random().toString(36),
    escopo: { tipo: "geral" },
    gatilho: "meses_apos_lancamento",
    valorGatilhoNumero: 0,
    valorGatilhoData: null,
    ajustePct: 0,
    modo: "cumulativo",
    ordem: 0,
    observacao: null,
    ...overrides,
  };
}

describe("calcAjustePrecoAtivo — gatilhos", () => {
  it("desconto de lançamento (meses_apos_lancamento = 0) está sempre ativo desde o início", () => {
    const regras = [regra({ gatilho: "meses_apos_lancamento", valorGatilhoNumero: 0, ajustePct: -0.03 })];
    const ajuste = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 0, dataAtual: "2026-01-01", pctVendidoProjeto: 0, pctVendidoTipologia: 0 });
    expect(ajuste).toBe(-0.03);
  });

  it("aumento por tempo só ativa a partir do mês configurado, nunca antes", () => {
    const regras = [regra({ gatilho: "meses_apos_lancamento", valorGatilhoNumero: 6, ajustePct: 0.03 })];
    const antes = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 5, dataAtual: "2026-06-01", pctVendidoProjeto: 0, pctVendidoTipologia: 0 });
    const depois = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 6, dataAtual: "2026-07-01", pctVendidoProjeto: 0, pctVendidoTipologia: 0 });
    expect(antes).toBe(0);
    expect(depois).toBe(0.03);
  });

  it("aumento por % vendido do projeto", () => {
    const regras = [regra({ gatilho: "pct_vendido_projeto", valorGatilhoNumero: 0.3, ajustePct: 0.05 })];
    const antes = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 0, dataAtual: "2026-01-01", pctVendidoProjeto: 0.29, pctVendidoTipologia: 0 });
    const depois = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 0, dataAtual: "2026-01-01", pctVendidoProjeto: 0.3, pctVendidoTipologia: 0 });
    expect(antes).toBe(0);
    expect(depois).toBe(0.05);
  });

  it("regra por tipologia nunca afeta outra tipologia", () => {
    const regras = [regra({ escopo: { tipo: "tipologia", tipologiaId: "t1" }, ajustePct: 0.1 })];
    const t1 = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 0, dataAtual: "2026-01-01", pctVendidoProjeto: 0, pctVendidoTipologia: 0 });
    const t2 = calcAjustePrecoAtivo(regras, "t2", { mesesDesdeLancamento: 0, dataAtual: "2026-01-01", pctVendidoProjeto: 0, pctVendidoTipologia: 0 });
    expect(t1).toBe(0.1);
    expect(t2).toBe(0);
  });
});

describe("Cumulativo vs substituição", () => {
  it("regras cumulativas somam-se todas", () => {
    const regras = [
      regra({ ordem: 0, ajustePct: -0.03, modo: "cumulativo" }), // desconto de lançamento
      regra({ ordem: 1, gatilho: "meses_apos_lancamento", valorGatilhoNumero: 6, ajustePct: 0.05, modo: "cumulativo" }),
    ];
    const ajuste = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 6, dataAtual: "2026-07-01", pctVendidoProjeto: 0, pctVendidoTipologia: 0 });
    expect(ajuste).toBeCloseTo(-0.03 + 0.05, 6);
  });

  it("regra de substituição ignora tudo o que veio antes dela", () => {
    const regras = [
      regra({ ordem: 0, ajustePct: -0.03, modo: "cumulativo" }),
      regra({ ordem: 1, gatilho: "meses_apos_lancamento", valorGatilhoNumero: 6, ajustePct: 0.08, modo: "substituicao" }),
    ];
    const ajuste = calcAjustePrecoAtivo(regras, "t1", { mesesDesdeLancamento: 6, dataAtual: "2026-07-01", pctVendidoProjeto: 0, pctVendidoTipologia: 0 });
    expect(ajuste).toBe(0.08); // não é -0.03 + 0.08
  });
});

describe("calcularAjustesParaSalesTable — nunca toca unidades vendidas, bloqueadas ou com override", () => {
  function unidade(overrides: Partial<UnidadeParaEvolucaoPreco>): UnidadeParaEvolucaoPreco {
    return {
      id: Math.random().toString(36),
      tipologiaId: "t1",
      dataVendaEfetiva: "2026-01-01",
      disponivel: true,
      precoBloqueado: false,
      overrideManualValor: null,
      ...overrides,
    };
  }

  it("calcula o ajuste só para unidades elegíveis, ignora bloqueadas e com override", () => {
    const unidades = [
      unidade({ id: "u1", dataVendaEfetiva: "2026-01-01" }),
      unidade({ id: "u2", dataVendaEfetiva: "2026-01-01", precoBloqueado: true }),
      unidade({ id: "u3", dataVendaEfetiva: "2026-01-01", overrideManualValor: 500000 }),
      unidade({ id: "u4", dataVendaEfetiva: null }), // sem data — nunca calculado
    ];
    const regras = [regra({ ajustePct: -0.03 })];
    const ajustes = calcularAjustesParaSalesTable(unidades, regras, "2026-01-01");

    expect(ajustes.has("u1")).toBe(true);
    expect(ajustes.get("u1")).toBe(-0.03);
    expect(ajustes.has("u2")).toBe(false);
    expect(ajustes.has("u3")).toBe(false);
    expect(ajustes.has("u4")).toBe(false);
  });

  it("a % vendida acumulada cresce corretamente ao longo do tempo, unidade a unidade", () => {
    const unidades = [
      unidade({ id: "u1", dataVendaEfetiva: "2026-01-01" }),
      unidade({ id: "u2", dataVendaEfetiva: "2026-02-01" }),
      unidade({ id: "u3", dataVendaEfetiva: "2026-03-01" }),
      unidade({ id: "u4", dataVendaEfetiva: "2026-04-01" }),
    ];
    // gatilho: +5% assim que 50% do projeto estiver vendido (2 de 4 unidades)
    const regras = [regra({ gatilho: "pct_vendido_projeto", valorGatilhoNumero: 0.5, ajustePct: 0.05 })];
    const ajustes = calcularAjustesParaSalesTable(unidades, regras, "2026-01-01");

    // u1 (0% vendido antes dela) e u2 (25% vendido antes dela) ainda não atingiram os 50%
    expect(ajustes.get("u1")).toBe(0);
    expect(ajustes.get("u2")).toBe(0);
    // u3: 50% (2 de 4) já vendido antes dela -> atinge o gatilho
    expect(ajustes.get("u3")).toBe(0.05);
    expect(ajustes.get("u4")).toBe(0.05);
  });

  it("nunca soma % vendido de outras tipologias na % vendido específico da tipologia", () => {
    const unidades = [
      unidade({ id: "u1", tipologiaId: "t1", dataVendaEfetiva: "2026-01-01" }),
      unidade({ id: "u2", tipologiaId: "t2", dataVendaEfetiva: "2026-01-15" }),
      unidade({ id: "u3", tipologiaId: "t1", dataVendaEfetiva: "2026-02-01" }),
    ];
    // gatilho de tipologia: +5% assim que 50% da PRÓPRIA tipologia estiver vendida
    const regras = [regra({ escopo: { tipo: "tipologia", tipologiaId: "t1" }, gatilho: "pct_vendido_tipologia", valorGatilhoNumero: 0.5, ajustePct: 0.05 })];
    const ajustes = calcularAjustesParaSalesTable(unidades, regras, "2026-01-01");

    // t1 só tem 2 unidades (u1, u3) — u3 é a 2ª (50% já vendido antes dela, 1 de 2)
    expect(ajustes.get("u1")).toBe(0); // 0% da tipologia vendido antes dela
    expect(ajustes.get("u3")).toBe(0.05); // 50% da tipologia (1 de 2) já vendido antes dela
    expect(ajustes.get("u2")).toBe(0); // t2 não tem nenhuma regra própria — elegível, mas ajuste fica a 0
  });
});

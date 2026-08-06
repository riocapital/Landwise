import { describe, it, expect } from "vitest";
import { calcComissaoUnidade, gerarComissaoMensal, PARAMETROS_COMISSAO_PADRAO, type ParametrosComissao } from "./sales-commission";
import type { LinhaSalesTableResolvida } from "./sales-table";
import type { Typology } from "./areas";

describe("calcComissaoUnidade — sempre sobre o preço total, nunca sobre o sinal", () => {
  const parametros: ParametrosComissao = { percentagemComissao: 0.05, taxaIva: 0.23, pctPagoNoSinal: 0.5, pctPagoNaEscritura: 0.5, ivaRecuperavelPct: 0 };

  it("comissão sem IVA = preço final × percentagem, não uma fração do sinal", () => {
    const r = calcComissaoUnidade(300_000, parametros);
    expect(r.comissaoSemIva).toBe(300_000 * 0.05);
  });

  it("IVA calculado sobre a comissão, não sobre o preço da unidade", () => {
    const r = calcComissaoUnidade(300_000, parametros);
    expect(r.iva).toBeCloseTo(300_000 * 0.05 * 0.23, 6);
  });

  it("quando IVA não é recuperável, comissão total = comissão sem IVA + todo o IVA", () => {
    const r = calcComissaoUnidade(300_000, parametros);
    expect(r.ivaRecuperavel).toBe(0);
    expect(r.comissaoTotal).toBeCloseTo(r.comissaoSemIva + r.iva, 6);
  });

  it("quando IVA é 100% recuperável, comissão total = só a comissão sem IVA", () => {
    const r = calcComissaoUnidade(300_000, { ...parametros, ivaRecuperavelPct: 1 });
    expect(r.ivaNaoRecuperavel).toBeCloseTo(0, 6);
    expect(r.comissaoTotal).toBeCloseTo(r.comissaoSemIva, 6);
  });
});

describe("Parâmetros por omissão", () => {
  it("percentagem de comissão começa em 0 — nunca um valor pré-definido", () => {
    expect(PARAMETROS_COMISSAO_PADRAO.percentagemComissao).toBe(0);
  });
  it("IVA 23%, 50% sinal + 50% escritura por omissão (secção 18 do plano)", () => {
    expect(PARAMETROS_COMISSAO_PADRAO.taxaIva).toBe(0.23);
    expect(PARAMETROS_COMISSAO_PADRAO.pctPagoNoSinal).toBe(0.5);
    expect(PARAMETROS_COMISSAO_PADRAO.pctPagoNaEscritura).toBe(0.5);
  });
});

describe("gerarComissaoMensal — agenda mensal a partir da Sales Table real", () => {
  const tipologia: Typology = {
    id: "t1",
    nome: "T1",
    quantidade: 1,
    abpUnidade: 70,
    varandaM2: 0,
    varandaPctValorizacao: 0,
    terracoM2: 0,
    terracoPctValorizacao: 0,
    jardimPrivativoM2: 0,
    jardimPctValorizacao: 0,
    arrecadacaoM2: 0,
    arrecadacaoPctValorizacao: 0,
    estacionamentosIncluidos: 0,
    valorEstacionamento: 0,
    precoBaseM2: 4000,
    metodoPrecificacao: "abp_mais_coeficientes",
    mesesParaPrimeiraVenda: 2,
    unidadesPorMes: 1,
  };

  function unidade(overrides: Partial<LinhaSalesTableResolvida>): LinhaSalesTableResolvida {
    return {
      id: Math.random().toString(36),
      tipologiaId: "t1",
      ordem: 0,
      bloco: null,
      piso: null,
      abp: 70,
      varandaM2: 0,
      terracoM2: 0,
      outrasAreasM2: 0,
      estacionamentos: 0,
      valorEstacionamento: 0,
      incluiGaragem: false,
      precoBaseM2: 4000,
      ajusteFaseComercialPct: 0,
      premioDescontoUnidade: 0,
      overrideManualValor: null,
      precoBloqueado: false,
      personalizada: false,
      dataVenda: null,
      sinalValor: 0,
      reforcosValor: 0,
      dataEscritura: null,
      estadoComercial: "disponivel",
      abdFisica: 0,
      abdVendavel: 0,
      areaVendavel: 70,
      precoFinal: 300_000,
      ...overrides,
    };
  }

  const parametros: ParametrosComissao = { percentagemComissao: 0.05, taxaIva: 0.23, pctPagoNoSinal: 0.5, pctPagoNaEscritura: 0.5, ivaRecuperavelPct: 0 };

  it("agenda metade no mês de venda projetado, metade na escritura", () => {
    const { linhas, totalComissaoSemIva } = gerarComissaoMensal([unidade({})], [tipologia], "2026-01-01", "2028-01-01", parametros);

    expect(totalComissaoSemIva).toBe(300_000 * 0.05);
    const mesSinal = linhas.find((l) => l.mes === "2026-03"); // lançamento + 2 meses
    const mesEscritura = linhas.find((l) => l.mes === "2028-01");
    expect(mesSinal?.comissaoSemIva).toBeCloseTo(300_000 * 0.05 * 0.5, 2);
    expect(mesEscritura?.comissaoSemIva).toBeCloseTo(300_000 * 0.05 * 0.5, 2);
  });

  it("unidade já vendida usa a sua data real de venda, não a projeção", () => {
    const { linhas } = gerarComissaoMensal(
      [unidade({ estadoComercial: "vendido", dataVenda: "2026-06-15" })],
      [tipologia],
      "2026-01-01",
      "2028-01-01",
      parametros
    );
    const mesReal = linhas.find((l) => l.mes === "2026-06");
    expect(mesReal?.comissaoSemIva).toBeGreaterThan(0);
  });

  it("o total mensal nunca excede a comissão total real (nunca inventa valor)", () => {
    const { linhas, totalComissaoSemIva, totalIvaNaoRecuperavel } = gerarComissaoMensal([unidade({})], [tipologia], "2026-01-01", "2028-01-01", parametros);
    const somaTotal = linhas.reduce((s, l) => s + l.total, 0);
    expect(somaTotal).toBeCloseTo(totalComissaoSemIva + totalIvaNaoRecuperavel, 2);
  });
});

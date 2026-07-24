import { describe, it, expect } from "vitest";
import { validarEstruturaRecebimentos, gerarRecebimentosMensais, gerarRecebimentosDaSalesTable, type PlanoVendas } from "./vendas";
import type { LinhaSalesTableResolvida } from "./sales-table";
import type { Typology } from "./areas";

const planoBase: PlanoVendas = {
  dataLancamentoComercial: "2026-01-01",
  duracaoVendasMeses: 6,
  dataInicioConstrucao: "2026-01-01",
  dataFimConstrucao: "2027-12-01",
  dataEscritura: "2028-01-01",
  estruturaRecebimentos: {
    pctReserva: 0.05,
    pctCpcv: 0.15,
    pctDuranteConstrucao: 0.5,
    pctConclusao: 0.1,
    pctEscritura: 0.2,
  },
  comissaoMediacaoPct: 0.03,
  cancelamentosEstimadosPct: 0,
};

describe("validarEstruturaRecebimentos", () => {
  it("aceita percentagens que somam exatamente 100%", () => {
    expect(validarEstruturaRecebimentos(planoBase.estruturaRecebimentos)).toBe(true);
  });

  it("rejeita percentagens que não somam 100%", () => {
    expect(
      validarEstruturaRecebimentos({ pctReserva: 0.1, pctCpcv: 0.1, pctDuranteConstrucao: 0.5, pctConclusao: 0.1, pctEscritura: 0.1 })
    ).toBe(false);
  });
});

describe("gerarRecebimentosMensais", () => {
  it("a soma de todos os recebimentos é igual à receita líquida de cancelamentos", () => {
    const { linhas, receitaLiquidaCancelamentos } = gerarRecebimentosMensais(10_000_000, planoBase);
    const soma = linhas.reduce((s, l) => s + l.total, 0);
    expect(soma).toBeCloseTo(receitaLiquidaCancelamentos, 0);
  });

  it("aplica os cancelamentos estimados antes de distribuir, reduzindo a receita total", () => {
    const plano = { ...planoBase, cancelamentosEstimadosPct: 0.1 };
    const { receitaLiquidaCancelamentos } = gerarRecebimentosMensais(10_000_000, plano);
    expect(receitaLiquidaCancelamentos).toBe(9_000_000);
  });

  it("a conclusão cai como valor único no mês de fim de construção", () => {
    const { linhas } = gerarRecebimentosMensais(10_000_000, planoBase);
    const mesConclusao = linhas.find((l) => l.mes === "2027-12");
    expect(mesConclusao?.conclusao).toBeCloseTo(10_000_000 * 0.1, 0);
  });

  it("a escritura cai como valor único no mês da escritura", () => {
    const { linhas } = gerarRecebimentosMensais(10_000_000, planoBase);
    const mesEscritura = linhas.find((l) => l.mes === "2028-01");
    expect(mesEscritura?.escritura).toBeCloseTo(10_000_000 * 0.2, 0);
  });

  it("a parcela 'durante construção' distribui-se ao longo de todo o período de obra, não num só mês", () => {
    const { linhas } = gerarRecebimentosMensais(10_000_000, planoBase);
    const mesesComConstrucao = linhas.filter((l) => l.duranteConstrucao > 0);
    expect(mesesComConstrucao.length).toBeGreaterThan(12); // 24 meses de obra
  });
});

describe("gerarRecebimentosDaSalesTable — reserva/CPCV seguem a data real ou projetada de cada unidade", () => {
  function tipologia(overrides: Partial<Typology>): Typology {
    return {
      id: "t1",
      nome: "T1",
      quantidade: 2,
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
      ...overrides,
    };
  }

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
      precoFinal: 280_000,
      ...overrides,
    };
  }

  const plano: PlanoVendas = {
    dataLancamentoComercial: "2026-01-01",
    duracaoVendasMeses: 6,
    dataInicioConstrucao: "2026-01-01",
    dataFimConstrucao: "2027-12-01",
    dataEscritura: "2028-01-01",
    estruturaRecebimentos: { pctReserva: 0.1, pctCpcv: 0.1, pctDuranteConstrucao: 0.5, pctConclusao: 0.1, pctEscritura: 0.2 },
    comissaoMediacaoPct: 0.03,
    cancelamentosEstimadosPct: 0,
  };

  it("unidade já vendida usa a sua data real, não a projeção da curva", () => {
    const unidades = [unidade({ id: "u1", ordem: 0, estadoComercial: "vendido", dataVenda: "2026-06-01" }), unidade({ id: "u2", ordem: 1 })];
    const { linhas } = gerarRecebimentosDaSalesTable(unidades, [tipologia({})], plano);
    const mesJunho = linhas.find((l) => l.mes === "2026-06");
    expect(mesJunho).toBeDefined();
    expect(mesJunho!.reserva).toBeGreaterThan(0); // reserva+cpcv da unidade vendida cai no mês real
  });

  it("unidade ainda disponível usa a data projetada pela curva da sua tipologia", () => {
    const unidades = [unidade({ id: "u1", ordem: 0 })];
    const { linhas } = gerarRecebimentosDaSalesTable(unidades, [tipologia({ quantidade: 1, mesesParaPrimeiraVenda: 3, unidadesPorMes: 1 })], plano);
    // lançamento 2026-01 + 3 meses = 2026-04
    const mesAbril = linhas.find((l) => l.mes === "2026-04");
    expect(mesAbril).toBeDefined();
    expect(mesAbril!.reserva).toBeCloseTo(280_000 * 0.2, 0); // reserva+cpcv = 10%+10% do preço
  });

  it("a soma de reserva+cpcv nunca é contada duas vezes (cpcv fica a 0, reserva leva o total combinado)", () => {
    const unidades = [unidade({ id: "u1", ordem: 0 })];
    const { linhas } = gerarRecebimentosDaSalesTable(unidades, [tipologia({ quantidade: 1 })], plano);
    const totalReserva = linhas.reduce((s, l) => s + l.reserva, 0);
    const totalCpcv = linhas.reduce((s, l) => s + l.cpcv, 0);
    expect(totalCpcv).toBe(0);
    expect(totalReserva).toBeCloseTo(280_000 * (0.1 + 0.1), 0);
  });

  it("nunca agenda uma unidade sem data real e sem curva configurada (unidadesPorMes = 0) — não inventa mês", () => {
    const unidades = [unidade({ id: "u1", ordem: 0 })];
    const { linhas } = gerarRecebimentosDaSalesTable(unidades, [tipologia({ unidadesPorMes: 0 })], plano);
    const totalReserva = linhas.reduce((s, l) => s + l.reserva, 0);
    expect(totalReserva).toBe(0);
  });

  it("durante construção, conclusão e escritura continuam globais (não dependem da data de venda da unidade)", () => {
    const unidades = [unidade({ id: "u1", ordem: 0 }), unidade({ id: "u2", ordem: 1 })];
    const { linhas } = gerarRecebimentosDaSalesTable(unidades, [tipologia({ quantidade: 2 })], plano);
    const mesConclusao = linhas.find((l) => l.mes === "2027-12");
    const mesEscritura = linhas.find((l) => l.mes === "2028-01");
    expect(mesConclusao?.conclusao).toBeGreaterThan(0);
    expect(mesEscritura?.escritura).toBeGreaterThan(0);
  });
});

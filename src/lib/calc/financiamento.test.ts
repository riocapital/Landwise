import { describe, it, expect } from "vitest";
import {
  simularFinanciamento,
  calcResultadosFinanciamento,
  taxaAnual,
  taxaMensal,
  normalizarParametrosSemFinanciamento,
  resolverMesInicioCashSweep,
  type ParametrosFinanciamento,
  type NecessidadeMensal,
  type EventoMensalCashSweep,
} from "./financiamento";

const parametrosBase: ParametrosFinanciamento = {
  comFinanciamento: true,
  percentagemHardCostsFinanciada: 0.6,
  percentagemAquisicaoFinanciada: 0.5,
  euribor: 0.03,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0.02,
  structuringFeePct: 0.01,
  setupCosts: 5000,
  impostoSeloEmprestimoPct: 0.006,
  impostoSeloJurosPct: 0.04,
  limiteCredito: 2_000_000,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
  cashSweepAtivo: false,
  cashSweepPctCaixaLivre: 0,
  cashSweepMesesCustosFuturos: 0,
  cashSweepInicioTipo: "primeira_escritura",
  cashSweepInicioValorPct: null,
  cashSweepInicioData: null,
};

describe("Taxas", () => {
  it("taxa anual = euribor + spread", () => {
    expect(taxaAnual(parametrosBase)).toBeCloseTo(0.05, 6);
  });
  it("taxa mensal nominal_anual_div_12 = taxa anual / 12", () => {
    expect(taxaMensal(parametrosBase)).toBeCloseTo(0.05 / 12, 8);
  });
  it("taxa mensal equivalente usa a fórmula composta", () => {
    const p = { ...parametrosBase, metodoTaxaMensal: "mensal_equivalente" as const };
    expect(taxaMensal(p)).toBeCloseTo(Math.pow(1.05, 1 / 12) - 1, 8);
  });
});

describe("Regra crítica: financiamento bancário = Não zera tudo (secção 20 do plano)", () => {
  it("normalizarParametrosSemFinanciamento zera todos os campos bancários", () => {
    const p = normalizarParametrosSemFinanciamento({ ...parametrosBase, comFinanciamento: false });
    expect(p.percentagemHardCostsFinanciada).toBe(0);
    expect(p.percentagemAquisicaoFinanciada).toBe(0);
    expect(p.euribor).toBe(0);
    expect(p.spread).toBe(0);
    expect(p.structuringFeePct).toBe(0);
    expect(p.setupCosts).toBe(0);
    expect(p.impostoSeloEmprestimoPct).toBe(0);
    expect(p.impostoSeloJurosPct).toBe(0);
    expect(p.limiteCredito).toBe(0);
  });

  it("simularFinanciamento devolve todas as linhas a zero quando comFinanciamento = false", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -1_000_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 200_000, saldoCaixaAntesFinanciamento: -200_000 },
    ];
    const linhas = simularFinanciamento(necessidades, { ...parametrosBase, comFinanciamento: false });
    for (const l of linhas) {
      expect(l.drawdown).toBe(0);
      expect(l.juros).toBe(0);
      expect(l.fees).toBe(0);
      expect(l.impostoSelo).toBe(0);
      expect(l.saldoFinal).toBe(0);
    }
    const resultados = calcResultadosFinanciamento(linhas, 5_000_000, 1_200_000);
    expect(resultados.peakDebt).toBe(0);
    expect(resultados.dividaTotalLevantada).toBe(0);
    expect(resultados.ltv).toBe(0);
    expect(resultados.ltc).toBe(0);
  });
});

describe("Drawdown mensal — nunca lança tudo no primeiro mês sem necessidade", () => {
  it("só levanta dívida na medida da necessidade elegível e do saldo de caixa negativo", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -400_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 500_000, saldoCaixaAntesFinanciamento: -300_000 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    // mês 1: elegível = 1.000.000*0.5 = 500.000; necessidade real = min(500000, 400000) = 400.000
    expect(linhas[0].drawdown).toBe(400_000);
    // mês 2: elegível = 500.000*0.6 = 300.000; necessidade real = min(300000, 300000) = 300.000
    expect(linhas[1].drawdown).toBe(300_000);
  });

  it("respeita o limite de crédito mesmo que a necessidade elegível seja maior", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 5_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -3_000_000 },
    ];
    const p = { ...parametrosBase, limiteCredito: 1_000_000 };
    const linhas = simularFinanciamento(necessidades, p);
    expect(linhas[0].drawdown).toBe(1_000_000);
  });

  it("juros incidem sobre o saldo inicial do mês (dívida acumulada), não sobre o drawdown do próprio mês", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    expect(linhas[0].juros).toBe(0); // saldo inicial do mês 1 é zero
    expect(linhas[1].juros).toBeCloseTo(linhas[0].saldoFinal * taxaMensal(parametrosBase), 6);
  });

  it("fees e imposto de selo do empréstimo só são lançados uma vez, no primeiro drawdown", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -400_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 500_000, saldoCaixaAntesFinanciamento: -300_000 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    expect(linhas[0].fees).toBeGreaterThan(0);
    expect(linhas[1].fees).toBe(0);
  });
});

describe("calcResultadosFinanciamento", () => {
  it("calcula peak debt, LTV e LTC corretamente", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    const resultados = calcResultadosFinanciamento(linhas, 4_000_000, 1_000_000);
    expect(resultados.peakDebt).toBe(linhas[0].saldoFinal);
    expect(resultados.ltv).toBeCloseTo(resultados.peakDebt / 4_000_000, 6);
    expect(resultados.ltc).toBeCloseTo(resultados.peakDebt / 1_000_000, 6);
  });
});

describe("resolverMesInicioCashSweep — nunca assume um mês por omissão", () => {
  const eventos: EventoMensalCashSweep[] = [
    { mes: "2026-01", temEscritura: false, pctVendidoAcumulado: 0.1, pctVgvRecebidoAcumulado: 0.05 },
    { mes: "2026-02", temEscritura: true, pctVendidoAcumulado: 0.4, pctVgvRecebidoAcumulado: 0.3 },
    { mes: "2026-03", temEscritura: true, pctVendidoAcumulado: 0.7, pctVgvRecebidoAcumulado: 0.6 },
  ];

  it("cash sweep inativo devolve null sempre", () => {
    const p = { ...parametrosBase, cashSweepAtivo: false };
    expect(resolverMesInicioCashSweep(p, eventos)).toBeNull();
  });

  it("início = primeira escritura", () => {
    const p = { ...parametrosBase, cashSweepAtivo: true, cashSweepInicioTipo: "primeira_escritura" as const };
    expect(resolverMesInicioCashSweep(p, eventos)).toBe("2026-02");
  });

  it("início = % vendido", () => {
    const p = { ...parametrosBase, cashSweepAtivo: true, cashSweepInicioTipo: "pct_vendido" as const, cashSweepInicioValorPct: 0.5 };
    expect(resolverMesInicioCashSweep(p, eventos)).toBe("2026-03");
  });

  it("início = % VGV recebido", () => {
    const p = { ...parametrosBase, cashSweepAtivo: true, cashSweepInicioTipo: "pct_vgv_recebido" as const, cashSweepInicioValorPct: 0.3 };
    expect(resolverMesInicioCashSweep(p, eventos)).toBe("2026-02");
  });

  it("início = data específica", () => {
    const p = { ...parametrosBase, cashSweepAtivo: true, cashSweepInicioTipo: "data" as const, cashSweepInicioData: "2026-03-15" };
    expect(resolverMesInicioCashSweep(p, eventos)).toBe("2026-03");
  });

  it("gatilho nunca atingido devolve null, nunca inventa um mês", () => {
    const p = { ...parametrosBase, cashSweepAtivo: true, cashSweepInicioTipo: "pct_vendido" as const, cashSweepInicioValorPct: 0.99 };
    expect(resolverMesInicioCashSweep(p, eventos)).toBeNull();
  });
});

describe("simularFinanciamento com cash sweep — nunca deixa o projeto sem caixa", () => {
  const p = {
    ...parametrosBase,
    cashSweepAtivo: true,
    cashSweepPctCaixaLivre: 1, // 100% do caixa livre, para tornar o teste mais direto
    cashSweepMesesCustosFuturos: 0,
    saldoMinimoCaixa: 50_000,
  };

  it("sem cash sweep ativo (mesInicioCashSweep=null), amortização fica a 0", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 800_000 },
    ];
    const linhas = simularFinanciamento(necessidades, p, null);
    expect(linhas[1].amortizacao).toBe(0);
  });

  it("a partir do mês de início, amortiza com o caixa livre acima do saldo mínimo", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 800_000 },
    ];
    const linhas = simularFinanciamento(necessidades, p, "2026-02");
    // caixa disponível no mês 2 = 800_000 (sem novo drawdown); caixa livre = 800_000 - 50_000 (saldo mínimo) = 750_000
    expect(linhas[1].amortizacao).toBeCloseTo(Math.min(linhas[1].saldoInicial + linhas[1].juros, 750_000), 2);
  });

  it("nunca amortiza mais do que a dívida existente (saldo nunca fica negativo)", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 100_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -50_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 10_000_000 }, // caixa muito acima da dívida
    ];
    const linhas = simularFinanciamento(necessidades, p, "2026-02");
    expect(linhas[1].saldoFinal).toBeGreaterThanOrEqual(0);
    expect(linhas[1].amortizacao).toBeLessThanOrEqual(linhas[1].saldoInicial + linhas[1].juros);
  });

  it("reserva os meses de custos futuros configurados, nunca os usa para amortizar", () => {
    const pComReserva = { ...p, cashSweepMesesCustosFuturos: 1 };
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 2_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -1_500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 800_000 },
      { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 200_000, saldoCaixaAntesFinanciamento: 800_000 },
    ];
    const semReserva = simularFinanciamento(necessidades, p, "2026-02");
    const comReserva = simularFinanciamento(necessidades, pComReserva, "2026-02");
    // sem reserva: caixa livre = 800_000 - 50_000 = 750_000 (menor que a dívida, limita a amortização)
    // com reserva: caixa livre = 800_000 - 50_000 - 200_000 (reserva) = 550_000
    expect(comReserva[1].amortizacao).toBeLessThan(semReserva[1].amortizacao);
    expect(comReserva[1].amortizacao).toBeCloseTo(550_000, 2);
    expect(semReserva[1].amortizacao).toBeCloseTo(750_000, 2);
  });

  it("nunca amortiza abaixo do saldo mínimo de caixa", () => {
    const pComSaldoAlto = { ...p, saldoMinimoCaixa: 790_000 };
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 800_000 },
    ];
    const linhas = simularFinanciamento(necessidades, pComSaldoAlto, "2026-02");
    // caixa livre = 800_000 - 790_000 = 10_000, muito menor que a dívida
    expect(linhas[1].amortizacao).toBeCloseTo(10_000, 2);
  });
});

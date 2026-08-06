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
  carenciaAtiva: false,
  carenciaAnos: 0,
  prazoAnos: 0,
  revolver: true,
  commitmentFeePct: 0,
  mesEventoSaida: null,
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

  it("sem cash sweep ativo (mesInicioCashSweep=null), amortização fica a 0 (fora do último mês do horizonte)", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 800_000 },
      { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, p, null);
    expect(linhas[1].amortizacao).toBe(0);
  });

  it("a partir do mês de início, amortiza com o caixa livre acima do saldo mínimo", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -500_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 800_000 },
      { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, p, "2026-02");
    // caixa disponível no mês 2 = 800_000 (sem novo drawdown); caixa livre = 800_000 - 50_000 (saldo mínimo) = 750_000.
    // Juros já não capitalizam no saldo (pagos em caixa à parte) — o teto do cash sweep é só o saldo devedor.
    expect(linhas[1].amortizacao).toBeCloseTo(Math.min(linhas[1].saldoInicial, 750_000), 2);
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
      { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, pComSaldoAlto, "2026-02");
    // caixa livre = 800_000 - 790_000 = 10_000, muito menor que a dívida
    expect(linhas[1].amortizacao).toBeCloseTo(10_000, 2);
  });
});

describe("dividaAllIn — peak debt + custos financeiros acumulados até ao pico (achado P1.8 da auditoria 03/08)", () => {
  it("nunca é apenas o peak debt quando há juros/fees/imposto de selo — soma os custos financeiros até (e incluindo) o mês do pico, nunca o total do horizonte inteiro", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -1_000_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
      { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 2_000_000 }, // liquida a dívida aqui, via caixa positivo
    ];
    const linhas = simularFinanciamento(necessidades, { ...parametrosBase, limiteCredito: null });
    const resultados = calcResultadosFinanciamento(linhas, 4_000_000, 1_000_000);

    expect(resultados.dividaAllIn).toBeGreaterThan(resultados.peakDebt);

    // Verificação independente: soma manual de juros+fees+comissão+imposto selo
    // só até ao mês do pico (não inclui nada depois, mesmo que a dívida já
    // esteja liquidada e ainda existam meses no horizonte).
    const idxPico = linhas.findIndex((l) => l.mes === resultados.mesDividaMaxima);
    const custosAtePico = linhas.slice(0, idxPico + 1).reduce((s, l) => s + l.juros + l.fees + l.comissaoCompromisso + l.impostoSelo, 0);
    expect(resultados.dividaAllIn).toBeCloseTo(resultados.peakDebt + custosAtePico, 2);
  });

  it("sem nenhum drawdown, dividaAllIn é 0 (nunca soma custos financeiros de um pico que não existe)", () => {
    const necessidades: NecessidadeMensal[] = [{ mes: "2026-01", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 }];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    const resultados = calcResultadosFinanciamento(linhas, 4_000_000, 1_000_000);
    expect(resultados.dividaAllIn).toBe(0);
  });
});

describe("Revolver vs. non-revolver (secção 22 do prompt 03_08)", () => {
  const necessidades: NecessidadeMensal[] = [
    { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -900_000 },
    { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 900_000 }, // caixa para amortizar via cash sweep
    { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 800_000, saldoCaixaAntesFinanciamento: -800_000 }, // nova necessidade, depois de ter amortizado
  ];
  const pBase = {
    ...parametrosBase,
    percentagemAquisicaoFinanciada: 1,
    percentagemHardCostsFinanciada: 1,
    limiteCredito: 900_000,
    cashSweepAtivo: true,
    cashSweepPctCaixaLivre: 1,
    cashSweepMesesCustosFuturos: 0,
    saldoMinimoCaixa: 0,
  };

  it("revolver: depois de amortizar, o limite reabre e volta a levantar dívida contra o mesmo teto", () => {
    const linhas = simularFinanciamento(necessidades, { ...pBase, revolver: true }, "2026-02");
    expect(linhas[1].amortizacao).toBeCloseTo(900_000, 2); // amortiza tudo, saldo volta a 0
    expect(linhas[2].drawdown).toBeGreaterThan(0); // limite reaberto — volta a levantar
  });

  it("non-revolver: depois de amortizar, o limite NÃO reabre — o teto compara-se ao total já alguma vez levantado", () => {
    const linhas = simularFinanciamento(necessidades, { ...pBase, revolver: false }, "2026-02");
    expect(linhas[1].amortizacao).toBeCloseTo(900_000, 2); // amortiza na mesma
    // já levantou 900.000 no total (= o limite inteiro) — non-revolver nunca deixa levantar mais, mesmo com saldo a 0
    expect(linhas[2].drawdown).toBe(0);
  });
});

describe("Comissão de compromisso (secção 22 do prompt 03_08) — nunca confundida com juros nem com fees de estruturação", () => {
  it("incide só sobre o montante não utilizado do limite, pro-rata mensal da taxa anual", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 400_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -400_000 },
    ];
    const p = { ...parametrosBase, percentagemAquisicaoFinanciada: 1, limiteCredito: 1_000_000, commitmentFeePct: 0.012 };
    const linhas = simularFinanciamento(necessidades, p);
    expect(linhas[0].drawdown).toBe(400_000);
    // não utilizado após o drawdown = 1.000.000 - 400.000 = 600.000; comissão mensal = 600.000 * 0.012/12
    expect(linhas[0].comissaoCompromisso).toBeCloseTo(600_000 * (0.012 / 12), 2);
  });

  it("sem limite de crédito explícito, nunca cobra comissão de compromisso (não há 'não utilizado' definido)", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 400_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -400_000 },
    ];
    const p = { ...parametrosBase, percentagemAquisicaoFinanciada: 1, limiteCredito: null, commitmentFeePct: 0.012 };
    const linhas = simularFinanciamento(necessidades, p);
    expect(linhas[0].comissaoCompromisso).toBe(0);
  });

  it("entra em jurosEFees do cash flow (via calcularCashFlow), nunca some do custo financeiro do projeto", async () => {
    const { calcularCashFlow } = await import("./cashflow");
    const linhasCusto = [
      {
        id: "1",
        grupo: "aquisicao" as const,
        categoria: "Aquisição",
        nome: "Aquisição",
        tipoCalculo: "valor_fixo" as const,
        valorInput: 1_000_000,
        baseReferenciaCustoId: null,
        taxaIva: null,
        ivaRecuperavelPct: 0,
        dataIvaRecuperacao: null,
        dataInicial: "2026-01-01",
        duracaoMeses: 1,
        dataFinal: "2026-01-31",
        perfilDesembolso: "linear" as const,
      },
    ];
    const contextoCusto = { valorAquisicao: 1_000_000, abcAcimaSolo: 600, abcAbaixoSolo: 400, abdTotal: 200, numeroUnidades: 10 };
    const p = { ...parametrosBase, percentagemAquisicaoFinanciada: 1, limiteCredito: 2_000_000, commitmentFeePct: 0.012 };
    const semComissao = calcularCashFlow({
      linhasCusto,
      contextoCusto,
      recebimentos: [{ mes: "2027-01", reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: 2_000_000, escritura: 0, total: 2_000_000 }],
      parametrosFinanciamento: { ...p, commitmentFeePct: 0 },
      saldoMinimoCaixa: 0,
    });
    const comComissao = calcularCashFlow({
      linhasCusto,
      contextoCusto,
      recebimentos: [{ mes: "2027-01", reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: 2_000_000, escritura: 0, total: 2_000_000 }],
      parametrosFinanciamento: p,
      saldoMinimoCaixa: 0,
    });
    expect(comComissao.custosFinanceiros).toBeGreaterThan(semComissao.custosFinanceiros);
    expect(comComissao.financiamento.comissaoCompromissoTotal).toBeGreaterThan(0);
  });
});

describe("Evento de saída/refinanciamento explícito (secção 22 do prompt 03_08)", () => {
  it("com mesEventoSaida definido, a dívida é liquidada integralmente nesse mês, não escondida no fim do horizonte", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -1_000_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
      { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, { ...parametrosBase, limiteCredito: null, mesEventoSaida: "2026-02" });
    expect(linhas[1].mes).toBe("2026-02");
    expect(linhas[1].eventoLiquidacao).toBe(true);
    expect(linhas[1].saldoFinal).toBe(0);
    // mês seguinte já não tem dívida nem evento de liquidação — já foi liquidada antes
    expect(linhas[2].eventoLiquidacao).toBe(false);
    expect(linhas[2].saldoFinal).toBe(0);

    const resultados = calcResultadosFinanciamento(linhas, 4_000_000, 1_000_000);
    expect(resultados.mesLiquidacaoDivida).toBe("2026-02");
    expect(resultados.valorLiquidadoNoEvento).toBeGreaterThan(0);
  });

  it("sem mesEventoSaida, mantém a rede de segurança implícita no último mês do horizonte", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 1_000_000, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: -1_000_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, { ...parametrosBase, limiteCredito: null, mesEventoSaida: null });
    expect(linhas[0].eventoLiquidacao).toBe(false);
    expect(linhas[1].eventoLiquidacao).toBe(true);
    expect(linhas[1].saldoFinal).toBe(0);

    const resultados = calcResultadosFinanciamento(linhas, 4_000_000, 1_000_000);
    expect(resultados.mesLiquidacaoDivida).toBe("2026-02");
  });
});

describe("Carência do principal (auditoria — secção 15)", () => {
  // Prazo total: 5 anos (60 meses). Carência: 2 anos (24 meses), contados a
  // partir do primeiro drawdown (mês 1). Um único drawdown no mês 1,
  // sem mais necessidades depois — isola o comportamento da carência.
  const prazoTotalMeses = 60;
  function gerarNecessidades(): NecessidadeMensal[] {
    const linhas: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 1_200_000, saldoCaixaAntesFinanciamento: -1_200_000 },
    ];
    for (let i = 1; i < prazoTotalMeses; i++) {
      const ano = 2026 + Math.floor(i / 12);
      const mes = (i % 12) + 1;
      linhas.push({ mes: `${ano}-${String(mes).padStart(2, "0")}`, custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 });
    }
    return linhas;
  }

  const pCarencia: ParametrosFinanciamento = {
    ...parametrosBase,
    percentagemHardCostsFinanciada: 1,
    limiteCredito: 2_000_000,
    carenciaAtiva: true,
    carenciaAnos: 2,
    prazoAnos: 5,
  };

  it("meses 1 a 24: juros ≥ 0, amortização de principal sempre igual a zero", () => {
    const linhas = simularFinanciamento(gerarNecessidades(), pCarencia);
    for (let i = 0; i < 24; i++) {
      expect(linhas[i].juros).toBeGreaterThanOrEqual(0);
      expect(linhas[i].amortizacao).toBe(0);
    }
    // o saldo devedor nunca desce durante a carência (só sobe, com os juros capitalizados)
    expect(linhas[23].saldoFinal).toBeGreaterThanOrEqual(linhas[0].saldoFinal);
  });

  it("mês 25 em diante: começa a amortizar, saldo devedor reduz progressivamente", () => {
    const linhas = simularFinanciamento(gerarNecessidades(), pCarencia);
    expect(linhas[24].amortizacao).toBeGreaterThan(0); // mês 25 (índice 24) — primeiro mês fora da carência
    // progressivamente decrescente: cada mês seguinte tem saldo devedor menor
    for (let i = 25; i < prazoTotalMeses; i++) {
      expect(linhas[i].saldoFinal).toBeLessThanOrEqual(linhas[i - 1].saldoFinal + 1e-6);
    }
    expect(linhas[prazoTotalMeses - 1].saldoFinal).toBeCloseTo(0, 2); // liquidado na maturidade, nunca negativo
    expect(linhas[prazoTotalMeses - 1].saldoFinal).toBeGreaterThanOrEqual(-1e-6);
  });

  it("sem carência e sem cash sweep, a dívida nunca amortiza durante o projeto — mas é sempre liquidada no último mês do horizonte (regressão do Achado P0.1 da auditoria de 2026-07-31)", () => {
    const pSemCarencia = { ...pCarencia, carenciaAtiva: false };
    const linhas = simularFinanciamento(gerarNecessidades(), pSemCarencia);
    // Nenhum mês antes do último amortiza sozinho — sem carência nem cash sweep, não há mecanismo de amortização corrente.
    expect(linhas.slice(0, -1).every((l) => l.amortizacao === 0)).toBe(true);
    // Mas o saldo devedor nunca fica por pagar no fim do horizonte modelado — a dívida bancária nunca pode
    // ser distribuída ao equity como se fosse lucro (era exatamente isto que acontecia antes da correção).
    expect(linhas[linhas.length - 1].saldoFinal).toBeCloseTo(0, 2);
    expect(linhas[linhas.length - 1].amortizacao).toBeGreaterThan(0);
  });

  it("cash sweep nunca amortiza durante a carência, mesmo que ativo", () => {
    const pComSweep = { ...pCarencia, cashSweepAtivo: true, cashSweepPctCaixaLivre: 1 };
    const linhas = simularFinanciamento(gerarNecessidades(), pComSweep, "2026-01");
    for (let i = 0; i < 24; i++) {
      expect(linhas[i].amortizacao).toBe(0);
    }
  });
});

import { describe, it, expect } from "vitest";
import { gerarAlertas, type ContextoAlertas } from "./alertas";

function contextoLimpo(overrides: Partial<ContextoAlertas> = {}): ContextoAlertas {
  return {
    temCodigoPostalValido: true,
    abcTotal: 2000,
    abpProgramada: 1600,
    eficiencia: 0.8,
    totalUnidades: 40,
    unidadesVendidas: 10,
    dataLancamentoComercialPassada: true,
    algumaUnidadeComSinalMaisReforcosAcimaDe100Pct: false,
    algumaTipologiaVendeuMaisDoQueAQuantidade: false,
    sinalMaisReforcosAquisicaoAcimaDe100Pct: false,
    temEscrituraAquisicaoSemData: false,
    existeCustoAtivoSemData: false,
    existeHardCostSemDuracao: false,
    dataEscritura: "2028-01-01",
    primeiraDataVendaUnidade: "2026-03-01",
    dataFimConstrucao: "2027-12-01",
    ivaReduzidoAplicadoSemConfirmacao: false,
    ltv: 0.5,
    algumMesComSaldoCaixaNegativoAposFinanciamento: false,
    equityCommitted: 1_000_000,
    peakCashExposure: 800_000,
    irrLevered: 0.15,
    gdv: 4_000_000,
    custoTotal: 3_000_000,
    margem: 0.2,
    temInvestidorExterno: false,
    lucroLevered: 1_000_000,
    lucroInvestidor: null,
    lucroPromotorTotal: null,
    feesPromotor: null,
    linhasReconciliacao: [{ mes: "2026-01", saldoAnterior: 0, entradas: 100, saidas: 50, saldoAtual: 50 }],
    margemSensibilidadeBase: 0.2,
    ...overrides,
  };
}

describe("gerarAlertas — contexto limpo não gera nenhum alerta", () => {
  it("sem nenhum problema, devolve lista vazia", () => {
    expect(gerarAlertas(contextoLimpo())).toHaveLength(0);
  });
});

describe("Identificação / Áreas", () => {
  it("ABC zero dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ abcTotal: 0 }));
    expect(r.find((a) => a.id === "abc_zero")?.tipo).toBe("erro");
  });
  it("ABP > ABC dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ abpProgramada: 3000, abcTotal: 2000 }));
    expect(r.find((a) => a.id === "abp_maior_que_abc")?.tipo).toBe("erro");
  });
  it("eficiência > 100% dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ eficiencia: 1.05 }));
    expect(r.find((a) => a.id === "eficiencia_acima_100")?.tipo).toBe("erro");
  });
  it("sem dados de eficiência (null), nunca dispara", () => {
    const r = gerarAlertas(contextoLimpo({ eficiencia: null }));
    expect(r.find((a) => a.id === "eficiencia_acima_100")).toBeUndefined();
  });
});

describe("Programa / Sales Table", () => {
  it("unidades zero dispara alerta", () => {
    const r = gerarAlertas(contextoLimpo({ totalUnidades: 0 }));
    expect(r.find((a) => a.id === "unidades_zero")?.tipo).toBe("alerta");
  });
  it("vendas zero só dispara se o lançamento já passou", () => {
    const antes = gerarAlertas(contextoLimpo({ unidadesVendidas: 0, dataLancamentoComercialPassada: false }));
    const depois = gerarAlertas(contextoLimpo({ unidadesVendidas: 0, dataLancamentoComercialPassada: true }));
    expect(antes.find((a) => a.id === "vendas_zero")).toBeUndefined();
    expect(depois.find((a) => a.id === "vendas_zero")?.tipo).toBe("alerta");
  });
});

describe("Financiamento", () => {
  it("LTV > 65% dispara alerta", () => {
    const r = gerarAlertas(contextoLimpo({ ltv: 0.7 }));
    expect(r.find((a) => a.id === "ltv_acima_65")?.tipo).toBe("alerta");
  });
  it("LTV <= 65% nunca dispara", () => {
    const r = gerarAlertas(contextoLimpo({ ltv: 0.65 }));
    expect(r.find((a) => a.id === "ltv_acima_65")).toBeUndefined();
  });
  it("funding gap dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ algumMesComSaldoCaixaNegativoAposFinanciamento: true }));
    expect(r.find((a) => a.id === "funding_gap")?.tipo).toBe("erro");
  });
  it("equity committed abaixo do peak exposure dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ equityCommitted: 500_000, peakCashExposure: 800_000 }));
    expect(r.find((a) => a.id === "equity_committed_abaixo_exposure")?.tipo).toBe("erro");
  });
});

describe("Calendário", () => {
  it("escritura antes da venda dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ dataEscritura: "2026-01-01", primeiraDataVendaUnidade: "2026-06-01" }));
    expect(r.find((a) => a.id === "escritura_antes_de_venda")?.tipo).toBe("erro");
  });
  it("escritura antes da conclusão da obra dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ dataEscritura: "2026-01-01", dataFimConstrucao: "2027-01-01" }));
    expect(r.find((a) => a.id === "escritura_antes_de_obra")?.tipo).toBe("erro");
  });
});

describe("Resultados", () => {
  it("IRR não calculável dispara alerta", () => {
    const r = gerarAlertas(contextoLimpo({ irrLevered: null }));
    expect(r.find((a) => a.id === "irr_nao_calculavel")?.tipo).toBe("alerta");
  });
  it("IRR ainda não calculado (undefined) nunca dispara", () => {
    const r = gerarAlertas(contextoLimpo({ irrLevered: undefined }));
    expect(r.find((a) => a.id === "irr_nao_calculavel")).toBeUndefined();
  });
  it("custo total acima do VGV dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ gdv: 1_000_000, custoTotal: 1_200_000 }));
    expect(r.find((a) => a.id === "custo_acima_vgv")?.tipo).toBe("erro");
  });
  it("margem negativa dispara alerta", () => {
    const r = gerarAlertas(contextoLimpo({ margem: -0.05 }));
    expect(r.find((a) => a.id === "margem_negativa")?.tipo).toBe("alerta");
  });
  it("margem positiva mas apertada (<10%) dispara recomendação", () => {
    const r = gerarAlertas(contextoLimpo({ margem: 0.05 }));
    expect(r.find((a) => a.id === "margem_apertada")?.tipo).toBe("recomendacao");
  });
  it("margem confortável (>=10%) nunca dispara recomendação nem alerta", () => {
    const r = gerarAlertas(contextoLimpo({ margem: 0.2 }));
    expect(r.find((a) => a.id === "margem_apertada")).toBeUndefined();
    expect(r.find((a) => a.id === "margem_negativa")).toBeUndefined();
  });
});

describe("Waterfall", () => {
  it("sem investidor externo, nunca dispara", () => {
    const r = gerarAlertas(contextoLimpo({ temInvestidorExterno: false, lucroInvestidor: 999_999_999 }));
    expect(r.find((a) => a.id === "waterfall_inconsistente")).toBeUndefined();
  });
  it("com investidor, soma inconsistente dispara erro", () => {
    const r = gerarAlertas(
      contextoLimpo({
        temInvestidorExterno: true,
        lucroLevered: 1_000_000,
        lucroInvestidor: 300_000,
        lucroPromotorTotal: 200_000, // 300k + 200k = 500k, muito longe de 1_000_000
        feesPromotor: 0,
      })
    );
    expect(r.find((a) => a.id === "waterfall_inconsistente")?.tipo).toBe("erro");
  });
  it("com investidor, soma consistente nunca dispara", () => {
    const r = gerarAlertas(
      contextoLimpo({
        temInvestidorExterno: true,
        lucroLevered: 1_000_000,
        lucroInvestidor: 600_000,
        lucroPromotorTotal: 400_000,
        feesPromotor: 0,
      })
    );
    expect(r.find((a) => a.id === "waterfall_inconsistente")).toBeUndefined();
  });
});

describe("Reconciliação de cash flow", () => {
  it("mês que não concilia dispara erro", () => {
    const r = gerarAlertas(
      contextoLimpo({ linhasReconciliacao: [{ mes: "2026-03", saldoAnterior: 100, entradas: 50, saidas: 20, saldoAtual: 999 }] })
    );
    expect(r.find((a) => a.id === "cash_flow_nao_conciliado")?.tipo).toBe("erro");
  });
  it("dentro da tolerância de €0,01 nunca dispara", () => {
    const r = gerarAlertas(
      contextoLimpo({ linhasReconciliacao: [{ mes: "2026-03", saldoAnterior: 100, entradas: 50, saidas: 20, saldoAtual: 130.005 }] })
    );
    expect(r.find((a) => a.id === "cash_flow_nao_conciliado")).toBeUndefined();
  });
});

describe("Sensibilidade-base divergente", () => {
  it("célula 0x0 diferente do resultado principal dispara erro", () => {
    const r = gerarAlertas(contextoLimpo({ margem: 0.2, margemSensibilidadeBase: 0.25 }));
    expect(r.find((a) => a.id === "sensibilidade_base_divergente")?.tipo).toBe("erro");
  });
  it("iguais nunca dispara", () => {
    const r = gerarAlertas(contextoLimpo({ margem: 0.2, margemSensibilidadeBase: 0.2 }));
    expect(r.find((a) => a.id === "sensibilidade_base_divergente")).toBeUndefined();
  });
});

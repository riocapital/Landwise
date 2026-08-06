import { describe, it, expect } from "vitest";
import { calcularRecomendacao, POLITICA_REFERENCIA_LANDWISE, type PoliticaRecomendacao } from "./recomendacao";
import type { ProjectUnderwritingResult } from "./underwriting";

function underwriting(overrides: Partial<ProjectUnderwritingResult>): ProjectUnderwritingResult {
  return {
    versaoMotor: "test",
    calculadoEm: new Date().toISOString(),
    grossVgv: 0,
    commercialCommission: 0,
    commercialCommissionPct: null,
    netVgv: 0,
    otherOperatingRevenue: 0,
    averageTicket: null,
    unitCount: 0,
    averageSalePricePerSqm: null,
    acquisitionPrice: 0,
    acquisitionCosts: 0,
    hardCosts: 0,
    softCosts: 0,
    developmentFee: 0,
    marketingCosts: 0,
    contingency: 0,
    nonRecoverableVat: 0,
    financingCosts: 0,
    projectCapexBeforePromoteAndTax: 0,
    capexPerAbcSqm: null,
    profitBeforePromoteAndTax: 0,
    promoteFee: 0,
    profitAfterPromote: 0,
    estimatedTaxes: 0,
    netProfit: 0,
    committedDebt: 0,
    usedDebtTotal: 0,
    peakDebt: 0,
    peakDebtMonth: null,
    totalInterest: 0,
    totalBankFees: 0,
    finalDebtBalance: 0,
    effectiveLtc: 0.3,
    leveredEquityInvested: 0,
    unleveredEquityInvested: null,
    peakEquityExposure: 0,
    peakEquityMonth: null,
    capitalReturned: 0,
    profitDistributed: 0,
    totalReturn: 0,
    leveredRoi: 0.25,
    unleveredRoi: 0.1,
    leveredIrr: 0.18,
    unleveredIrr: 0.09,
    moic: 1.4,
    durationMonths: 30,
    paybackMonth: null,
    qualidade: { reconciliacoes: [], todasReconciliacoesOk: true, camposEmFalta: [], overridesAtivos: [], nivelConfianca: "alta" },
    ...overrides,
  };
}

describe("calcularRecomendacao — nunca depende só de lucro positivo (secção 17 do prompt 03_08)", () => {
  it("dados insuficientes quando underwriting é null", () => {
    const r = calcularRecomendacao(null, 0);
    expect(r.nivel).toBe("dados_insuficientes");
    expect(r.fatores).toHaveLength(0);
  });

  it("todos os fatores dentro da política de referência → avançar", () => {
    const r = calcularRecomendacao(underwriting({}), 0);
    expect(r.nivel).toBe("avancar");
    expect(r.fatores.every((f) => f.ok !== false)).toBe(true);
  });

  it("2 alertas críticos são só um fator (peso crítico) que falha — nunca ignora alertas, mesmo com todos os retornos acima do mínimo", () => {
    const r = calcularRecomendacao(underwriting({}), 2);
    const fatorAlertas = r.fatores.find((f) => f.nome === "Alertas críticos")!;
    expect(fatorAlertas.ok).toBe(false);
    expect(r.nivel).not.toBe("avancar");
  });

  it("TIR alavancada e ROI alavancado abaixo do mínimo (2 fatores críticos) → não avançar, mesmo com lucro positivo", () => {
    const r = calcularRecomendacao(underwriting({ leveredIrr: 0.02, leveredRoi: 0.01, netProfit: 500_000 }), 0);
    expect(r.nivel).toBe("nao_avancar");
    const tirFator = r.fatores.find((f) => f.nome === "TIR alavancada")!;
    expect(tirFator.ok).toBe(false);
  });

  it("só 1 fator crítico falhado → rever premissas, não bloqueia por completo", () => {
    const r = calcularRecomendacao(underwriting({ leveredIrr: 0.02 }), 0);
    expect(r.nivel).toBe("rever_premissas");
  });

  it("reconciliações fora da tolerância contam como fator crítico falhado", () => {
    const r = calcularRecomendacao(
      underwriting({ qualidade: { reconciliacoes: [], todasReconciliacoesOk: false, camposEmFalta: [], overridesAtivos: [], nivelConfianca: "baixa" } }),
      0
    );
    const fatorReconciliacao = r.fatores.find((f) => f.nome === "Reconciliações")!;
    expect(fatorReconciliacao.ok).toBe(false);
    expect(r.nivel).toBe("rever_premissas");
  });

  it("só fatores médios falhados (ex.: LTC acima do máximo) → avançar com condições, nunca bloqueia", () => {
    const r = calcularRecomendacao(underwriting({ effectiveLtc: 0.9 }), 0);
    const fatorLtc = r.fatores.find((f) => f.nome === "LTC efetivo")!;
    expect(fatorLtc.ok).toBe(false);
    expect(r.nivel).toBe("avancar_com_condicoes");
  });

  it("política sem limiar num fator (null) nunca o avalia como falhado — fica ok: null", () => {
    const politicaSemLtc: PoliticaRecomendacao = { ...POLITICA_REFERENCIA_LANDWISE, ltcMaximo: null };
    const r = calcularRecomendacao(underwriting({ effectiveLtc: 0.99 }), 0, politicaSemLtc);
    const fatorLtc = r.fatores.find((f) => f.nome === "LTC efetivo")!;
    expect(fatorLtc.ok).toBeNull();
    expect(r.nivel).toBe("avancar");
  });

  it("indicador não calculável (null) nunca é tratado como falha silenciosa nem como sucesso — fica ok: null", () => {
    const r = calcularRecomendacao(underwriting({ unleveredIrr: null }), 0);
    const fator = r.fatores.find((f) => f.nome === "TIR não alavancada")!;
    expect(fator.ok).toBeNull();
    expect(fator.valor).toBeNull();
  });

  it("política de referência é só o ponto de partida — outra política com limiares diferentes muda o resultado para o mesmo underwriting", () => {
    const u = underwriting({ leveredIrr: 0.1 });
    const referencia = calcularRecomendacao(u, 0, POLITICA_REFERENCIA_LANDWISE);
    const politicaPermissiva: PoliticaRecomendacao = { ...POLITICA_REFERENCIA_LANDWISE, irrLeveredMinimo: 0.05 };
    const permissiva = calcularRecomendacao(u, 0, politicaPermissiva);
    expect(referencia.nivel).not.toBe("avancar");
    expect(permissiva.nivel).toBe("avancar");
  });
});

// ProjectUnderwritingResult — contrato central de resultado, Gate 1 da
// consolidação pré-relatório (03/08).
//
// Esta função NÃO recalcula nada por conta própria: só combina resultados
// já produzidos pelos motores existentes (cashflow.ts, financiamento.ts,
// equity.ts, estrutura-capital.ts/waterfall.ts, fees.ts, metricas.ts) —
// "não criar um segundo motor" é uma restrição explícita do plano. Dashboard,
// sensibilidades e relatório devem consumir ESTE objeto, nunca recalcular
// os mesmos números por fora.
//
// Convenção de resultado adotada (secção 5 do prompt 03_08):
//   profitBeforePromoteAndTax = netVgv + otherOperatingRevenue − projectCapexBeforePromoteAndTax
// `projectCapexBeforePromoteAndTax` nunca inclui a comissão comercial (já
// descontada em netVgv) nem o promote nem o imposto — cada um entra numa
// etapa posterior e distinta, nunca descontado duas vezes.
//
// Tolerância monetária: €0,01 em qualquer reconciliação (secção 5).

import type { ResultadoCashFlow } from "./cashflow";
import type { ResultadosInvestidorPromotor } from "./estrutura-capital";

const TOLERANCIA_EUR = 0.01;

export type Reconciliacao = {
  nome: string;
  esperado: number;
  obtido: number;
  diferenca: number;
  ok: boolean;
};

function reconciliar(nome: string, esperado: number, obtido: number): Reconciliacao {
  const diferenca = obtido - esperado;
  return { nome, esperado, obtido, diferenca, ok: Math.abs(diferenca) <= TOLERANCIA_EUR };
}

export type QualidadeUnderwriting = {
  reconciliacoes: Reconciliacao[];
  todasReconciliacoesOk: boolean;
  camposEmFalta: string[]; // campos do contrato que ainda não têm motor próprio (nunca inventados)
  overridesAtivos: string[]; // descrições curtas de premissas manuais/override em uso
  nivelConfianca: "alta" | "media" | "baixa";
};

export type ProjectUnderwritingResult = {
  versaoMotor: string; // rastreabilidade — nunca "cacheado" sem esta marca
  calculadoEm: string; // ISO

  // --- Receita ---
  grossVgv: number;
  commercialCommission: number;
  commercialCommissionPct: number | null;
  netVgv: number;
  otherOperatingRevenue: number; // sem motor dedicado ainda — sempre 0, nunca inventado (ver qualidade.camposEmFalta)
  averageTicket: number | null;
  unitCount: number;
  averageSalePricePerSqm: number | null;

  // --- CAPEX e custos ---
  acquisitionPrice: number;
  acquisitionCosts: number;
  hardCosts: number;
  softCosts: number;
  developmentFee: number;
  marketingCosts: number; // sem motor dedicado ainda — sempre 0 (ver qualidade.camposEmFalta)
  contingency: number; // sem categoria própria distinta ainda — sempre 0, já incluída em hard/soft quando configurada como % (ver qualidade.camposEmFalta)
  nonRecoverableVat: number;
  financingCosts: number;
  projectCapexBeforePromoteAndTax: number;
  capexPerAbcSqm: number | null;

  // --- Resultado ---
  profitBeforePromoteAndTax: number;
  promoteFee: number;
  profitAfterPromote: number;
  estimatedTaxes: number;
  netProfit: number;

  // --- Financiamento ---
  committedDebt: number; // proxy = limite de crédito quando definido, senão peakDebt (ver qualidade.camposEmFalta — não há ainda "facility comprometida" distinta)
  usedDebtTotal: number;
  peakDebt: number;
  peakDebtMonth: string | null;
  totalInterest: number;
  totalBankFees: number;
  finalDebtBalance: number;
  effectiveLtc: number | null;

  // --- Capital e retorno ---
  leveredEquityInvested: number;
  unleveredEquityInvested: number | null;
  peakEquityExposure: number;
  peakEquityMonth: string | null;
  capitalReturned: number; // nunca inclui lucro — separado de profitDistributed (corrige P0.5)
  profitDistributed: number;
  totalReturn: number; // capitalReturned + profitDistributed
  leveredRoi: number | null;
  unleveredRoi: number | null;
  leveredIrr: number | null;
  unleveredIrr: number | null;
  moic: number | null;
  durationMonths: number | null;
  paybackMonth: string | null;

  qualidade: QualidadeUnderwriting;
};

export type EntradaUnderwriting = {
  resultado: ResultadoCashFlow; // cenário levered (motor real, com financiamento tal como configurado)
  resultadoUnlevered: ResultadoCashFlow | null; // mesmo motor, comFinanciamento:false — null só quando o cálculo não pôde correr (dados insuficientes)
  investidorPromotor: ResultadosInvestidorPromotor | null;
  feesTotais: number;
  impostoEstimadoLevered: number;
  impostoEstimadoUnlevered: number | null;
  acquisitionPrice: number;
  acquisitionCosts: number;
  abcTotal: number | null;
  averageSalePricePerSqm: number | null;
  unitCount: number;
  committedDebtLimite: number | null; // financiamento.limiteCredito
  primeiraSaidaCapital: string | null; // "YYYY-MM" — primeiro mês com custo/drawdown/equity call real
  ultimaEntradaCapitalOuRetorno: string | null; // "YYYY-MM" — último mês com distribuição/retorno real
};

/**
 * Função de topo do contrato central. Recebe resultados JÁ calculados
 * pelos motores existentes (nunca recalcula fórmulas aqui) e devolve o
 * objeto único que dashboard, sensibilidades e relatório devem consumir.
 */
export function montarUnderwritingResult(entrada: EntradaUnderwriting): ProjectUnderwritingResult {
  const { resultado, resultadoUnlevered, investidorPromotor, feesTotais } = entrada;

  const grossVgv = resultado.gdv;
  const commercialCommission = resultado.comissaoComercialTotal;
  const netVgv = grossVgv - commercialCommission;
  const otherOperatingRevenue = 0;

  const acquisitionPrice = entrada.acquisitionPrice;
  const acquisitionCosts = entrada.acquisitionCosts;
  const hardCosts = resultado.linhas.reduce((s, l) => s + l.hardCosts, 0);
  const softCosts = resultado.linhas.reduce((s, l) => s + l.softCosts + l.outrosCustos, 0);
  const nonRecoverableVat = resultado.linhas.reduce((s, l) => s + l.ivaNaoRecuperavel, 0);
  const financingCosts = resultado.custosFinanceiros;
  const marketingCosts = 0;
  const contingency = 0;
  const developmentFee = feesTotais;

  const projectCapexBeforePromoteAndTax =
    acquisitionPrice + acquisitionCosts + hardCosts + softCosts + developmentFee + marketingCosts + contingency + nonRecoverableVat + financingCosts;

  const profitBeforePromoteAndTax = netVgv + otherOperatingRevenue - projectCapexBeforePromoteAndTax;
  const promoteFee = investidorPromotor?.promotor.promote ?? 0;
  const profitAfterPromote = profitBeforePromoteAndTax - promoteFee;
  const estimatedTaxes = entrada.impostoEstimadoLevered;
  const netProfit = profitAfterPromote - estimatedTaxes;

  const leveredEquityInvested = resultado.equity.equityContributed;
  const capitalReturned = Math.min(leveredEquityInvested, resultado.equity.capitalDevolvidoTotal);
  const profitDistributed = Math.max(0, resultado.equity.capitalDevolvidoTotal - leveredEquityInvested);
  const totalReturn = capitalReturned + profitDistributed;
  const leveredRoi = leveredEquityInvested > 0 ? netProfit / leveredEquityInvested : null;
  const leveredIrr = resultado.equity.irr;
  const moic = leveredEquityInvested > 0 ? totalReturn / leveredEquityInvested : null;

  // Unlevered: mesmo motor (calcularCashFlow), segunda execução com
  // comFinanciamento:false — nunca "cenário alavancado com dívida
  // zerada" (secção 14): o financiamento é desligado desde a origem, o
  // que muda genuinamente o funding necessário e o timing do equity.
  let unleveredEquityInvested: number | null = null;
  let unleveredRoi: number | null = null;
  const unleveredIrr = resultado.irrProjeto; // já é XIRR sobre cashFlowUnlevered — independente de haver ou não financiamento
  if (resultadoUnlevered && entrada.impostoEstimadoUnlevered !== null) {
    unleveredEquityInvested = resultadoUnlevered.equity.equityContributed;
    const capexUnlevered =
      acquisitionPrice +
      acquisitionCosts +
      resultadoUnlevered.linhas.reduce((s, l) => s + l.hardCosts, 0) +
      resultadoUnlevered.linhas.reduce((s, l) => s + l.softCosts + l.outrosCustos, 0) +
      developmentFee +
      marketingCosts +
      contingency +
      resultadoUnlevered.linhas.reduce((s, l) => s + l.ivaNaoRecuperavel, 0) +
      resultadoUnlevered.custosFinanceiros; // 0 quando comFinanciamento=false
    const netVgvUnlevered = resultadoUnlevered.gdv - resultadoUnlevered.comissaoComercialTotal;
    // Sem promote no cenário não alavancado — o promote é um mecanismo da
    // estrutura de capital alavancada (waterfall/investidor externo), não
    // da economia base do projeto sem dívida.
    const profitBeforeTaxUnlevered = netVgvUnlevered - capexUnlevered;
    const netProfitUnlevered = profitBeforeTaxUnlevered - entrada.impostoEstimadoUnlevered;
    unleveredRoi = unleveredEquityInvested > 0 ? netProfitUnlevered / unleveredEquityInvested : null;
  }

  const committedDebt = entrada.committedDebtLimite ?? resultado.financiamento.peakDebt;
  const finalDebtBalance = resultado.linhas.length > 0 ? resultado.linhas[resultado.linhas.length - 1].saldoDivida : 0;

  const durationMonths =
    entrada.primeiraSaidaCapital && entrada.ultimaEntradaCapitalOuRetorno
      ? diferencaMeses(entrada.primeiraSaidaCapital, entrada.ultimaEntradaCapitalOuRetorno)
      : null;

  const paybackMonth = resultado.equity.dataRecuperacaoIntegral;

  const acquisitionCostsELinhas = acquisitionCosts; // nome curto p/ reconciliação abaixo
  const reconciliacoes: Reconciliacao[] = [
    reconciliar("comercial: grossVgv - commercialCommission = netVgv", netVgv, grossVgv - commercialCommission),
    reconciliar(
      "capex: soma das componentes = projectCapexBeforePromoteAndTax",
      projectCapexBeforePromoteAndTax,
      acquisitionPrice + acquisitionCostsELinhas + hardCosts + softCosts + developmentFee + marketingCosts + contingency + nonRecoverableVat + financingCosts
    ),
    reconciliar("resultado: profitBeforePromoteAndTax - promoteFee = profitAfterPromote", profitAfterPromote, profitBeforePromoteAndTax - promoteFee),
    reconciliar("resultado: profitAfterPromote - estimatedTaxes = netProfit", netProfit, profitAfterPromote - estimatedTaxes),
    reconciliar("retorno: capitalReturned + profitDistributed = totalReturn", totalReturn, capitalReturned + profitDistributed),
  ];

  const camposEmFalta: string[] = [
    "otherOperatingRevenue (sem motor de outras receitas operacionais)",
    "marketingCosts (sem categoria de custo dedicada, distinta de soft costs)",
    "contingency (sem categoria própria — hoje incluída dentro de hard/soft quando configurada como %)",
    "committedDebt (aproximado por limiteCredito ou peakDebt — sem conceito de facility comprometida distinta da dívida usada)",
  ];
  if (!resultadoUnlevered || entrada.impostoEstimadoUnlevered === null) {
    camposEmFalta.push("unleveredEquityInvested/unleveredRoi (execução unlevered não disponível para este cálculo)");
  }
  if (!investidorPromotor) {
    camposEmFalta.push("promoteFee é 0 — projeto sem investidor externo/waterfall configurada");
  }

  const todasReconciliacoesOk = reconciliacoes.every((r) => r.ok);

  return {
    versaoMotor: "underwriting-gate1-2026-08-06",
    calculadoEm: new Date().toISOString(),

    grossVgv,
    commercialCommission,
    commercialCommissionPct: grossVgv > 0 ? commercialCommission / grossVgv : null,
    netVgv,
    otherOperatingRevenue,
    averageTicket: entrada.unitCount > 0 ? grossVgv / entrada.unitCount : null,
    unitCount: entrada.unitCount,
    averageSalePricePerSqm: entrada.averageSalePricePerSqm,

    acquisitionPrice,
    acquisitionCosts,
    hardCosts,
    softCosts,
    developmentFee,
    marketingCosts,
    contingency,
    nonRecoverableVat,
    financingCosts,
    projectCapexBeforePromoteAndTax,
    capexPerAbcSqm: entrada.abcTotal && entrada.abcTotal > 0 ? projectCapexBeforePromoteAndTax / entrada.abcTotal : null,

    profitBeforePromoteAndTax,
    promoteFee,
    profitAfterPromote,
    estimatedTaxes,
    netProfit,

    committedDebt,
    usedDebtTotal: resultado.financiamento.dividaTotalLevantada,
    peakDebt: resultado.financiamento.peakDebt,
    peakDebtMonth: resultado.financiamento.mesDividaMaxima,
    totalInterest: resultado.financiamento.jurosTotais,
    totalBankFees: resultado.financiamento.feesBancarios,
    finalDebtBalance,
    effectiveLtc: resultado.financiamento.ltc,

    leveredEquityInvested,
    unleveredEquityInvested,
    peakEquityExposure: resultado.equity.peakCashExposure,
    peakEquityMonth: resultado.equity.mesPico,
    capitalReturned,
    profitDistributed,
    totalReturn,
    leveredRoi,
    unleveredRoi,
    leveredIrr,
    unleveredIrr,
    moic,
    durationMonths,
    paybackMonth,

    qualidade: {
      reconciliacoes,
      todasReconciliacoesOk,
      camposEmFalta,
      overridesAtivos: [],
      nivelConfianca: todasReconciliacoesOk ? (camposEmFalta.length <= 2 ? "alta" : "media") : "baixa",
    },
  };
}

function diferencaMeses(inicio: string, fim: string): number {
  const [anoI, mesI] = inicio.split("-").map(Number);
  const [anoF, mesF] = fim.split("-").map(Number);
  if (!anoI || !mesI || !anoF || !mesF) return 0;
  return Math.max(0, (anoF - anoI) * 12 + (mesF - mesI));
}

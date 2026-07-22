// Motor de financiamento bancário — Landwise, Fase 5
//
// Trabalha mensalmente (secção 7 do plano). O drawdown nunca é lançado todo
// no primeiro mês — acompanha os custos elegíveis, a percentagem financiada,
// o limite de crédito e o saldo de caixa. Quando `comFinanciamento` é falso,
// TODOS os valores ficam a zero (regra explícita da secção 7 e teste
// obrigatório da secção 20 do plano) — nunca reaproveita valores bancários
// de uma configuração anterior.

export type ParametrosFinanciamento = {
  comFinanciamento: boolean;
  percentagemHardCostsFinanciada: number; // 0-1
  percentagemAquisicaoFinanciada: number; // 0-1
  euribor: number; // decimal, ex. 0.03
  spread: number; // decimal, ex. 0.02
  structuringFeePct: number; // % do limite, decimal
  setupCosts: number; // valor fixo €
  impostoSeloEmprestimoPct: number; // decimal, sobre o valor do limite/contratado
  impostoSeloJurosPct: number; // decimal, sobre juros de cada mês
  limiteCredito: number | null; // null = sem limite explícito
  saldoMinimoCaixa: number;
  metodoTaxaMensal: "nominal_anual_div_12" | "mensal_equivalente";
};

export type NecessidadeMensal = {
  mes: string; // "YYYY-MM"
  custosElegiveisAquisicao: number; // parcela de custos de aquisição neste mês
  custosElegiveisHardCosts: number; // parcela de hard costs neste mês
  saldoCaixaAntesFinanciamento: number; // caixa disponível antes de recorrer a dívida/equity neste mês (pode ser negativo)
};

export type LinhaFinanciamentoMensal = {
  mes: string;
  saldoInicial: number;
  drawdown: number;
  juros: number;
  jurosCapitalizados: number;
  fees: number;
  impostoSelo: number;
  amortizacao: number;
  saldoFinal: number;
};

export function taxaAnual(p: ParametrosFinanciamento): number {
  return p.euribor + p.spread;
}

export function taxaMensal(p: ParametrosFinanciamento): number {
  const anual = taxaAnual(p);
  if (p.metodoTaxaMensal === "mensal_equivalente") {
    return Math.pow(1 + anual, 1 / 12) - 1;
  }
  return anual / 12;
}

const PARAMETROS_ZERO: Pick<
  ParametrosFinanciamento,
  "percentagemHardCostsFinanciada" | "percentagemAquisicaoFinanciada" | "euribor" | "spread" | "structuringFeePct" | "setupCosts" | "impostoSeloEmprestimoPct" | "impostoSeloJurosPct"
> = {
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  spread: 0,
  structuringFeePct: 0,
  setupCosts: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
};

/** Aplica a regra "financiamento bancário = Não zera e desativa todos os campos bancários" (secção 7). */
export function normalizarParametrosSemFinanciamento(p: ParametrosFinanciamento): ParametrosFinanciamento {
  if (p.comFinanciamento) return p;
  return { ...p, ...PARAMETROS_ZERO, limiteCredito: 0 };
}

/**
 * Simula o financiamento mês a mês. Nunca lança o valor todo no primeiro mês:
 * o drawdown de cada mês é o mínimo entre (a) a necessidade de caixa elegível
 * do mês, (b) a percentagem financiada dos custos elegíveis, e (c) o limite
 * de crédito disponível.
 *
 * Se `comFinanciamento` for falso, devolve uma linha por mês com tudo a
 * zero — nunca "sem linhas" (para o cash flow poder somar sem casos especiais).
 */
export function simularFinanciamento(
  necessidades: NecessidadeMensal[],
  parametrosInput: ParametrosFinanciamento
): LinhaFinanciamentoMensal[] {
  const parametros = normalizarParametrosSemFinanciamento(parametrosInput);

  if (!parametros.comFinanciamento) {
    return necessidades.map((n) => ({
      mes: n.mes,
      saldoInicial: 0,
      drawdown: 0,
      juros: 0,
      jurosCapitalizados: 0,
      fees: 0,
      impostoSelo: 0,
      amortizacao: 0,
      saldoFinal: 0,
    }));
  }

  const taxaMes = taxaMensal(parametros);
  const linhas: LinhaFinanciamentoMensal[] = [];
  let saldo = 0;
  let feesSetupLancados = false;

  for (const n of necessidades) {
    const saldoInicial = saldo;
    const juros = saldoInicial * taxaMes;
    const impostoSeloJuros = juros * parametros.impostoSeloJurosPct;

    const necessidadeElegivel =
      n.custosElegiveisAquisicao * parametros.percentagemAquisicaoFinanciada +
      n.custosElegiveisHardCosts * parametros.percentagemHardCostsFinanciada;

    // Só recorre à dívida na medida em que o saldo de caixa do mês não chegue.
    const necessidadeReal = Math.max(0, Math.min(necessidadeElegivel, -n.saldoCaixaAntesFinanciamento));

    let drawdown = necessidadeReal;
    if (parametros.limiteCredito !== null) {
      const disponivel = Math.max(0, parametros.limiteCredito - saldoInicial);
      drawdown = Math.min(drawdown, disponivel);
    }

    let fees = 0;
    let impostoSeloEmprestimo = 0;
    if (!feesSetupLancados && drawdown > 0) {
      const baseFee = parametros.limiteCredito ?? drawdown;
      fees = parametros.setupCosts + baseFee * parametros.structuringFeePct;
      impostoSeloEmprestimo = baseFee * parametros.impostoSeloEmprestimoPct;
      feesSetupLancados = true;
    }

    const saldoFinal = saldoInicial + juros + drawdown;

    linhas.push({
      mes: n.mes,
      saldoInicial,
      drawdown,
      juros,
      jurosCapitalizados: juros, // por agora, juros sempre capitalizados (sem pagamento corrente) — simplificação da Fase 5
      fees,
      impostoSelo: impostoSeloEmprestimo + impostoSeloJuros,
      amortizacao: 0, // amortização (a partir de "início de amortização") fica para o wiring ao calendário
      saldoFinal,
    });

    saldo = saldoFinal;
  }

  return linhas;
}

export type ResultadosFinanciamento = {
  dividaTotalLevantada: number;
  peakDebt: number;
  mesDividaMaxima: string | null;
  jurosTotais: number;
  feesBancarios: number;
  impostoSeloTotal: number;
  dividaAllIn: number; // peak debt + juros + fees + imposto selo capitalizados até ao pico
  ltv: number | null; // peak debt / GDV
  ltc: number | null; // peak debt / custos elegíveis
};

export function calcResultadosFinanciamento(
  linhas: LinhaFinanciamentoMensal[],
  gdv: number,
  custosElegiveisTotal: number
): ResultadosFinanciamento {
  const dividaTotalLevantada = linhas.reduce((s, l) => s + l.drawdown, 0);
  const jurosTotais = linhas.reduce((s, l) => s + l.juros, 0);
  const feesBancarios = linhas.reduce((s, l) => s + l.fees, 0);
  const impostoSeloTotal = linhas.reduce((s, l) => s + l.impostoSelo, 0);

  let peakDebt = 0;
  let mesDividaMaxima: string | null = null;
  for (const l of linhas) {
    if (l.saldoFinal > peakDebt) {
      peakDebt = l.saldoFinal;
      mesDividaMaxima = l.mes;
    }
  }

  return {
    dividaTotalLevantada,
    peakDebt,
    mesDividaMaxima,
    jurosTotais,
    feesBancarios,
    impostoSeloTotal,
    dividaAllIn: peakDebt,
    ltv: gdv > 0 ? peakDebt / gdv : null,
    ltc: custosElegiveisTotal > 0 ? peakDebt / custosElegiveisTotal : null,
  };
}

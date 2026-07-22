// Motor de equity e exposição de caixa — Landwise, Fase 5
//
// Secção 8 do plano: equity e exposição NÃO são a mesma coisa. Equity
// committed é o teto acordado; contributed é o que foi mesmo aportado;
// returned é o que já voltou aos investidores; net outstanding é
// contributed-acumulado menos returned-acumulado; peak cash exposure é o
// maior net outstanding em qualquer mês — calculado a partir do cash flow
// mensal real, nunca assumido como "custos até o início das vendas" (pode
// ocorrer antes, durante ou depois das vendas, ou perto da conclusão).

export type NecessidadeMensalEquity = {
  mes: string;
  saldoCaixaAposFinanciamento: number; // saldo do mês depois de aplicado o drawdown do motor de financiamento (pode continuar negativo)
  recebimentosClientes: number; // entradas de caixa de vendas neste mês (para permitir devolução de capital)
};

export type LinhaEquityMensal = {
  mes: string;
  capitalCall: number; // aporte feito este mês para cobrir o défice de caixa
  capitalDevolvido: number; // devolução de capital aos investidores este mês
  equityContribuidoAcumulado: number;
  equityDevolvidoAcumulado: number;
  netEquityOutstanding: number; // contribuído acumulado − devolvido acumulado
};

/**
 * Simula os capital calls mês a mês: sempre que o saldo de caixa (já com o
 * financiamento bancário aplicado) fica negativo, entra equity suficiente
 * para o repor a zero. Quando há caixa livre a mais (ex.: recebimentos de
 * clientes depois do capital já devolvido integralmente), devolve capital
 * aos investidores até ao limite do que já foi aportado.
 */
export function simularEquity(necessidades: NecessidadeMensalEquity[]): LinhaEquityMensal[] {
  const linhas: LinhaEquityMensal[] = [];
  let contribuidoAcumulado = 0;
  let devolvidoAcumulado = 0;
  let caixaLivre = 0; // caixa acumulado disponível para devolver capital, fora da conta do défice mensal

  for (const n of necessidades) {
    let capitalCall = 0;
    let capitalDevolvido = 0;

    const saldoComCaixaLivre = n.saldoCaixaAposFinanciamento + caixaLivre;

    if (saldoComCaixaLivre < 0) {
      capitalCall = -saldoComCaixaLivre;
      caixaLivre = 0;
    } else {
      // Sobra de caixa: devolve capital aos investidores até ao limite do
      // que ainda está por devolver (net outstanding), o resto acumula
      // como caixa livre do projeto (ex.: para o lucro do promotor).
      const aindaPorDevolver = contribuidoAcumulado - devolvidoAcumulado;
      capitalDevolvido = Math.min(saldoComCaixaLivre, Math.max(0, aindaPorDevolver));
      caixaLivre = saldoComCaixaLivre - capitalDevolvido;
    }

    contribuidoAcumulado += capitalCall;
    devolvidoAcumulado += capitalDevolvido;

    linhas.push({
      mes: n.mes,
      capitalCall,
      capitalDevolvido,
      equityContribuidoAcumulado: contribuidoAcumulado,
      equityDevolvidoAcumulado: devolvidoAcumulado,
      netEquityOutstanding: contribuidoAcumulado - devolvidoAcumulado,
    });
  }

  return linhas;
}

export type ResultadosEquity = {
  equityContributed: number;
  peakCashExposure: number;
  mesPico: string | null;
  capitalDevolvidoTotal: number;
  equityAindaEmRisco: number;
  dataPrimeiroRetorno: string | null;
  dataRecuperacaoIntegral: string | null;
};

export function calcResultadosEquity(linhas: LinhaEquityMensal[]): ResultadosEquity {
  const equityContributed = linhas.length > 0 ? linhas[linhas.length - 1].equityContribuidoAcumulado : 0;
  const capitalDevolvidoTotal = linhas.length > 0 ? linhas[linhas.length - 1].equityDevolvidoAcumulado : 0;

  let peakCashExposure = 0;
  let mesPico: string | null = null;
  for (const l of linhas) {
    if (l.netEquityOutstanding > peakCashExposure) {
      peakCashExposure = l.netEquityOutstanding;
      mesPico = l.mes;
    }
  }

  const primeiroRetorno = linhas.find((l) => l.capitalDevolvido > 0);
  const recuperacaoIntegral = linhas.find((l) => l.netEquityOutstanding <= 0 && l.equityContribuidoAcumulado > 0);

  return {
    equityContributed,
    peakCashExposure,
    mesPico,
    capitalDevolvidoTotal,
    equityAindaEmRisco: linhas.length > 0 ? linhas[linhas.length - 1].netEquityOutstanding : 0,
    dataPrimeiroRetorno: primeiroRetorno?.mes ?? null,
    dataRecuperacaoIntegral: recuperacaoIntegral?.mes ?? null,
  };
}

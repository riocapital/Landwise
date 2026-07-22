// Motor de waterfall (hurdles e promote) — Landwise, Fase 5 (parte 2)
//
// Secção 9 do plano. Ordem obrigatória:
//   1) Capital calls (registados no histórico do investidor, fora desta função)
//   2) Devolução do capital
//   3) Retorno preferencial (100% investidor até ao 1.º hurdle)
//   4) Distribuição até o 1.º hurdle
//   5) Promote sobre o INCREMENTO do respetivo tier (nunca sobre o lucro todo)
//   6) Próximo hurdle
//   7) Promote final apenas acima do último hurdle
//
// Usa XIRR com datas reais (xirr.ts) e um solver por bisseção para apurar,
// em cada tier, exatamente quanto distribuir até a IRR do investidor
// atingir o hurdle — nunca aplica a percentagem final de promote sobre
// todo o lucro. Nunca distribui mais caixa do que a disponível no mês.

import { calcXIRR, type FluxoDatado } from "./xirr";

/** Um nível de hurdle: ao ultrapassar `hurdleIRR`, a distribuição adicional
 * (até ao próximo hurdle, ou indefinidamente se for o último) é repartida
 * com `promotePctAcima` para o promotor. */
export type NivelHurdle = { hurdleIRR: number; promotePctAcima: number };

export type MesDisponivelParaDistribuicao = {
  mes: string;
  data: string; // "YYYY-MM-DD", usado no cálculo de XIRR
  capitalCallDoMes: number; // aporte do investidor este mês (0 se não houver)
  disponivelParaDistribuir: number; // caixa livre este mês, já sem custos/dívida — nunca negativo
};

export type LinhaCascataMensal = {
  mes: string;
  devolucaoCapital: number;
  distribuidoInvestidor: number; // acima da devolução de capital (retorno preferencial + parte dos tiers)
  distribuidoPromotor: number; // promote
};

/**
 * Encontra o valor bruto G (0 ≤ G ≤ maxDisponivel) tal que, distribuindo
 * G × fatorInvestidor ao investidor nesta data, a XIRR acumulada do
 * investidor atinge exatamente `hurdleAnual`. Usa bisseção porque a IRR é
 * monótona crescente no valor recebido, para uma data fixa.
 */
function encontrarValorParaHurdle(
  historicoInvestidor: FluxoDatado[],
  data: string,
  hurdleAnual: number,
  fatorInvestidor: number,
  maxDisponivel: number
): number {
  if (maxDisponivel <= 0) return 0;
  if (fatorInvestidor <= 0) return maxDisponivel; // investidor não recebe nada neste tier — nunca vai atingir o hurdle, consome-se o tier todo

  const irrAtual = calcXIRR(historicoInvestidor);
  if (irrAtual !== null && irrAtual >= hurdleAnual) return 0; // já está acima do hurdle, nada mais necessário nesta fase

  const irrComTudo = calcXIRR([...historicoInvestidor, { data, valor: maxDisponivel * fatorInvestidor }]);
  if (irrComTudo === null || irrComTudo < hurdleAnual) return maxDisponivel; // mesmo com tudo, não chega ao hurdle este mês

  let baixo = 0;
  let alto = maxDisponivel;
  for (let i = 0; i < 60; i++) {
    const meio = (baixo + alto) / 2;
    const irr = calcXIRR([...historicoInvestidor, { data, valor: meio * fatorInvestidor }]);
    if (irr === null || irr < hurdleAnual) {
      baixo = meio;
    } else {
      alto = meio;
    }
  }
  return (baixo + alto) / 2;
}

/**
 * Distribui a cascata mês a mês. Nunca distribui mais do que
 * `disponivelParaDistribuir` em cada mês, e nunca aplica a percentagem
 * final de promote sobre todo o lucro — só sobre o incremento de cada tier.
 */
export function distribuirCascata(
  meses: MesDisponivelParaDistribuicao[],
  hurdles: NivelHurdle[]
): { linhas: LinhaCascataMensal[]; historicoInvestidor: FluxoDatado[] } {
  const historicoInvestidor: FluxoDatado[] = [];
  let capitalContribuidoAcumulado = 0;
  let capitalDevolvidoAcumulado = 0;
  const linhas: LinhaCascataMensal[] = [];

  for (const m of meses) {
    if (m.capitalCallDoMes > 0) {
      historicoInvestidor.push({ data: m.data, valor: -m.capitalCallDoMes });
      capitalContribuidoAcumulado += m.capitalCallDoMes;
    }

    let restante = Math.max(0, m.disponivelParaDistribuir);
    let devolucaoCapital = 0;
    let distribuidoInvestidor = 0;
    let distribuidoPromotor = 0;

    // 1) Devolução de capital — nunca mais do que ainda está em falta.
    const capitalEmFalta = capitalContribuidoAcumulado - capitalDevolvidoAcumulado;
    if (restante > 0 && capitalEmFalta > 0) {
      devolucaoCapital = Math.min(restante, capitalEmFalta);
      restante -= devolucaoCapital;
      capitalDevolvidoAcumulado += devolucaoCapital;
      historicoInvestidor.push({ data: m.data, valor: devolucaoCapital });
    }

    // 2) Tiers de hurdle, na ordem, cada um só até ao seu próprio limite.
    for (let i = 0; i < hurdles.length && restante > 0.01; i++) {
      const hurdle = hurdles[i];
      const fatorInvestidorNesteTier = i === 0 ? 1 : 1 - hurdles[i - 1].promotePctAcima;
      const G = encontrarValorParaHurdle(historicoInvestidor, m.data, hurdle.hurdleIRR, fatorInvestidorNesteTier, restante);

      if (G > 0) {
        const paraInvestidor = G * fatorInvestidorNesteTier;
        const paraPromotor = G - paraInvestidor;
        distribuidoInvestidor += paraInvestidor;
        distribuidoPromotor += paraPromotor;
        if (paraInvestidor > 0) historicoInvestidor.push({ data: m.data, valor: paraInvestidor });
        restante -= G;
      }
    }

    // 3) Acima do último hurdle: resto ao fator do último tier, indefinidamente.
    if (restante > 0.01) {
      const fatorInvestidorFinal = hurdles.length > 0 ? 1 - hurdles[hurdles.length - 1].promotePctAcima : 1;
      const paraInvestidor = restante * fatorInvestidorFinal;
      const paraPromotor = restante - paraInvestidor;
      distribuidoInvestidor += paraInvestidor;
      distribuidoPromotor += paraPromotor;
      if (paraInvestidor > 0) historicoInvestidor.push({ data: m.data, valor: paraInvestidor });
    }

    linhas.push({ mes: m.mes, devolucaoCapital, distribuidoInvestidor, distribuidoPromotor });
  }

  return { linhas, historicoInvestidor };
}

export type ResultadoInvestidor = {
  equityContributed: number;
  distribuicoesTotais: number; // devolução de capital + retorno + promote-share do investidor
  lucro: number;
  moic: number;
  irr: number | null;
};

export function calcResultadoInvestidor(
  linhas: LinhaCascataMensal[],
  historicoInvestidor: FluxoDatado[]
): ResultadoInvestidor {
  const equityContributed = -historicoInvestidor.filter((f) => f.valor < 0).reduce((s, f) => s + f.valor, 0);
  const distribuicoesTotais = linhas.reduce((s, l) => s + l.devolucaoCapital + l.distribuidoInvestidor, 0);
  return {
    equityContributed,
    distribuicoesTotais,
    lucro: distribuicoesTotais - equityContributed,
    moic: equityContributed > 0 ? distribuicoesTotais / equityContributed : 0,
    irr: calcXIRR(historicoInvestidor),
  };
}

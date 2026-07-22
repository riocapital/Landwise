// Motor de estrutura de capital — Landwise, Fase 5 (parte 3)
//
// Secção 9 do plano. Pergunta inicial: "Este projeto possui investidores
// externos?" — se não, mostra só equity do promotor, capital calls, peak
// cash exposure, retorno do promotor, fees aplicáveis e resultado do
// projeto, SEM waterfall avançada. Se sim, abre a estrutura completa.
//
// Nunca mistura fees, devolução de capital, retorno sobre capital e
// promote — cada resultado (investidor/promotor) separa estas quatro
// componentes explicitamente.

import type { NivelHurdle, LinhaCascataMensal } from "./waterfall";
import { calcXIRR, type FluxoDatado } from "./xirr";

export type ModeloCapital =
  | "promotor_sozinho"
  | "joint_venture_simples"
  | "family_office_sem_fees"
  | "family_office_com_fees"
  | "personalizado";

export type ParametrosEstruturaCapital = {
  temInvestidorExterno: boolean;
  modelo: ModeloCapital;
  percentagemInvestidor: number; // 0-1, fração do equity total que é do investidor externo
  hurdles: NivelHurdle[];
};

/**
 * Modelos iniciais (secção 9 do plano) — todos editáveis depois de
 * aplicados. "personalizado" devolve um ponto de partida neutro (sem
 * hurdles, 100% investidor externo) para o utilizador configurar à mão.
 */
export function obterModeloPreset(modelo: ModeloCapital): ParametrosEstruturaCapital {
  switch (modelo) {
    case "promotor_sozinho":
      return { temInvestidorExterno: false, modelo, percentagemInvestidor: 0, hurdles: [] };
    case "joint_venture_simples":
      return {
        temInvestidorExterno: true,
        modelo,
        percentagemInvestidor: 0.8,
        hurdles: [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }],
      };
    case "family_office_sem_fees":
      return {
        temInvestidorExterno: true,
        modelo,
        percentagemInvestidor: 0.9,
        hurdles: [{ hurdleIRR: 0.08, promotePctAcima: 0.15 }],
      };
    case "family_office_com_fees":
      return {
        temInvestidorExterno: true,
        modelo,
        percentagemInvestidor: 0.85,
        hurdles: [
          { hurdleIRR: 0.08, promotePctAcima: 0.2 },
          { hurdleIRR: 0.15, promotePctAcima: 0.3 },
        ],
      };
    case "personalizado":
    default:
      return { temInvestidorExterno: true, modelo: "personalizado", percentagemInvestidor: 1, hurdles: [] };
  }
}

export type RepartoMensal = {
  mes: string;
  investidorExterno: number; // parte do capital+tier LP que cabe ao investidor externo
  promotorCoInvestimento: number; // parte do capital+tier LP que cabe ao co-investimento do promotor
  promotorPromote: number; // promote (GP) — nunca misturado com o co-investimento
};

/**
 * Reparte cada linha da cascata (devolução de capital + parte LP dos
 * tiers) entre o investidor externo e o co-investimento do promotor,
 * proporcionalmente à percentagem de participação de cada um. O promote
 * (compensação do GP) nunca é repartido — é sempre 100% do promotor.
 */
export function repartirPorParticipacao(linhas: LinhaCascataMensal[], percentagemInvestidor: number): RepartoMensal[] {
  return linhas.map((l) => {
    const poolLp = l.devolucaoCapital + l.distribuidoInvestidor;
    return {
      mes: l.mes,
      investidorExterno: poolLp * percentagemInvestidor,
      promotorCoInvestimento: poolLp * (1 - percentagemInvestidor),
      promotorPromote: l.distribuidoPromotor,
    };
  });
}

export type ResultadoInvestidorExterno = {
  equityContributed: number;
  capitalDevolvido: number;
  distribuicoesTotais: number;
  lucro: number;
  moic: number;
  irr: number | null;
};

export type ResultadoPromotor = {
  coInvestimentoContribuido: number;
  retornoCoInvestimento: number;
  fees: number;
  promote: number;
  lucroTotal: number; // retornoCoInvestimento - coInvestimentoContribuido + fees + promote
  moicCoInvestimento: number;
};

/**
 * Calcula o resultado do investidor externo separando explicitamente
 * devolução de capital de retorno sobre capital (nunca misturados).
 */
export function calcResultadoInvestidorExterno(
  reparto: RepartoMensal[],
  fluxosCapitalCall: FluxoDatado[], // fluxos negativos na data de cada capital call (já multiplicados pela % do investidor)
  datas: string[]
): ResultadoInvestidorExterno {
  const equityContributed = -fluxosCapitalCall.filter((f) => f.valor < 0).reduce((s, f) => s + f.valor, 0);
  const capitalDevolvido = Math.min(equityContributed, reparto.reduce((s, r) => s + r.investidorExterno, 0));
  const distribuicoesTotais = reparto.reduce((s, r) => s + r.investidorExterno, 0);

  const historico: FluxoDatado[] = [
    ...fluxosCapitalCall,
    ...reparto.map((r, i) => ({ data: datas[i], valor: r.investidorExterno })).filter((f) => f.valor > 0),
  ];

  return {
    equityContributed,
    capitalDevolvido,
    distribuicoesTotais,
    lucro: distribuicoesTotais - equityContributed,
    moic: equityContributed > 0 ? distribuicoesTotais / equityContributed : 0,
    irr: calcXIRR(historico),
  };
}

/**
 * Calcula o resultado do promotor, separando SEMPRE: retorno do
 * co-investimento, fees, e promote — nunca somados sem discriminação
 * (secção 9 do plano).
 */
export function calcResultadoPromotor(reparto: RepartoMensal[], coInvestimentoContribuido: number, feesTotais: number): ResultadoPromotor {
  const retornoCoInvestimento = reparto.reduce((s, r) => s + r.promotorCoInvestimento, 0);
  const promote = reparto.reduce((s, r) => s + r.promotorPromote, 0);

  return {
    coInvestimentoContribuido,
    retornoCoInvestimento,
    fees: feesTotais,
    promote,
    lucroTotal: retornoCoInvestimento - coInvestimentoContribuido + feesTotais + promote,
    moicCoInvestimento: coInvestimentoContribuido > 0 ? retornoCoInvestimento / coInvestimentoContribuido : 0,
  };
}

// Motor de sensibilidades — Landwise, Fase 8 (parte 1)
//
// Secção 14 do plano: 3 matrizes obrigatórias, variações de -10% a +10%.
// A célula 0%×0% tem de ser EXATAMENTE igual ao cenário-base. Cada célula
// recalcula o modelo completo através do mesmo motor de cash flow
// (cashflow.ts) — nunca aplica só uma percentagem ao resultado final
// (secção 19: um único motor, partilhado por tudo).

import { calcularCashFlow, type PremissasCashFlow, type ResultadoCashFlow } from "./cashflow";
import { gerarRecebimentosMensais, type PlanoVendas } from "./vendas";
import { calcXIRR, type FluxoDatado } from "./xirr";
import type { LinhaCusto, GrupoCusto } from "./custos";

export const VARIACOES_SENSIBILIDADE = [-0.1, -0.05, 0, 0.05, 0.1] as const;

export type EixoSensibilidade = "aquisicao" | "custo_construcao" | "preco_venda";

export type MatrizSensibilidade = "aquisicao_vs_custo_construcao" | "custo_construcao_vs_preco_venda" | "aquisicao_vs_preco_venda";

export const EIXOS_POR_MATRIZ: Record<MatrizSensibilidade, [EixoSensibilidade, EixoSensibilidade]> = {
  aquisicao_vs_custo_construcao: ["aquisicao", "custo_construcao"],
  custo_construcao_vs_preco_venda: ["custo_construcao", "preco_venda"],
  aquisicao_vs_preco_venda: ["aquisicao", "preco_venda"],
};

export type IndicadorSensibilidade =
  | "irr_unlevered"
  | "irr_levered"
  | "moic"
  | "roe"
  | "lucro"
  | "margem"
  | "equity_contributed"
  | "peak_cash_exposure"
  | "peak_debt";

export type PremissasBaseSensibilidade = {
  linhasCusto: LinhaCusto[];
  contextoCusto: PremissasCashFlow["contextoCusto"];
  receitaTotalGdvBase: number;
  planoVendas: PlanoVendas;
  parametrosFinanciamento: PremissasCashFlow["parametrosFinanciamento"];
};

function aplicarVariacaoAoGrupo(linhasCusto: LinhaCusto[], grupo: GrupoCusto, delta: number): LinhaCusto[] {
  if (delta === 0) return linhasCusto;
  return linhasCusto.map((l) => (l.grupo === grupo ? { ...l, valorInput: l.valorInput * (1 + delta) } : l));
}

/**
 * Recalcula o modelo completo (custos → recebimentos → financiamento →
 * equity → cash flow) para uma combinação de variações — nunca aplica
 * a percentagem só ao resultado final.
 */
export function calcularCenarioComVariacoes(
  base: PremissasBaseSensibilidade,
  deltaAquisicao: number,
  deltaConstrucao: number,
  deltaPreco: number
): ResultadoCashFlow {
  let linhas = aplicarVariacaoAoGrupo(base.linhasCusto, "aquisicao", deltaAquisicao);
  linhas = aplicarVariacaoAoGrupo(linhas, "hard_cost", deltaConstrucao);

  const receitaAjustada = base.receitaTotalGdvBase * (1 + deltaPreco);
  const { linhas: recebimentos } = gerarRecebimentosMensais(receitaAjustada, base.planoVendas);

  return calcularCashFlow({
    linhasCusto: linhas,
    contextoCusto: base.contextoCusto,
    recebimentos,
    parametrosFinanciamento: base.parametrosFinanciamento,
    saldoMinimoCaixa: 0,
  });
}

/**
 * Extrai o indicador pedido de um resultado de cash flow já calculado.
 *
 * IRR/MOIC/ROE "do investidor"/"do promotor" — quando não há investidor
 * externo (caso mais comum, secção 9 do plano) — coincidem com o IRR/MOIC
 * levered do projeto, porque todo o lucro é do promotor. Com investidor
 * externo e waterfall ativa, estes indicadores exigem ligar
 * distribuirCascata (waterfall.ts) ao ledger mensal — integração ainda por
 * fazer; por agora o motor documenta esta limitação em vez de aproximar
 * silenciosamente.
 */
export function extrairIndicador(resultado: ResultadoCashFlow, indicador: IndicadorSensibilidade): number | null {
  const datasBase = resultado.linhas.map((l) => `${l.mes}-01`);
  const fluxosUnlevered: FluxoDatado[] = resultado.linhas.map((l, i) => ({ data: datasBase[i], valor: l.cashFlowUnlevered }));
  const fluxosLevered: FluxoDatado[] = resultado.linhas.map((l, i) => ({ data: datasBase[i], valor: l.cashFlowLevered }));

  const equityContributed = resultado.equity.equityContributed;

  switch (indicador) {
    case "irr_unlevered":
      return calcXIRR(fluxosUnlevered);
    case "irr_levered":
      return calcXIRR(fluxosLevered);
    case "moic":
      return equityContributed > 0 ? (equityContributed + resultado.lucroLevered) / equityContributed : null;
    case "roe":
      return equityContributed > 0 ? resultado.lucroLevered / equityContributed : null;
    case "lucro":
      return resultado.lucroLevered;
    case "margem":
      return resultado.margem;
    case "equity_contributed":
      return equityContributed;
    case "peak_cash_exposure":
      return resultado.equity.peakCashExposure;
    case "peak_debt":
      return resultado.financiamento.peakDebt;
    default:
      return null;
  }
}

export type CelulaSensibilidade = {
  variacaoLinha: number;
  variacaoColuna: number;
  valor: number | null;
  // dados adicionais para o tooltip (secção 14 do plano)
  gdv: number;
  custoTotal: number;
  lucro: number;
  margem: number;
};

export type MatrizResultado = {
  matriz: MatrizSensibilidade;
  indicador: IndicadorSensibilidade;
  celulas: CelulaSensibilidade[][]; // [linha][coluna], na ordem de VARIACOES_SENSIBILIDADE
};

/**
 * Calcula uma matriz de sensibilidade completa (5×5). A célula central
 * (índice 2,2 = 0%×0%) é sempre exatamente o cenário-base.
 */
export function calcularMatrizSensibilidade(
  base: PremissasBaseSensibilidade,
  matriz: MatrizSensibilidade,
  indicador: IndicadorSensibilidade
): MatrizResultado {
  const [eixoLinha, eixoColuna] = EIXOS_POR_MATRIZ[matriz];

  const celulas: CelulaSensibilidade[][] = VARIACOES_SENSIBILIDADE.map((variacaoLinha) =>
    VARIACOES_SENSIBILIDADE.map((variacaoColuna) => {
      const deltas = { aquisicao: 0, construcao: 0, preco: 0 };

      const aplicar = (eixo: EixoSensibilidade, valor: number) => {
        if (eixo === "aquisicao") deltas.aquisicao = valor;
        else if (eixo === "custo_construcao") deltas.construcao = valor;
        else deltas.preco = valor;
      };
      aplicar(eixoLinha, variacaoLinha);
      aplicar(eixoColuna, variacaoColuna);

      const resultado = calcularCenarioComVariacoes(base, deltas.aquisicao, deltas.construcao, deltas.preco);
      const valor = extrairIndicador(resultado, indicador);

      return {
        variacaoLinha,
        variacaoColuna,
        valor,
        gdv: resultado.gdv,
        custoTotal: resultado.custoTotal,
        lucro: resultado.lucroLevered,
        margem: resultado.margem,
      };
    })
  );

  return { matriz, indicador, celulas };
}

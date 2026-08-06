// Motor de sensibilidades — Landwise, Fase 8 (parte 1)
//
// Secção 14 do plano: 3 matrizes obrigatórias, variações de -10% a +10%.
// A célula 0%×0% tem de ser EXATAMENTE igual ao cenário-base. Cada célula
// recalcula o modelo completo através do mesmo motor de cash flow
// (cashflow.ts) — nunca aplica só uma percentagem ao resultado final
// (secção 19: um único motor, partilhado por tudo).

import { calcularCashFlow, type PremissasCashFlow, type ResultadoCashFlow } from "./cashflow";
import { gerarRecebimentosMensais, gerarRecebimentosDaSalesTable, type PlanoVendas } from "./vendas";
import { gerarComissaoMensal, type ParametrosComissao } from "./sales-commission";
import { calcXIRR, type FluxoDatado } from "./xirr";
import { resolverCustos, calcCustosAquisicaoAcessorios, type LinhaCusto, type GrupoCusto } from "./custos";
import type { LinhaSalesTableResolvida } from "./sales-table";
import type { Typology } from "./areas";
import { feesParaLinhasCusto, type Fee, type DatasProjetoParaFees } from "./fees";
import { calcularResultadosComWaterfall, type ResultadosInvestidorPromotor } from "./estrutura-capital";
import type { NivelHurdle } from "./waterfall";
import { calcularImpostoEstimadoDoResultado, type ParametrosImpostoEstimado } from "./impostos";
import { montarUnderwritingResult, type ProjectUnderwritingResult } from "./underwriting";

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
  | "roi"
  | "roi_nao_alavancado"
  | "lucro"
  | "lucro_liquido"
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
  // Quando presentes, a receita (e a comissão) seguem a Sales Table real —
  // nunca a aproximação agregada — exatamente como o cash flow principal
  // (secção 19: um único motor, nunca dois cálculos divergentes para o
  // mesmo indicador). Sem estes dados, mantém o modo agregado por
  // compatibilidade com projetos ainda sem Sales Table gerada.
  salesTableResolvida?: LinhaSalesTableResolvida[];
  tipologias?: Typology[];
  comissaoParametros?: ParametrosComissao;
};

function aplicarVariacaoAoGrupo(linhasCusto: LinhaCusto[], grupo: GrupoCusto, delta: number): LinhaCusto[] {
  if (delta === 0) return linhasCusto;
  return linhasCusto.map((l) => (l.grupo === grupo ? { ...l, valorInput: l.valorInput * (1 + delta) } : l));
}

/**
 * Aplica as três variações aos custos/recebimentos, sem correr nenhum
 * motor ainda — usado por calcularCenarioComVariacoes (só cash flow) e por
 * calcularCenarioCompletoComVariacoes (Gate 7: pipeline completo). Nunca
 * duas implementações da mesma lógica de variação.
 */
function prepararCenario(
  base: PremissasBaseSensibilidade,
  deltaAquisicao: number,
  deltaConstrucao: number,
  deltaPreco: number
): { linhasCusto: LinhaCusto[]; recebimentos: ReturnType<typeof gerarRecebimentosMensais>["linhas"]; comissaoPorMes: Map<string, number> | undefined } {
  let linhas = aplicarVariacaoAoGrupo(base.linhasCusto, "aquisicao", deltaAquisicao);
  linhas = aplicarVariacaoAoGrupo(linhas, "hard_cost", deltaConstrucao);

  let recebimentos;
  let comissaoPorMes: Map<string, number> | undefined;

  if (base.salesTableResolvida && base.salesTableResolvida.length > 0 && base.tipologias) {
    // Preço ajustado por unidade — nunca uma média escalada; cada unidade
    // mantém a sua própria data (real ou projetada), só o valor muda.
    const unidadesAjustadas: LinhaSalesTableResolvida[] = base.salesTableResolvida.map((u) => ({
      ...u,
      precoFinal: u.precoFinal * (1 + deltaPreco),
    }));
    ({ linhas: recebimentos } = gerarRecebimentosDaSalesTable(unidadesAjustadas, base.tipologias, base.planoVendas));
    if (base.comissaoParametros) {
      const { linhas: linhasComissao } = gerarComissaoMensal(
        unidadesAjustadas,
        base.tipologias,
        base.planoVendas.dataLancamentoComercial,
        base.planoVendas.dataEscritura,
        base.comissaoParametros
      );
      comissaoPorMes = new Map(linhasComissao.map((l) => [l.mes, l.total]));
    }
  } else {
    // Sem Sales Table ainda (ex.: início do preenchimento do projeto) —
    // aproximação agregada, a mesma usada pelo cash flow principal nesse
    // mesmo cenário (cashflow.ts também recorre a isto quando não há
    // unidades geradas).
    const receitaAjustada = base.receitaTotalGdvBase * (1 + deltaPreco);
    ({ linhas: recebimentos } = gerarRecebimentosMensais(receitaAjustada, base.planoVendas));
  }

  return { linhasCusto: linhas, recebimentos, comissaoPorMes };
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
  const { linhasCusto, recebimentos, comissaoPorMes } = prepararCenario(base, deltaAquisicao, deltaConstrucao, deltaPreco);

  return calcularCashFlow({
    linhasCusto,
    contextoCusto: base.contextoCusto,
    recebimentos,
    comissaoPorMes,
    parametrosFinanciamento: base.parametrosFinanciamento,
    saldoMinimoCaixa: base.parametrosFinanciamento.saldoMinimoCaixa,
  });
}

/**
 * Contexto adicional (Gate 7 do prompt 03_08) para que cada célula da
 * matriz possa executar a função central COMPLETA — development fee,
 * financiamento, promote, impostos, equity e retorno — nunca só
 * cashflow.ts isolado. A célula-base (0%×0%) fica assim genuinamente
 * idêntica ao que o dashboard mostra (underwriting.ts), porque usa
 * exatamente os mesmos passos de project-loader.ts, só que recalculados
 * por variação.
 */
export type PremissasCompletaSensibilidade = PremissasBaseSensibilidade & {
  fees: Fee[];
  datasProjetoParaFees: DatasProjetoParaFees;
  temInvestidorExterno: boolean;
  percentagemInvestidor: number;
  hurdles: NivelHurdle[];
  catchUpPct: number;
  impostos: ParametrosImpostoEstimado;
  acquisitionPrice: number;
  acquisitionCosts: number;
  abcTotal: number | null;
  averageSalePricePerSqm: number | null;
  unitCount: number;
  committedDebtLimite: number | null;
};

/**
 * Versão completa de calcularCenarioComVariacoes (Gate 7): além do cash
 * flow, calendariza fees, corre o cenário não alavancado, a waterfall
 * (quando há investidor externo) e o imposto estimado — exatamente os
 * mesmos passos e as mesmas funções que project-loader.ts usa para
 * montar o underwriting do dashboard. Nunca uma segunda fórmula.
 */
export function calcularCenarioCompletoComVariacoes(
  base: PremissasCompletaSensibilidade,
  deltaAquisicao: number,
  deltaConstrucao: number,
  deltaPreco: number
): ProjectUnderwritingResult {
  const { linhasCusto, recebimentos, comissaoPorMes } = prepararCenario(base, deltaAquisicao, deltaConstrucao, deltaPreco);

  const linhasCustoResolvidas = resolverCustos(linhasCusto, base.contextoCusto);
  const linhasCustoResolvidasComData = linhasCustoResolvidas.filter((l) => l.dataInicial && l.dataFinal);
  const custosAquisicaoAuxiliares = calcCustosAquisicaoAcessorios(linhasCustoResolvidasComData);
  const somaGrupoComData = (grupo: LinhaCusto["grupo"]) =>
    linhasCustoResolvidasComData.filter((l) => l.grupo === grupo).reduce((s, l) => s + l.valorResolvido, 0);
  const hardCostsTotal = somaGrupoComData("hard_cost");
  const softCostsTotal = somaGrupoComData("soft_cost") + somaGrupoComData("outro");
  const capexAntesDoProprioFee = base.contextoCusto.valorAquisicao + custosAquisicaoAuxiliares + hardCostsTotal + softCostsTotal;

  const vgvBruto = recebimentos.reduce((s, l) => s + l.total, 0);
  const comissaoComercialAntecipada = comissaoPorMes ? [...comissaoPorMes.values()].reduce((s, v) => s + v, 0) : 0;
  const contextoFees = {
    valorAquisicao: base.contextoCusto.valorAquisicao,
    hardCostsTotal,
    capexTotal: capexAntesDoProprioFee,
    custoTotal: capexAntesDoProprioFee,
    vgvBruto,
    vgvLiquido: vgvBruto - comissaoComercialAntecipada,
    abcTotal: base.abcTotal ?? 0,
    numeroUnidades: base.unitCount,
  };
  const feesComoLinhasCusto = feesParaLinhasCusto(base.fees, contextoFees, base.datasProjetoParaFees);
  const linhasCustoComFees = [...linhasCusto, ...feesComoLinhasCusto];

  const resultado = calcularCashFlow({
    linhasCusto: linhasCustoComFees,
    contextoCusto: base.contextoCusto,
    recebimentos,
    comissaoPorMes,
    parametrosFinanciamento: base.parametrosFinanciamento,
    saldoMinimoCaixa: base.parametrosFinanciamento.saldoMinimoCaixa,
  });
  const feesTotais = resultado.feesOperacionaisTotal;

  const resultadoUnlevered = calcularCashFlow({
    linhasCusto: linhasCustoComFees,
    contextoCusto: base.contextoCusto,
    recebimentos,
    comissaoPorMes,
    parametrosFinanciamento: { ...base.parametrosFinanciamento, comFinanciamento: false },
    saldoMinimoCaixa: base.parametrosFinanciamento.saldoMinimoCaixa,
  });

  let investidorPromotor: ResultadosInvestidorPromotor | null = null;
  if (base.temInvestidorExterno) {
    investidorPromotor = calcularResultadosComWaterfall(resultado.linhas, base.hurdles, base.percentagemInvestidor, feesTotais, base.catchUpPct);
  }

  const impostoEstimadoLevered = calcularImpostoEstimadoDoResultado(resultado, base.impostos);
  const impostoEstimadoUnlevered = calcularImpostoEstimadoDoResultado(resultadoUnlevered, base.impostos);

  const primeiraSaidaCapital = resultado.linhas[0]?.mes ?? null;
  const ultimaEntradaCapitalOuRetorno = resultado.equity.dataRecuperacaoIntegral ?? resultado.linhas[resultado.linhas.length - 1]?.mes ?? null;

  return montarUnderwritingResult({
    resultado,
    resultadoUnlevered,
    investidorPromotor,
    feesTotais,
    impostoEstimadoLevered,
    impostoEstimadoUnlevered,
    acquisitionPrice: base.acquisitionPrice,
    acquisitionCosts: base.acquisitionCosts,
    abcTotal: base.abcTotal,
    averageSalePricePerSqm: base.averageSalePricePerSqm,
    unitCount: base.unitCount,
    committedDebtLimite: base.committedDebtLimite,
    primeiraSaidaCapital,
    ultimaEntradaCapitalOuRetorno,
  });
}

/** Extrai o indicador pedido de um ProjectUnderwritingResult já calculado (Gate 7 — pipeline completo). */
export function extrairIndicadorUnderwriting(u: ProjectUnderwritingResult, indicador: IndicadorSensibilidade): number | null {
  switch (indicador) {
    case "irr_unlevered":
      return u.unleveredIrr;
    case "irr_levered":
      return u.leveredIrr;
    case "moic":
      return u.moic;
    case "roi":
      return u.leveredRoi;
    case "roi_nao_alavancado":
      return u.unleveredRoi;
    case "lucro":
      return u.profitBeforePromoteAndTax;
    case "lucro_liquido":
      return u.netProfit;
    case "margem":
      return u.grossVgv > 0 ? u.profitBeforePromoteAndTax / u.grossVgv : null;
    case "equity_contributed":
      return u.leveredEquityInvested;
    case "peak_cash_exposure":
      return u.peakEquityExposure;
    case "peak_debt":
      return u.peakDebt;
    default:
      return null;
  }
}

/**
 * Versão completa de calcularMatrizSensibilidade (Gate 7): cada célula
 * executa calcularCenarioCompletoComVariacoes — nunca só cashflow.ts. A
 * célula 0%×0% fica exatamente igual ao underwriting do dashboard quando
 * `base` é montada com os mesmos dados que project-loader.ts usa.
 */
export function calcularMatrizSensibilidadeCompleta(
  base: PremissasCompletaSensibilidade,
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

      const u = calcularCenarioCompletoComVariacoes(base, deltas.aquisicao, deltas.construcao, deltas.preco);
      const valor = extrairIndicadorUnderwriting(u, indicador);

      return {
        variacaoLinha,
        variacaoColuna,
        valor,
        gdv: u.grossVgv,
        custoTotal: u.projectCapexBeforePromoteAndTax,
        lucro: u.netProfit,
        margem: u.grossVgv > 0 ? u.profitBeforePromoteAndTax / u.grossVgv : 0,
      };
    })
  );

  return { matriz, indicador, celulas };
}

/**
 * Extrai o indicador pedido de um resultado de cash flow já calculado.
 *
 * IMPORTANTE (auditoria financeira — nunca voltar a misturar isto):
 * - "lucro"/"margem" são SEMPRE o resultado do PROJETO (lucroProjeto/
 *   margemProjeto de cashflow.ts — receita menos custos económicos reais,
 *   nunca inclui drawdowns, amortização de capital, equity calls ou
 *   distribuições).
 * - "irr_levered"/"moic"/"roi" são SEMPRE o retorno do EQUITY
 *   (resultado.equity.irr/moic/lucroEquity de equity.ts — calculados só a
 *   partir dos fluxos datados do investidor: capital calls negativos,
 *   distribuições positivas). Nunca a partir do cash flow do projeto —
 *   esse cash flow inclui receita de vendas e drawdowns que o investidor
 *   nunca recebe diretamente, e produzia IRR/MOIC absurdamente inflados.
 *
 * Quando não há investidor externo (caso mais comum, secção 9 do plano),
 * o equity aqui É o do promotor — todo o lucro do projeto que sobra depois
 * de custos e dívida é dele. Com investidor externo e waterfall ativa,
 * estes indicadores continuam a ser os do promotor (ver
 * estrutura-capital.ts para os do investidor externo separadamente) —
 * integração completa com a cascata ainda por fazer aqui.
 */
export function extrairIndicador(resultado: ResultadoCashFlow, indicador: IndicadorSensibilidade): number | null {
  const datasBase = resultado.linhas.map((l) => `${l.mes}-01`);
  const fluxosUnlevered: FluxoDatado[] = resultado.linhas.map((l, i) => ({ data: datasBase[i], valor: l.cashFlowUnlevered }));

  switch (indicador) {
    case "irr_unlevered":
      return calcXIRR(fluxosUnlevered);
    case "irr_levered":
      return resultado.equity.irr;
    case "moic":
      return resultado.equity.moic;
    case "roi":
      // Secção 19 do prompt 03_08: renomeado de "roe" para "roi" — mesma
      // fórmula (lucro do equity ÷ equity investido, fluxos do investidor),
      // só o nome do indicador mudou.
      return resultado.equity.equityContributed > 0 ? resultado.equity.lucroEquity / resultado.equity.equityContributed : null;
    case "lucro":
      return resultado.lucroProjeto;
    case "margem":
      return resultado.margemProjeto;
    case "equity_contributed":
      return resultado.equity.equityContributed;
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
        custoTotal: resultado.custoTotal + resultado.custosFinanceiros,
        lucro: resultado.lucroProjeto,
        margem: resultado.margemProjeto ?? 0,
      };
    })
  );

  return { matriz, indicador, celulas };
}

// Motor de cash flow mensal — Landwise, Fase 7 (parte 3)
//
// Secção 12 do plano: centraliza toda a lógica financeira num único motor,
// mensal. Não duplica fórmulas — reutiliza custos.ts, financiamento.ts,
// equity.ts, perfil-desembolso.ts e vendas.ts (secção 19: um único motor
// por indicador, partilhado pelo dashboard, sensibilidades e relatório).
//
// Implementa as duas visões calculáveis desde já — Project Unlevered e
// Project Levered. As visões de Investidor e Promotor, quando existe
// investidor externo com waterfall, dependem da Fase 5b (hurdles/promote,
// ainda por construir) — até lá, espelham o equity do promotor (secção 9
// do plano: "se não [houver investidor], não mostrar a waterfall
// avançada").

import { gerarMesesEntre, distribuirValorPorPerfil } from "./perfil-desembolso";
import { resolverCustos, type LinhaCusto, type ContextoCusto, type LinhaCustoResolvida } from "./custos";
import { simularFinanciamento, calcResultadosFinanciamento, type ParametrosFinanciamento, type NecessidadeMensal } from "./financiamento";
import { simularEquity, calcResultadosEquity, type NecessidadeMensalEquity } from "./equity";
import { calcXIRR } from "./xirr";
import type { LinhaRecebimentoMensal } from "./vendas";

export type LinhaCashFlowMensal = {
  mes: string;

  // Entradas
  receitaVendas: number;

  // Saídas operacionais
  custosAquisicao: number;
  hardCosts: number;
  softCosts: number;
  outrosCustos: number;
  ivaNaoRecuperavel: number;
  comissaoComercial: number; // sempre saída separada — nunca descontada diretamente da receita de vendas (secção 18 do plano)

  // Unlevered
  cashFlowUnlevered: number;

  // Financiamento
  drawdown: number;
  jurosEFees: number;
  amortizacao: number;
  saldoDivida: number;

  // Levered
  cashFlowLevered: number;

  // Equity
  equityCall: number;
  distribuicoes: number;
  equityOutstanding: number;

  saldoCaixa: number;
  saldoCaixaAcumulado: number;
};

export type ResultadoCashFlow = {
  linhas: LinhaCashFlowMensal[];
  gdv: number;
  custoTotal: number; // custos operacionais (inclui comissão comercial) — NUNCA inclui juros/fees/impostos de financiamento nem movimentos de dívida/equity
  comissaoComercialTotal: number;
  custosFinanceiros: number; // juros + fees + imposto de selo do financiamento (soma de linhas[].jurosEFees) — custo económico real, nunca confundido com drawdown/amortização (que são movimentos de balanço, não de P&L)

  // Resultado do projeto (secção 2/9 do plano) — nunca inclui drawdowns,
  // amortização de capital, equity calls nem distribuições: esses são
  // movimentos de financiamento/balanço, não lucro. lucroProjeto é o nível
  // "core" (receita − custos operacionais − custos financeiros), calculado
  // aqui porque é a única camada que já tem os dois primeiros; fees de
  // promotor e impostos sobre o lucro são adicionados por cima, fora deste
  // motor (project-loader.ts), porque dependem de dados que cashflow.ts não
  // conhece — ver ResultadoProjetoCompleto.lucroProjetoTotal.
  lucroProjeto: number; // gdv − custoTotal − custosFinanceiros
  margemProjeto: number | null; // lucroProjeto ÷ gdv, null quando gdv = 0 (nunca 0% nem Infinity)

  // TIR do projeto — desalavancada (secção 17/24 da auditoria de
  // 2026-07-31): XIRR sobre o cash flow unlevered mensal (sem dívida nem
  // equity). Fonte única, partilhada com o dashboard e as sensibilidades
  // (sensibilidades.ts:"irr_unlevered" usa o mesmo cashFlowUnlevered) —
  // nunca confundir com `equity.irr` (alavancada, só fluxos do investidor).
  // Mostrar sempre as duas lado a lado, nunca "IRR" sozinho sem qualificação.
  irrProjeto: number | null;

  // Campos legados — cash flow mensal acumulado, incluindo drawdowns/
  // amortização de capital. Úteis para mecânica de caixa mês a mês
  // (equity calls, saldo de caixa), mas NUNCA usar como "o lucro do
  // projeto": sobrestimam o lucro sempre que a dívida ainda não foi
  // totalmente amortizada no fim do período modelado (o drawdown entra
  // como se fosse lucro, sem a contrapartida da dívida por pagar).
  lucroUnlevered: number;
  lucroLevered: number;
  margem: number; // = lucroUnlevered ÷ gdv — mantido por compatibilidade, mas ver margemProjeto
  financiamento: ReturnType<typeof calcResultadosFinanciamento>;
  equity: ReturnType<typeof calcResultadosEquity>;
};

export type PremissasCashFlow = {
  linhasCusto: LinhaCusto[];
  contextoCusto: ContextoCusto;
  recebimentos: LinhaRecebimentoMensal[];
  comissaoPorMes?: Map<string, number>; // mês -> valor total da comissão nesse mês (opcional — retrocompatível)
  parametrosFinanciamento: ParametrosFinanciamento;
  mesInicioCashSweep?: string | null; // já resolvido por resolverMesInicioCashSweep (secção 24) — cashflow.ts não conhece a Sales Table
  saldoMinimoCaixa: number;
};

/** Distribui cada linha de custo pelos meses entre a sua data inicial e final, segundo o perfil de desembolso escolhido. */
export function distribuirCustosPorMes(linhasResolvidas: LinhaCustoResolvida[]): Map<string, { aquisicao: number; hard: number; soft: number; outro: number; ivaNaoRecuperavel: number }> {
  const porMes = new Map<string, { aquisicao: number; hard: number; soft: number; outro: number; ivaNaoRecuperavel: number }>();

  const soma = (mes: string, campo: "aquisicao" | "hard" | "soft" | "outro" | "ivaNaoRecuperavel", valor: number) => {
    const atual = porMes.get(mes) ?? { aquisicao: 0, hard: 0, soft: 0, outro: 0, ivaNaoRecuperavel: 0 };
    atual[campo] += valor;
    porMes.set(mes, atual);
  };

  for (const linha of linhasResolvidas) {
    if (!linha.dataInicial || !linha.dataFinal) continue; // sem calendário definido — não entra no cash flow (fica só no capex agregado)
    const distribuicao = distribuirValorPorPerfil(linha.valorResolvido, linha.dataInicial, linha.dataFinal, linha.perfilDesembolso ?? "linear");
    const campo = linha.grupo === "aquisicao" ? "aquisicao" : linha.grupo === "hard_cost" ? "hard" : linha.grupo === "soft_cost" ? "soft" : "outro";

    const distribuicaoIvaNaoRecuperavel = distribuirValorPorPerfil(linha.ivaNaoRecuperavel, linha.dataInicial, linha.dataFinal, linha.perfilDesembolso ?? "linear");

    for (const [mes, valor] of distribuicao) {
      soma(mes, campo, valor);
    }
    for (const [mes, valor] of distribuicaoIvaNaoRecuperavel) {
      soma(mes, "ivaNaoRecuperavel", valor);
    }
  }

  return porMes;
}


export type ReservaMinimaCustos = {
  mesesReserva: number;
  valor: number;
  mesInicio: string | null;
  mesFim: string | null;
};

/**
 * Calcula a maior janela móvel de custos operacionais futuros necessária
 * para manter o projeto durante N meses. Exclui aquisição, dívida, impostos
 * sobre lucro e distribuições porque estes fluxos são tratados fora das
 * linhas de custos operacionais. Inclui hard costs, soft costs, outros custos
 * e IVA não recuperável exatamente uma vez.
 */
export function calcularReservaMinimaCustos(
  linhasCusto: LinhaCusto[],
  contextoCusto: ContextoCusto,
  mesesReserva: number
): ReservaMinimaCustos {
  const meses = Math.max(0, Math.floor(mesesReserva));
  if (meses === 0) return { mesesReserva: 0, valor: 0, mesInicio: null, mesFim: null };

  const resolvidas = resolverCustos(linhasCusto, contextoCusto);
  const porMes = distribuirCustosPorMes(resolvidas);
  const mesesOrdenados = [...porMes.keys()].sort();
  if (mesesOrdenados.length === 0) return { mesesReserva: meses, valor: 0, mesInicio: null, mesFim: null };

  const calendario = gerarMesesEntre(mesesOrdenados[0], mesesOrdenados[mesesOrdenados.length - 1]);
  const operacionais = calendario.map((mes) => {
    const c = porMes.get(mes) ?? { aquisicao: 0, hard: 0, soft: 0, outro: 0, ivaNaoRecuperavel: 0 };
    return c.hard + c.soft + c.outro + c.ivaNaoRecuperavel;
  });

  let melhorValor = 0;
  let melhorInicio = 0;
  for (let i = 0; i < calendario.length; i += 1) {
    const valor = operacionais.slice(i, i + meses).reduce((soma, atual) => soma + atual, 0);
    if (valor > melhorValor) {
      melhorValor = valor;
      melhorInicio = i;
    }
  }

  const fimIdx = Math.min(calendario.length - 1, melhorInicio + meses - 1);
  return {
    mesesReserva: meses,
    valor: melhorValor,
    mesInicio: calendario[melhorInicio] ?? null,
    mesFim: calendario[fimIdx] ?? null,
  };
}

/**
 * Motor central: simula o projeto mês a mês, ligando custos (com o
 * respetivo calendário e perfil de desembolso), recebimentos de vendas,
 * financiamento bancário e equity — sempre pela mesma ordem de dependência:
 * custos e vendas primeiro (dados de entrada), depois financiamento (cobre
 * o défice até ao limite elegível), depois equity (cobre o que sobrar).
 */
export function calcularCashFlow(premissas: PremissasCashFlow): ResultadoCashFlow {
  const linhasResolvidas = resolverCustos(premissas.linhasCusto, premissas.contextoCusto);
  const custosPorMes = distribuirCustosPorMes(linhasResolvidas);
  const recebimentosPorMes = new Map(premissas.recebimentos.map((r) => [r.mes, r.total]));

  const comissaoPorMes = premissas.comissaoPorMes ?? new Map<string, number>();

  const todosMeses = [...new Set([...custosPorMes.keys(), ...recebimentosPorMes.keys(), ...comissaoPorMes.keys()])].sort();
  if (todosMeses.length === 0) {
    return {
      linhas: [],
      gdv: 0,
      custoTotal: 0,
      comissaoComercialTotal: 0,
      custosFinanceiros: 0,
      lucroProjeto: 0,
      margemProjeto: null,
      irrProjeto: null,
      lucroUnlevered: 0,
      lucroLevered: 0,
      margem: 0,
      financiamento: calcResultadosFinanciamento([], 0, 0),
      equity: calcResultadosEquity([]),
    };
  }
  const mesesCompletos = gerarMesesEntre(todosMeses[0], todosMeses[todosMeses.length - 1]);

  // 1) Cash flow unlevered mês a mês (sem dívida nem equity).
  const unleveredPorMes = mesesCompletos.map((mes) => {
    const custos = custosPorMes.get(mes) ?? { aquisicao: 0, hard: 0, soft: 0, outro: 0, ivaNaoRecuperavel: 0 };
    const receita = recebimentosPorMes.get(mes) ?? 0;
    const comissao = comissaoPorMes.get(mes) ?? 0;
    const saida = custos.aquisicao + custos.hard + custos.soft + custos.outro + custos.ivaNaoRecuperavel + comissao;
    return { mes, receita, custos, comissao, cashFlowUnlevered: receita - saida };
  });

  // 2) Financiamento: necessidade elegível mês a mês, saldo de caixa unlevered acumulado como referência.
  let acumuladoUnlevered = 0;
  const necessidadesFinanciamento: NecessidadeMensal[] = unleveredPorMes.map((l) => {
    acumuladoUnlevered += l.cashFlowUnlevered;
    return {
      mes: l.mes,
      custosElegiveisAquisicao: l.custos.aquisicao,
      custosElegiveisHardCosts: l.custos.hard,
      saldoCaixaAntesFinanciamento: acumuladoUnlevered,
    };
  });
  const linhasFinanciamento = simularFinanciamento(necessidadesFinanciamento, premissas.parametrosFinanciamento, premissas.mesInicioCashSweep ?? null);

  // 3) Equity: cobre o que sobrar depois do financiamento, mês a mês.
  //    IMPORTANTE: passa o valor MENSAL (delta), não acumulado — o motor de
  //    equity (equity.ts) já tem o seu próprio mecanismo de arrasto entre
  //    meses (caixaLivre). Passar aqui um valor acumulado duplicaria os
  //    capital calls em qualquer cenário com mais de um mês de défice.
  const necessidadesEquity: NecessidadeMensalEquity[] = unleveredPorMes.map((l, i) => {
    const fin = linhasFinanciamento[i];
    const cashFlowLevered = l.cashFlowUnlevered + fin.drawdown - fin.juros - fin.fees - fin.impostoSelo - fin.amortizacao;
    return { mes: l.mes, saldoCaixaAposFinanciamento: cashFlowLevered, recebimentosClientes: l.receita };
  });
  const linhasEquity = simularEquity(necessidadesEquity);

  // 4) Junta tudo numa única linha por mês.
  let saldoCaixaAcumulado = 0;
  const linhas: LinhaCashFlowMensal[] = unleveredPorMes.map((l, i) => {
    const fin = linhasFinanciamento[i];
    const eq = linhasEquity[i];
    const cashFlowLevered = l.cashFlowUnlevered + fin.drawdown - fin.juros - fin.fees - fin.impostoSelo - fin.amortizacao;
    const saldoCaixa = cashFlowLevered + eq.capitalCall - eq.capitalDevolvido;
    saldoCaixaAcumulado += saldoCaixa;

    return {
      mes: l.mes,
      receitaVendas: l.receita,
      custosAquisicao: l.custos.aquisicao,
      hardCosts: l.custos.hard,
      softCosts: l.custos.soft,
      outrosCustos: l.custos.outro,
      ivaNaoRecuperavel: l.custos.ivaNaoRecuperavel,
      comissaoComercial: l.comissao,
      cashFlowUnlevered: l.cashFlowUnlevered,
      drawdown: fin.drawdown,
      jurosEFees: fin.juros + fin.fees + fin.impostoSelo,
      amortizacao: fin.amortizacao,
      saldoDivida: fin.saldoFinal,
      cashFlowLevered,
      equityCall: eq.capitalCall,
      distribuicoes: eq.capitalDevolvido,
      equityOutstanding: eq.netEquityOutstanding,
      saldoCaixa,
      saldoCaixaAcumulado,
    };
  });

  const gdv = linhas.reduce((s, l) => s + l.receitaVendas, 0);
  const comissaoComercialTotal = linhas.reduce((s, l) => s + l.comissaoComercial, 0);
  const custoTotal = linhas.reduce((s, l) => s + l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos + l.ivaNaoRecuperavel + l.comissaoComercial, 0);
  const custosFinanceiros = linhas.reduce((s, l) => s + l.jurosEFees, 0);
  const lucroUnlevered = linhas.reduce((s, l) => s + l.cashFlowUnlevered, 0);
  const lucroLevered = linhas.reduce((s, l) => s + l.cashFlowLevered, 0);
  const lucroProjeto = gdv - custoTotal - custosFinanceiros;
  const irrProjeto = calcXIRR(linhas.map((l) => ({ data: `${l.mes}-01`, valor: l.cashFlowUnlevered })));

  const custosElegiveisTotal = linhas.reduce((s, l) => s + l.custosAquisicao + l.hardCosts, 0);
  const resultadosFinanciamento = calcResultadosFinanciamento(linhasFinanciamento, gdv, custosElegiveisTotal);
  const resultadosEquity = calcResultadosEquity(linhasEquity);

  return {
    linhas,
    gdv,
    custoTotal,
    comissaoComercialTotal,
    custosFinanceiros,
    lucroProjeto,
    margemProjeto: gdv > 0 ? lucroProjeto / gdv : null,
    irrProjeto,
    lucroUnlevered,
    lucroLevered,
    margem: gdv > 0 ? lucroUnlevered / gdv : 0,
    financiamento: resultadosFinanciamento,
    equity: resultadosEquity,
  };
}

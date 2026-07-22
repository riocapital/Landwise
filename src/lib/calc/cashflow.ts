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
  custoTotal: number;
  lucroUnlevered: number;
  lucroLevered: number;
  margem: number; // lucro do projeto ÷ GDV
  financiamento: ReturnType<typeof calcResultadosFinanciamento>;
  equity: ReturnType<typeof calcResultadosEquity>;
};

export type PremissasCashFlow = {
  linhasCusto: LinhaCusto[];
  contextoCusto: ContextoCusto;
  recebimentos: LinhaRecebimentoMensal[];
  parametrosFinanciamento: ParametrosFinanciamento;
  saldoMinimoCaixa: number;
};

/** Distribui cada linha de custo pelos meses entre a sua data inicial e final, segundo o perfil de desembolso escolhido. */
function distribuirCustosPorMes(linhasResolvidas: LinhaCustoResolvida[]): Map<string, { aquisicao: number; hard: number; soft: number; outro: number; ivaNaoRecuperavel: number }> {
  const porMes = new Map<string, { aquisicao: number; hard: number; soft: number; outro: number; ivaNaoRecuperavel: number }>();

  const soma = (mes: string, campo: "aquisicao" | "hard" | "soft" | "outro" | "ivaNaoRecuperavel", valor: number) => {
    const atual = porMes.get(mes) ?? { aquisicao: 0, hard: 0, soft: 0, outro: 0, ivaNaoRecuperavel: 0 };
    atual[campo] += valor;
    porMes.set(mes, atual);
  };

  for (const linha of linhasResolvidas) {
    if (!linha.dataInicial || !linha.dataFinal) continue; // sem calendário definido — não entra no cash flow (fica só no capex agregado)
    const distribuicao = distribuirValorPorPerfil(linha.valorResolvido + linha.ivaSuportado - linha.ivaRecuperavel, linha.dataInicial, linha.dataFinal, linha.perfilDesembolso ?? "linear");
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

  const todosMeses = [...new Set([...custosPorMes.keys(), ...recebimentosPorMes.keys()])].sort();
  if (todosMeses.length === 0) {
    return {
      linhas: [],
      gdv: 0,
      custoTotal: 0,
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
    const saida = custos.aquisicao + custos.hard + custos.soft + custos.outro + custos.ivaNaoRecuperavel;
    return { mes, receita, custos, cashFlowUnlevered: receita - saida };
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
  const linhasFinanciamento = simularFinanciamento(necessidadesFinanciamento, premissas.parametrosFinanciamento);

  // 3) Equity: cobre o que sobrar depois do financiamento, mês a mês.
  let acumuladoLevered = 0;
  const necessidadesEquity: NecessidadeMensalEquity[] = unleveredPorMes.map((l, i) => {
    const fin = linhasFinanciamento[i];
    const cashFlowLevered = l.cashFlowUnlevered + fin.drawdown - fin.juros - fin.fees - fin.impostoSelo - fin.amortizacao;
    acumuladoLevered += cashFlowLevered;
    return { mes: l.mes, saldoCaixaAposFinanciamento: acumuladoLevered, recebimentosClientes: l.receita };
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
  const custoTotal = linhas.reduce((s, l) => s + l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos + l.ivaNaoRecuperavel, 0);
  const lucroUnlevered = linhas.reduce((s, l) => s + l.cashFlowUnlevered, 0);
  const lucroLevered = linhas.reduce((s, l) => s + l.cashFlowLevered, 0);

  const custosElegiveisTotal = linhas.reduce((s, l) => s + l.custosAquisicao + l.hardCosts, 0);
  const resultadosFinanciamento = calcResultadosFinanciamento(linhasFinanciamento, gdv, custosElegiveisTotal);
  const resultadosEquity = calcResultadosEquity(linhasEquity);

  return {
    linhas,
    gdv,
    custoTotal,
    lucroUnlevered,
    lucroLevered,
    margem: gdv > 0 ? lucroUnlevered / gdv : 0,
    financiamento: resultadosFinanciamento,
    equity: resultadosEquity,
  };
}

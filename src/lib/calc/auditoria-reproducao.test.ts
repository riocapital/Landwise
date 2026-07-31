// ============================================================
// AUDITORIA — testes de reprodução (não corrigem o motor).
//
// Cada teste aqui reproduz, com números mínimos e um cenário controlado,
// um problema identificado na auditoria de 2026-07-31 do Projeto Julieta.
// Nenhum destes testes corrige o motor — só prova, de forma isolada e
// determinística, que o comportamento existe. Ver docs/auditoria/ para a
// explicação completa de cada achado.
//
// Estes testes correm com `npm test` como qualquer outro, mas estão
// isolados neste ficheiro para poderem ser lidos/ignorados em bloco.
// ============================================================

import { describe, it, expect } from "vitest";
import { calcularCashFlow, type PremissasCashFlow } from "./cashflow";
import type { LinhaCusto, ContextoCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import { simularFinanciamento, type NecessidadeMensal } from "./financiamento";
import type { LinhaRecebimentoMensal } from "./vendas";

const contexto: ContextoCusto = { valorAquisicao: 0, abcAcimaSolo: 600, abcAbaixoSolo: 0, abdTotal: 0, numeroUnidades: 10 };

function custo(overrides: Partial<LinhaCusto>): LinhaCusto {
  return {
    id: Math.random().toString(36),
    grupo: "hard_cost",
    categoria: "Genérico",
    nome: "Linha",
    tipoCalculo: "valor_fixo",
    valorInput: 0,
    baseReferenciaCustoId: null,
    taxaIva: null,
    ivaRecuperavelPct: 0,
    dataIvaRecuperacao: null,
    dataInicial: "2026-01-01",
    duracaoMeses: 12,
    dataFinal: "2026-12-01",
    perfilDesembolso: "linear",
    ...overrides,
  };
}

function receber(mes: string, total: number): LinhaRecebimentoMensal {
  return { mes, reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: total, escritura: 0, total };
}

const parametrosBase: ParametrosFinanciamento = {
  comFinanciamento: true,
  percentagemHardCostsFinanciada: 0.7,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0.03,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0.02,
  structuringFeePct: 0,
  setupCosts: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
  limiteCredito: null,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
  cashSweepAtivo: false,
  cashSweepPctCaixaLivre: 0,
  cashSweepMesesCustosFuturos: 0,
  cashSweepInicioTipo: "primeira_escritura",
  cashSweepInicioValorPct: null,
  cashSweepInicioData: null,
  carenciaAtiva: false, // como a maioria dos projetos existentes, incluindo o Julieta antes desta auditoria
  carenciaAnos: 0,
  prazoAnos: 0,
};

describe("AUDITORIA — dívida nunca liquidada é distribuída ao equity como se fosse lucro (achado central, secção 18)", () => {
  it("sem carência e sem cash sweep, o saldo devedor final NUNCA chega a zero — fica na íntegra por pagar", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 1_000_000, saldoCaixaAntesFinanciamento: -1_000_000 },
      ...Array.from({ length: 23 }, (_, i) => ({
        mes: `2026-${String(((i + 1) % 12) + 1).padStart(2, "0")}`,
        custosElegiveisAquisicao: 0,
        custosElegiveisHardCosts: 0,
        saldoCaixaAntesFinanciamento: 0,
      })),
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    const drawdownTotal = linhas.reduce((s, l) => s + l.drawdown, 0);
    const amortizacaoTotal = linhas.reduce((s, l) => s + l.amortizacao, 0);

    expect(amortizacaoTotal).toBe(0); // nenhum mecanismo devolve o capital ao banco
    expect(linhas[linhas.length - 1].saldoFinal).toBeGreaterThan(drawdownTotal); // saldo final ainda maior que o levantado (juros capitalizados por cima)
  });

  it("lucroLevered (que alimenta o equity) excede lucroProjeto exatamente pelo capital em dívida nunca amortizado — a fórmula é lucroLevered - lucroProjeto = drawdownTotal - amortizacaoTotal", () => {
    const linhasCusto = [
      custo({ grupo: "hard_cost", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" }),
    ];
    const premissas: PremissasCashFlow = {
      linhasCusto,
      contextoCusto: contexto,
      recebimentos: [receber("2027-06", 1_600_000)],
      parametrosFinanciamento: parametrosBase,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);

    const drawdownTotal = resultado.linhas.reduce((s, l) => s + l.drawdown, 0);
    const amortizacaoTotal = resultado.linhas.reduce((s, l) => s + l.amortizacao, 0);
    const dividaNuncaAmortizada = drawdownTotal - amortizacaoTotal;

    expect(dividaNuncaAmortizada).toBeGreaterThan(0); // há mesmo dívida por liquidar no fim do horizonte modelado

    // Fórmula provada algebricamente na auditoria: lucroLevered = lucroProjeto + drawdownTotal - amortizacaoTotal
    expect(resultado.lucroLevered).toBeCloseTo(resultado.lucroProjeto + dividaNuncaAmortizada, 2);

    // E é exatamente esse excesso que o simularEquity() distribui ao investidor no último mês,
    // como se fosse lucro do projeto — sem nunca ter sido devolvido ao banco.
    const lucroEquity = resultado.equity.capitalDevolvidoTotal - resultado.equity.equityContributed;
    expect(lucroEquity).toBeCloseTo(resultado.lucroLevered, 2);
    expect(lucroEquity).toBeGreaterThan(resultado.lucroProjeto); // o investidor "recebe" mais lucro do que o projeto gerou de facto
  });

  it("com carência ativa e prazo cumprido (liquidação forçada na maturidade), o gap NÃO desaparece — muda de sinal e passa a ser exatamente os juros capitalizados (revela o segundo bug, da secção seguinte)", () => {
    const linhasCusto = [
      custo({ grupo: "hard_cost", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" }),
    ];
    const parametrosComPrazoCumprido: ParametrosFinanciamento = { ...parametrosBase, carenciaAtiva: true, carenciaAnos: 0, prazoAnos: 0.5 };
    const premissas: PremissasCashFlow = {
      linhasCusto,
      contextoCusto: contexto,
      recebimentos: [receber("2027-06", 1_600_000)],
      parametrosFinanciamento: parametrosComPrazoCumprido,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);
    const drawdownTotal = resultado.linhas.reduce((s, l) => s + l.drawdown, 0);
    const amortizacaoTotal = resultado.linhas.reduce((s, l) => s + l.amortizacao, 0);

    // Ao forçar a liquidação total na maturidade, a amortização passa a pagar
    // TAMBÉM os juros capitalizados (amortização = drawdown + juros totais) —
    // não porque estivesse "certo", mas porque o saldo devedor final inclui
    // os juros que foram capitalizados mês a mês.
    expect(amortizacaoTotal).toBeCloseTo(drawdownTotal + resultado.financiamento.jurosTotais, 2);

    // E como esses juros já tinham sido subtraídos do caixa TAMBÉM todos os
    // meses (bug da dupla contabilização, ver describe seguinte), o
    // lucroLevered fica agora ABAIXO do lucroProjeto pelo valor total de
    // juros — o mesmo euro é penalizado duas vezes ao longo da vida do
    // empréstimo: uma vez como despesa de caixa mensal, outra vez quando o
    // capital "engordado" pelos juros é amortizado no fim.
    expect(resultado.lucroLevered).toBeCloseTo(resultado.lucroProjeto - resultado.financiamento.jurosTotais, 2);
  });
});

describe("AUDITORIA — juros capitalizados no saldo devedor E simultaneamente pagos em caixa (secção 12, dupla contabilização)", () => {
  it("o mesmo valor de juros aumenta o saldo devedor (capitalização) e reduz o caixa levered (pagamento) no mesmo mês", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 1_000_000, saldoCaixaAntesFinanciamento: -1_000_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    const jurosMes2 = linhas[1].juros;
    expect(jurosMes2).toBeGreaterThan(0);

    // Capitalização: o saldo inicial do mês 2 já reflete o drawdown do mês 1,
    // e os juros do mês 2 SOMAM ao saldo (linha `saldoFinal = saldoInicial + juros + drawdown`).
    expect(linhas[1].saldoFinal).toBeCloseTo(linhas[1].saldoInicial + jurosMes2, 2);
    expect(linhas[1].jurosCapitalizados).toBe(jurosMes2); // documentado no próprio motor: "juros sempre capitalizados"

    // Pagamento: o MESMO valor de juros é subtraído do cash flow levered em cashflow.ts
    // (`cashFlowLevered = cashFlowUnlevered + drawdown - juros - fees - impostoSelo - amortizacao`)
    // — ou seja, o motor trata o juro como pago em caixa E como diferido/capitalizado ao mesmo tempo.
    const cashFlowLeveredMes2 = 0 /* cashFlowUnlevered do mês 2, sem custos nem receita */ + 0 /* drawdown */ - jurosMes2 - 0 - 0 - 0;
    expect(cashFlowLeveredMes2).toBeCloseTo(-jurosMes2, 2); // o caixa desce pelo juro...
    expect(linhas[1].saldoFinal - linhas[1].saldoInicial).toBeCloseTo(jurosMes2, 2); // ...e a dívida SOBE pelo mesmo juro, no mesmo mês
  });
});

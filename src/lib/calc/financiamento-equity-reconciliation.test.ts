// ============================================================
// Testes de regressão — correção dos Achados P0 da auditoria de 2026-07-31
// (docs/auditoria/03-motor-financeiro.md, branch auditoria-projeto-julieta).
//
// Achado P0.1: dívida bancária nunca amortizada era distribuída ao equity
// como se fosse lucro (sem carência nem cash sweep, ou mesmo com carência
// se o prazo do empréstimo excedesse a vida do projeto).
//
// Achado P0.2: juros capitalizados no saldo devedor E subtraídos do caixa
// no mesmo mês — dupla contabilização do custo de juros.
//
// Estes testes prova que, depois da correção, o lucro do equity nunca
// excede o lucro do projeto por dívida não liquidada ou juros duplicados.
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
  carenciaAtiva: false,
  carenciaAnos: 0,
  prazoAnos: 0,
  revolver: true,
  commitmentFeePct: 0,
  mesEventoSaida: null,
};

describe("REGRESSÃO — Achado P0.1: dívida sempre liquidada no fim do horizonte, mesmo sem carência/sweep", () => {
  it("sem carência e sem cash sweep, o saldo devedor termina em €0 no último mês do horizonte modelado", () => {
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
    expect(linhas[linhas.length - 1].saldoFinal).toBeCloseTo(0, 2);
  });

  it("lucroLevered já não excede lucroProjeto — a dívida nunca amortizada deixa de fluir para o equity como lucro", () => {
    const linhasCusto = [custo({ grupo: "hard_cost", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" })];
    const premissas: PremissasCashFlow = {
      linhasCusto,
      contextoCusto: contexto,
      recebimentos: [receber("2027-06", 1_600_000)],
      parametrosFinanciamento: parametrosBase,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);

    // A dívida é integralmente liquidada no fim do horizonte.
    const drawdownTotal = resultado.linhas.reduce((s, l) => s + l.drawdown, 0);
    const amortizacaoTotal = resultado.linhas.reduce((s, l) => s + l.amortizacao, 0);
    expect(amortizacaoTotal).toBeCloseTo(drawdownTotal, 2);

    // E o lucro distribuído ao equity reconcilia com o lucro do projeto — sem
    // excesso atribuível a dívida por pagar.
    const lucroEquity = resultado.equity.capitalDevolvidoTotal - resultado.equity.equityContributed;
    expect(lucroEquity).toBeCloseTo(resultado.lucroProjeto, 2);
  });
});

describe("REGRESSÃO — Achado P0.2: juros nunca capitalizados e pagos em caixa ao mesmo tempo", () => {
  it("o saldo devedor só cresce com o drawdown, nunca com os juros do próprio mês", () => {
    const necessidades: NecessidadeMensal[] = [
      { mes: "2026-01", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 1_000_000, saldoCaixaAntesFinanciamento: -1_000_000 },
      { mes: "2026-02", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
      { mes: "2026-03", custosElegiveisAquisicao: 0, custosElegiveisHardCosts: 0, saldoCaixaAntesFinanciamento: 0 },
    ];
    const linhas = simularFinanciamento(necessidades, parametrosBase);
    const jurosMes2 = linhas[1].juros;
    expect(jurosMes2).toBeGreaterThan(0);
    // Sem drawdown no mês 2 (que não é o último mês do horizonte), o saldo final tem de ser
    // igual ao saldo inicial — os juros não entram no saldo, são só pagos em caixa.
    expect(linhas[1].saldoFinal).toBeCloseTo(linhas[1].saldoInicial, 2);
    expect(linhas[1].jurosCapitalizados).toBe(0);
  });

  it("com liquidação forçada no fim do horizonte, a amortização total é exatamente o drawdown total — sem juros capitalizados por cima", () => {
    const linhasCusto = [custo({ grupo: "hard_cost", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" })];
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
    // Já não há excesso de juros capitalizados a inflacionar a amortização final.
    expect(amortizacaoTotal).toBeCloseTo(drawdownTotal, 2);
    // E o lucro do equity volta a bater certo com o lucro do projeto, sem penalização dupla de juros.
    const lucroEquity = resultado.equity.capitalDevolvidoTotal - resultado.equity.equityContributed;
    expect(lucroEquity).toBeCloseTo(resultado.lucroProjeto, 2);
  });
});

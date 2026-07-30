import { describe, it, expect } from "vitest";
import { calcularCashFlow, calcularReservaMinimaCustos, type PremissasCashFlow } from "./cashflow";
import type { LinhaCusto, ContextoCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import type { LinhaRecebimentoMensal } from "./vendas";

const contexto: ContextoCusto = { valorAquisicao: 1_000_000, abcAcimaSolo: 600, abcAbaixoSolo: 400, abdTotal: 200, numeroUnidades: 10 };

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

const parametrosSemFinanciamento: ParametrosFinanciamento = {
  comFinanciamento: false,
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0,
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
};

function receber(mes: string, total: number): LinhaRecebimentoMensal {
  return { mes, reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: total, escritura: 0, total };
}

describe("calcularCashFlow — caso simples, sem financiamento", () => {
  it("junta custos e receitas num ledger mensal coerente, com margem correta", () => {
    const premissas: PremissasCashFlow = {
      linhasCusto: [
        custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" }),
        custo({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 12, dataFinal: "2026-12-31" }),
      ],
      contextoCusto: contexto,
      recebimentos: [receber("2027-01", 3_000_000)],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);
    expect(resultado.gdv).toBe(3_000_000);
    expect(resultado.custoTotal).toBeCloseTo(2_000_000, 6);
    expect(resultado.lucroUnlevered).toBeCloseTo(1_000_000, 2);
    expect(resultado.margem).toBeCloseTo(1_000_000 / 3_000_000, 6);
  });

  it("sem financiamento, todo o défice de caixa é coberto por equity (nunca por dívida)", () => {
    const premissas: PremissasCashFlow = {
      linhasCusto: [custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 500_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" })],
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);
    expect(resultado.financiamento.dividaTotalLevantada).toBe(0);
    expect(resultado.equity.equityContributed).toBeGreaterThan(0);
  });
});

describe("calcularCashFlow — com financiamento bancário", () => {
  const parametrosComFinanciamento: ParametrosFinanciamento = {
    ...parametrosSemFinanciamento,
    comFinanciamento: true,
    percentagemAquisicaoFinanciada: 0.5,
    percentagemHardCostsFinanciada: 0.6,
    euribor: 0.03,
    euriborOrigem: "manual",
    euriborDataReferencia: null,
    euriborFonte: null,
    spread: 0.02,
  };

  it("o drawdown reduz a necessidade de equity face ao cenário sem financiamento", () => {
    const linhasCusto = [
      custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 1_000_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" }),
    ];

    const semFin = calcularCashFlow({
      linhasCusto,
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    });
    const comFin = calcularCashFlow({
      linhasCusto,
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosComFinanciamento,
      saldoMinimoCaixa: 0,
    });

    expect(comFin.equity.equityContributed).toBeLessThan(semFin.equity.equityContributed);
    expect(comFin.financiamento.dividaTotalLevantada).toBeGreaterThan(0);
  });
});

describe("calcularCashFlow — regressão: equity nunca duplica capital calls ao longo de vários meses", () => {
  it("em vários meses de défice consecutivo, o total de equity aportado é igual ao custo total, nunca inflacionado pela acumulação", () => {
    // 3 meses de custo fixo consecutivo, sem financiamento e sem receita —
    // se o motor passasse o saldo ACUMULADO ao equity.ts (bug), o total
    // aportado seria muito maior do que o custo real (100k+200k+300k=600k
    // em vez de 100k+100k+100k=300k).
    const premissas: PremissasCashFlow = {
      linhasCusto: [
        custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 100_000, dataInicial: "2026-01-01", duracaoMeses: 1, dataFinal: "2026-01-31" }),
        custo({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 100_000, dataInicial: "2026-02-01", duracaoMeses: 1, dataFinal: "2026-02-28" }),
        custo({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 100_000, dataInicial: "2026-03-01", duracaoMeses: 1, dataFinal: "2026-03-31" }),
      ],
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    };
    const resultado = calcularCashFlow(premissas);
    expect(resultado.custoTotal).toBeCloseTo(300_000, 2);
    expect(resultado.equity.equityContributed).toBeCloseTo(300_000, 2);

    // Cada mês chama exatamente o seu próprio custo, nunca a soma acumulada.
    const jan = resultado.linhas.find((l) => l.mes === "2026-01")!;
    const fev = resultado.linhas.find((l) => l.mes === "2026-02")!;
    const mar = resultado.linhas.find((l) => l.mes === "2026-03")!;
    expect(jan.equityCall).toBeCloseTo(100_000, 2);
    expect(fev.equityCall).toBeCloseTo(100_000, 2);
    expect(mar.equityCall).toBeCloseTo(100_000, 2);
  });
});

describe("calcularCashFlow — caso vazio", () => {
  it("devolve resultado zerado sem lançar erro quando não há custos nem receitas", () => {
    const resultado = calcularCashFlow({
      linhasCusto: [],
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    });
    expect(resultado.linhas).toHaveLength(0);
    expect(resultado.gdv).toBe(0);
    expect(resultado.margem).toBe(0);
  });
});


describe("correções 29/07 — IVA e reserva mínima", () => {
  it("não conta IVA não recuperável duas vezes no cash flow", () => {
    const resultado = calcularCashFlow({
      linhasCusto: [custo({ valorInput: 10_000, taxaIva: 0.23, ivaRecuperavelPct: 0, dataInicial: "2026-01-01", dataFinal: "2026-01-31", duracaoMeses: 1 })],
      contextoCusto: contexto,
      recebimentos: [],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    });
    expect(resultado.custoTotal).toBeCloseTo(12_300, 6);
    expect(resultado.linhas[0].hardCosts).toBeCloseTo(10_000, 6);
    expect(resultado.linhas[0].ivaNaoRecuperavel).toBeCloseTo(2_300, 6);
  });

  it("calcula a maior janela móvel de 2 meses apenas com custos operacionais", () => {
    const reserva = calcularReservaMinimaCustos(
      [
        custo({ grupo: "aquisicao", valorInput: 1_000_000, dataInicial: "2026-01-01", dataFinal: "2026-01-31", duracaoMeses: 1 }),
        custo({ grupo: "hard_cost", valorInput: 100_000, dataInicial: "2026-02-01", dataFinal: "2026-02-28", duracaoMeses: 1 }),
        custo({ grupo: "soft_cost", valorInput: 150_000, dataInicial: "2026-03-01", dataFinal: "2026-03-31", duracaoMeses: 1 }),
        custo({ grupo: "hard_cost", valorInput: 50_000, dataInicial: "2026-04-01", dataFinal: "2026-04-30", duracaoMeses: 1 }),
      ],
      contexto,
      2
    );
    expect(reserva.valor).toBeCloseTo(250_000, 6);
    expect(reserva.mesInicio).toBe("2026-02");
    expect(reserva.mesFim).toBe("2026-03");
  });
});

describe("Auditoria financeira (inconsistência crítica reportada em preview) — teste de regressão obrigatório", () => {
  // Reproduz exatamente o caso reportado: VGV €7.336.140, custo total
  // €4.835.191, sem outras receitas. O dashboard mostrava "Lucro" =
  // €4.988.212 (resultado.lucroLevered — inclui drawdown de dívida como se
  // fosse lucro, sem a contrapartida da dívida por pagar) ao lado de
  // "Margem" 34,1% (derivada de resultado.margem = lucroUnlevered/gdv) —
  // dois campos com fontes diferentes, mostrados como se reconciliassem.
  // Este teste falha se "Lucro do projeto" alguma vez voltar a divergir de
  // (receita − custo total).
  it("lucroProjeto = receita − custoTotal exatamente, mesmo com os valores reais reportados", () => {
    const custoTotalAlvo = 4_835_191;
    const receitaAlvo = 7_336_140;

    const resultado = calcularCashFlow({
      linhasCusto: [
        custo({ grupo: "hard_cost", valorInput: custoTotalAlvo, taxaIva: null, dataInicial: "2026-01-01", dataFinal: "2026-01-31", duracaoMeses: 1 }),
      ],
      contextoCusto: contexto,
      recebimentos: [receber("2026-06", receitaAlvo)],
      parametrosFinanciamento: parametrosSemFinanciamento, // sem financiamento => custosFinanceiros = 0, custoTotal já inclui tudo
      saldoMinimoCaixa: 0,
    });

    expect(resultado.gdv).toBeCloseTo(receitaAlvo, 2);
    expect(resultado.custoTotal).toBeCloseTo(custoTotalAlvo, 2);
    expect(resultado.custosFinanceiros).toBe(0);

    // O número exato que o bug mostrava errado — nunca mais pode aparecer aqui.
    expect(resultado.lucroProjeto).not.toBeCloseTo(4_988_212, 0);

    expect(resultado.lucroProjeto).toBeCloseTo(2_500_949, 0);
    expect(resultado.margemProjeto).not.toBeNull();
    expect(resultado.margemProjeto!).toBeCloseTo(0.341, 3); // 34,1% após arredondamento visual

    // Assertion estrutural (secção 6): lucro = receita − custo total, margem = lucro / receita — sempre, por construção.
    expect(resultado.lucroProjeto).toBeCloseTo(resultado.gdv - resultado.custoTotal - resultado.custosFinanceiros, 6);
    expect(resultado.margemProjeto!).toBeCloseTo(resultado.lucroProjeto / resultado.gdv, 10);
  });

  it("assertion: drawdowns e equity calls nunca aumentam o lucro do projeto; amortização e distribuições nunca o diminuem", () => {
    // Mesmo caso, mas COM financiamento a cobrir parte dos custos — lucroProjeto
    // tem de ficar EXATAMENTE igual (só muda quem financiou o custo, nunca o
    // lucro económico do projeto), independentemente de quanta dívida foi
    // levantada, amortizada, ou quanto equity foi chamado/devolvido.
    const custoTotalAlvo = 1_000_000;
    const receitaAlvo = 1_500_000;

    const parametrosComFinanciamento: ParametrosFinanciamento = {
      ...parametrosSemFinanciamento,
      comFinanciamento: true,
      percentagemHardCostsFinanciada: 0.8,
      limiteCredito: 900_000,
    };

    const semFinanciamento = calcularCashFlow({
      linhasCusto: [custo({ grupo: "hard_cost", valorInput: custoTotalAlvo, dataInicial: "2026-01-01", dataFinal: "2026-03-31", duracaoMeses: 3 })],
      contextoCusto: contexto,
      recebimentos: [receber("2026-06", receitaAlvo)],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    });

    const comFinanciamento = calcularCashFlow({
      linhasCusto: [custo({ grupo: "hard_cost", valorInput: custoTotalAlvo, dataInicial: "2026-01-01", dataFinal: "2026-03-31", duracaoMeses: 3 })],
      contextoCusto: contexto,
      recebimentos: [receber("2026-06", receitaAlvo)],
      parametrosFinanciamento: parametrosComFinanciamento,
      saldoMinimoCaixa: 0,
    });

    // Houve mesmo dívida desta vez — confirma que o cenário não é trivial.
    expect(comFinanciamento.financiamento.dividaTotalLevantada).toBeGreaterThan(0);

    // custoTotal (operacional) é idêntico — financiar não muda o custo do projeto.
    expect(comFinanciamento.custoTotal).toBeCloseTo(semFinanciamento.custoTotal, 6);
    // lucroProjeto só pode diferir pelos juros/fees reais da dívida (custo económico), nunca pelo drawdown/amortização em si.
    expect(comFinanciamento.lucroProjeto).toBeCloseTo(semFinanciamento.lucroProjeto - comFinanciamento.custosFinanceiros, 2);
  });
});

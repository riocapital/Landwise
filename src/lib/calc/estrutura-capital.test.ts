import { describe, it, expect } from "vitest";
import {
  obterModeloPreset,
  repartirPorParticipacao,
  calcResultadoInvestidorExterno,
  calcResultadoPromotor,
  calcularResultadosComWaterfall,
  construirMesesParaCascata,
} from "./estrutura-capital";
import { distribuirCascata, type MesDisponivelParaDistribuicao } from "./waterfall";
import { calcularCashFlow, type LinhaCashFlowMensal, type PremissasCashFlow } from "./cashflow";
import type { LinhaCusto, ContextoCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";
import type { LinhaRecebimentoMensal } from "./vendas";

const contextoCusto: ContextoCusto = { valorAquisicao: 1_000_000, abcAcimaSolo: 600, abcAbaixoSolo: 400, abdTotal: 200, numeroUnidades: 10 };

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
    duracaoMeses: 1,
    dataFinal: "2026-01-31",
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
  carenciaAtiva: false,
  carenciaAnos: 0,
  prazoAnos: 0,
  revolver: true,
  commitmentFeePct: 0,
  mesEventoSaida: null,
};

function receber(mes: string, total: number): LinhaRecebimentoMensal {
  return { mes, reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: total, escritura: 0, total };
}

describe("obterModeloPreset", () => {
  it("promotor_sozinho não tem investidor externo nem waterfall", () => {
    const p = obterModeloPreset("promotor_sozinho");
    expect(p.temInvestidorExterno).toBe(false);
    expect(p.hurdles).toHaveLength(0);
  });

  it("joint_venture_simples tem investidor externo e um hurdle", () => {
    const p = obterModeloPreset("joint_venture_simples");
    expect(p.temInvestidorExterno).toBe(true);
    expect(p.hurdles.length).toBeGreaterThan(0);
  });

  it("family_office_com_fees tem mais tiers que family_office_sem_fees", () => {
    const semFees = obterModeloPreset("family_office_sem_fees");
    const comFees = obterModeloPreset("family_office_com_fees");
    expect(comFees.hurdles.length).toBeGreaterThanOrEqual(semFees.hurdles.length);
  });

  it("personalizado devolve um ponto de partida neutro", () => {
    const p = obterModeloPreset("personalizado");
    expect(p.hurdles).toHaveLength(0);
  });
});

describe("repartirPorparticipacao — nunca mistura promote com a parte LP", () => {
  const meses: MesDisponivelParaDistribuicao[] = [
    { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 1_000_000, disponivelParaDistribuir: 0 },
    { mes: "2028-01", data: "2028-01-01", capitalCallDoMes: 0, disponivelParaDistribuir: 1_500_000 },
  ];
  const hurdles = [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }];
  const { linhas } = distribuirCascata(meses, hurdles);

  it("divide a parte LP (capital + tiers) proporcionalmente à participação, mas o promote fica 100% no promotor", () => {
    const reparto = repartirPorParticipacao(linhas, 0.8); // 80% investidor externo
    for (let i = 0; i < linhas.length; i++) {
      const poolLp = linhas[i].devolucaoCapital + linhas[i].distribuidoInvestidor;
      expect(reparto[i].investidorExterno).toBeCloseTo(poolLp * 0.8, 2);
      expect(reparto[i].promotorCoInvestimento).toBeCloseTo(poolLp * 0.2, 2);
      expect(reparto[i].promotorPromote).toBe(linhas[i].distribuidoPromotor);
    }
  });
});

describe("calcResultadoInvestidorExterno — separa capital de retorno", () => {
  it("nunca conta como lucro mais do que distribuições menos capital aportado", () => {
    const meses: MesDisponivelParaDistribuicao[] = [
      { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 1_000_000, disponivelParaDistribuir: 0 },
      { mes: "2028-01", data: "2028-01-01", capitalCallDoMes: 0, disponivelParaDistribuir: 1_500_000 },
    ];
    const { linhas } = distribuirCascata(meses, [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }]);
    const reparto = repartirPorParticipacao(linhas, 0.8);
    const datas = meses.map((m) => m.data);
    const resultado = calcResultadoInvestidorExterno(
      reparto,
      [{ data: "2026-01-01", valor: -800_000 }], // 80% de 1.000.000
      datas
    );
    expect(resultado.equityContributed).toBe(800_000);
    expect(resultado.lucro).toBeCloseTo(resultado.distribuicoesTotais - 800_000, 2);
  });
});

describe("calcResultadoPromotor — separa fees, retorno de capital e promote", () => {
  it("o lucro total soma as três componentes sem as confundir", () => {
    const resultado = calcResultadoPromotor(
      [
        { mes: "2026-01", investidorExterno: 0, promotorCoInvestimento: 0, promotorPromote: 0 },
        { mes: "2028-01", investidorExterno: 0, promotorCoInvestimento: 250_000, promotorPromote: 50_000 },
      ],
      200_000, // co-investimento contribuído
      30_000 // fees
    );
    expect(resultado.retornoCoInvestimento).toBe(250_000);
    expect(resultado.promote).toBe(50_000);
    expect(resultado.fees).toBe(30_000);
    expect(resultado.lucroTotal).toBe(250_000 - 200_000 + 30_000 + 50_000);
  });
});

describe("calcularResultadosComWaterfall — liga o ledger mensal à waterfall real", () => {
  it("investidor e promotor recebem proporcional à sua participação na parte de capital+retorno preferencial", () => {
    const linhasCashFlow = [
      { mes: "2026-01", cashFlowLevered: -1_000_000, equityCall: 1_000_000, distribuicoes: 0 } as LinhaCashFlowMensal,
      { mes: "2028-01", cashFlowLevered: 1_100_000, equityCall: 0, distribuicoes: 1_100_000 } as LinhaCashFlowMensal,
    ];
    const hurdles = [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }];
    const { investidor, promotor } = calcularResultadosComWaterfall(linhasCashFlow, hurdles, 0.8, 0);

    expect(investidor.equityContributed).toBeCloseTo(800_000, 2);
    expect(promotor.coInvestimentoContribuido).toBeCloseTo(200_000, 2);
    expect(investidor.distribuicoesTotais + promotor.retornoCoInvestimento + promotor.promote).toBeLessThanOrEqual(1_100_000 + 1e-6);
  });

  it("sem hurdles definidos, tudo o que sobra vai para a parte LP, promote fica a zero", () => {
    const linhasCashFlow = [
      { mes: "2026-01", cashFlowLevered: -500_000, equityCall: 500_000, distribuicoes: 0 } as LinhaCashFlowMensal,
      { mes: "2027-01", cashFlowLevered: 600_000, equityCall: 0, distribuicoes: 600_000 } as LinhaCashFlowMensal,
    ];
    const { investidor, promotor } = calcularResultadosComWaterfall(linhasCashFlow, [], 1, 0);
    expect(promotor.promote).toBe(0);
    expect(investidor.distribuicoesTotais).toBeCloseTo(600_000, 2);
  });

  it("separa sempre fees de retorno de capital e de promote (nunca misturados)", () => {
    const linhasCashFlow = [
      { mes: "2026-01", cashFlowLevered: -1_000_000, equityCall: 1_000_000, distribuicoes: 0 } as LinhaCashFlowMensal,
      { mes: "2028-01", cashFlowLevered: 1_500_000, equityCall: 0, distribuicoes: 1_500_000 } as LinhaCashFlowMensal,
    ];
    const hurdles = [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }];
    const { promotor } = calcularResultadosComWaterfall(linhasCashFlow, hurdles, 0.8, 25_000);
    expect(promotor.fees).toBe(25_000);
    expect(promotor.lucroTotal).toBeCloseTo(promotor.retornoCoInvestimento - promotor.coInvestimentoContribuido + 25_000 + promotor.promote, 2);
  });
});

describe("construirMesesParaCascata — achado P0.2: nunca trata cashFlowLevered em bruto como caixa distribuível", () => {
  it("um mês com cashFlowLevered positivo mas caixa retida pela reserva mínima (equity.ts) não fica disponível para distribuir na cascata", () => {
    // Cenário real (via calcularCashFlow, não valores inventados à mão):
    // mês 1 exige 500.000 de equity; mês 2 recebe 600.000 mas ainda NÃO é o
    // último mês do horizonte, por isso equity.ts retém 300.000 acima da
    // reserva mínima de 300.000 (só o último mês distribui tudo); mês 3,
    // sem mais custos nem receitas, é o último mês e liberta o resto.
    const premissas: PremissasCashFlow = {
      linhasCusto: [custo({ grupo: "aquisicao", valorInput: 500_000, dataInicial: "2026-01-01", dataFinal: "2026-01-31", duracaoMeses: 1 })],
      contextoCusto: contextoCusto,
      recebimentos: [receber("2026-02", 600_000)],
      parametrosFinanciamento: { ...parametrosSemFinanciamento, saldoMinimoCaixa: 300_000 },
      saldoMinimoCaixa: 300_000,
    };
    // Horizonte tem de incluir um mês 3 sem movimentos para que o mês 2 não
    // seja o último mês (regra "só o último mês distribui tudo").
    premissas.recebimentos.push(receber("2026-03", 0));

    const resultado = calcularCashFlow(premissas);
    const mesJan = resultado.linhas.find((l) => l.mes === "2026-01")!;
    const mesFev = resultado.linhas.find((l) => l.mes === "2026-02")!;
    const mesMar = resultado.linhas.find((l) => l.mes === "2026-03")!;

    // Sanidade do cenário: equity.ts está mesmo a reter caixa em fevereiro.
    expect(mesFev.cashFlowLevered).toBeCloseTo(600_000, 2);
    expect(mesFev.distribuicoes).toBeCloseTo(300_000, 2);
    expect(mesFev.distribuicoes).toBeLessThan(mesFev.cashFlowLevered);
    expect(mesMar.distribuicoes).toBeCloseTo(300_000, 2);

    const meses = construirMesesParaCascata(resultado.linhas);
    const cascataJan = meses.find((m) => m.mes === "2026-01")!;
    const cascataFev = meses.find((m) => m.mes === "2026-02")!;
    const cascataMar = meses.find((m) => m.mes === "2026-03")!;

    expect(cascataJan.capitalCallDoMes).toBeCloseTo(mesJan.equityCall, 2);
    // O ponto central do achado P0.2: a cascata usa o valor retido por
    // equity.ts (300.000), nunca o cashFlowLevered em bruto (600.000) —
    // não distribui caixa duas vezes nem antes da hora.
    expect(cascataFev.disponivelParaDistribuir).toBeCloseTo(300_000, 2);
    expect(cascataFev.disponivelParaDistribuir).toBeLessThan(mesFev.cashFlowLevered);
    expect(cascataMar.disponivelParaDistribuir).toBeCloseTo(300_000, 2);
  });
});

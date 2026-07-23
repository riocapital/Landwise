import { describe, it, expect } from "vitest";
import {
  obterModeloPreset,
  repartirPorParticipacao,
  calcResultadoInvestidorExterno,
  calcResultadoPromotor,
  calcularResultadosComWaterfall,
} from "./estrutura-capital";
import { distribuirCascata, type MesDisponivelParaDistribuicao } from "./waterfall";
import type { LinhaCashFlowMensal } from "./cashflow";

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
      { mes: "2026-01", cashFlowLevered: -1_000_000 } as LinhaCashFlowMensal,
      { mes: "2028-01", cashFlowLevered: 1_100_000 } as LinhaCashFlowMensal,
    ];
    const hurdles = [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }];
    const { investidor, promotor } = calcularResultadosComWaterfall(linhasCashFlow, hurdles, 0.8, 0);

    expect(investidor.equityContributed).toBeCloseTo(800_000, 2);
    expect(promotor.coInvestimentoContribuido).toBeCloseTo(200_000, 2);
    expect(investidor.distribuicoesTotais + promotor.retornoCoInvestimento + promotor.promote).toBeLessThanOrEqual(1_100_000 + 1e-6);
  });

  it("sem hurdles definidos, tudo o que sobra vai para a parte LP, promote fica a zero", () => {
    const linhasCashFlow = [
      { mes: "2026-01", cashFlowLevered: -500_000 } as LinhaCashFlowMensal,
      { mes: "2027-01", cashFlowLevered: 600_000 } as LinhaCashFlowMensal,
    ];
    const { investidor, promotor } = calcularResultadosComWaterfall(linhasCashFlow, [], 1, 0);
    expect(promotor.promote).toBe(0);
    expect(investidor.distribuicoesTotais).toBeCloseTo(600_000, 2);
  });

  it("separa sempre fees de retorno de capital e de promote (nunca misturados)", () => {
    const linhasCashFlow = [
      { mes: "2026-01", cashFlowLevered: -1_000_000 } as LinhaCashFlowMensal,
      { mes: "2028-01", cashFlowLevered: 1_500_000 } as LinhaCashFlowMensal,
    ];
    const hurdles = [{ hurdleIRR: 0.08, promotePctAcima: 0.2 }];
    const { promotor } = calcularResultadosComWaterfall(linhasCashFlow, hurdles, 0.8, 25_000);
    expect(promotor.fees).toBe(25_000);
    expect(promotor.lucroTotal).toBeCloseTo(promotor.retornoCoInvestimento - promotor.coInvestimentoContribuido + 25_000 + promotor.promote, 2);
  });
});

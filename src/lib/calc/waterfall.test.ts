import { describe, it, expect } from "vitest";
import { distribuirCascata, calcResultadoInvestidor, type MesDisponivelParaDistribuicao, type NivelHurdle } from "./waterfall";

const hurdles: NivelHurdle[] = [
  { hurdleIRR: 0.08, promotePctAcima: 0.2 }, // 20% de promote entre 8% e o próximo hurdle
  { hurdleIRR: 0.15, promotePctAcima: 0.3 }, // 30% acima de 15%
];

describe("distribuirCascata — ordem obrigatória (secção 9 do plano)", () => {
  it("devolve capital antes de qualquer retorno preferencial ou promote", () => {
    const meses: MesDisponivelParaDistribuicao[] = [
      { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 1_000_000, disponivelParaDistribuir: 0 },
      { mes: "2027-01", data: "2027-01-01", capitalCallDoMes: 0, disponivelParaDistribuir: 500_000 },
    ];
    const { linhas } = distribuirCascata(meses, hurdles);
    // 500.000 < 1.000.000 contribuído -> tudo vai para devolução de capital, nada de promote ainda
    expect(linhas[1].devolucaoCapital).toBe(500_000);
    expect(linhas[1].distribuidoPromotor).toBe(0);
  });

  it("nunca distribui mais caixa do que a disponível no mês", () => {
    const meses: MesDisponivelParaDistribuicao[] = [
      { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 100_000, disponivelParaDistribuir: 0 },
      { mes: "2030-01", data: "2030-01-01", capitalCallDoMes: 0, disponivelParaDistribuir: 300_000 },
    ];
    const { linhas } = distribuirCascata(meses, hurdles);
    const totalDistribuido = linhas[1].devolucaoCapital + linhas[1].distribuidoInvestidor + linhas[1].distribuidoPromotor;
    expect(totalDistribuido).toBeLessThanOrEqual(300_000 + 1e-6);
  });
});

describe("Promote incide só sobre o incremento do tier, nunca sobre o lucro todo", () => {
  it("com lucro moderado (perto do 1.º hurdle), o promotor recebe pouco ou nada", () => {
    const meses: MesDisponivelParaDistribuicao[] = [
      { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 1_000_000, disponivelParaDistribuir: 0 },
      { mes: "2027-01", data: "2027-01-01", capitalCallDoMes: 0, disponivelParaDistribuir: 1_050_000 }, // devolve capital + 5% de retorno — abaixo do hurdle de 8%
    ];
    const { linhas } = distribuirCascata(meses, hurdles);
    expect(linhas[1].devolucaoCapital).toBe(1_000_000);
    expect(linhas[1].distribuidoInvestidor).toBeCloseTo(50_000, 0);
    expect(linhas[1].distribuidoPromotor).toBe(0); // ainda não atingiu o 1.º hurdle
  });

  it("com lucro bem acima do último hurdle, o promotor recebe uma fatia significativa, mas nunca mais do que o fator do último tier", () => {
    const meses: MesDisponivelParaDistribuicao[] = [
      { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 1_000_000, disponivelParaDistribuir: 0 },
      { mes: "2028-01", data: "2028-01-01", capitalCallDoMes: 0, disponivelParaDistribuir: 3_000_000 }, // lucro muito alto face a 2 anos
    ];
    const { linhas } = distribuirCascata(meses, hurdles);
    const lucroTotal = linhas[1].distribuidoInvestidor + linhas[1].distribuidoPromotor;
    // o promotor nunca deve receber mais que 30% do lucro acima da devolução de capital neste cenário simples de 1 evento
    expect(linhas[1].distribuidoPromotor / lucroTotal).toBeLessThanOrEqual(0.31);
    expect(linhas[1].distribuidoPromotor).toBeGreaterThan(0);
  });
});

describe("calcResultadoInvestidor", () => {
  it("calcula MOIC e lucro consistentes com as distribuições", () => {
    const meses: MesDisponivelParaDistribuicao[] = [
      { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 1_000_000, disponivelParaDistribuir: 0 },
      { mes: "2028-01", data: "2028-01-01", capitalCallDoMes: 0, disponivelParaDistribuir: 1_500_000 },
    ];
    const { linhas, historicoInvestidor } = distribuirCascata(meses, hurdles);
    const resultado = calcResultadoInvestidor(linhas, historicoInvestidor);
    expect(resultado.equityContributed).toBe(1_000_000);
    expect(resultado.moic).toBeCloseTo(resultado.distribuicoesTotais / 1_000_000, 6);
    expect(resultado.lucro).toBeCloseTo(resultado.distribuicoesTotais - 1_000_000, 2);
    expect(resultado.irr).not.toBeNull();
  });

  it("sem nenhuma distribuição, a IRR não é calculável (não mostra 0%)", () => {
    const meses: MesDisponivelParaDistribuicao[] = [
      { mes: "2026-01", data: "2026-01-01", capitalCallDoMes: 1_000_000, disponivelParaDistribuir: 0 },
    ];
    const { linhas, historicoInvestidor } = distribuirCascata(meses, hurdles);
    const resultado = calcResultadoInvestidor(linhas, historicoInvestidor);
    expect(resultado.irr).toBeNull();
  });
});

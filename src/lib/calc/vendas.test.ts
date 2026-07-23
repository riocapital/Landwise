import { describe, it, expect } from "vitest";
import { validarEstruturaRecebimentos, gerarRecebimentosMensais, type PlanoVendas } from "./vendas";

const planoBase: PlanoVendas = {
  dataLancamentoComercial: "2026-01-01",
  duracaoVendasMeses: 6,
  dataInicioConstrucao: "2026-01-01",
  dataFimConstrucao: "2027-12-01",
  dataEscritura: "2028-01-01",
  estruturaRecebimentos: {
    pctReserva: 0.05,
    pctCpcv: 0.15,
    pctDuranteConstrucao: 0.5,
    pctConclusao: 0.1,
    pctEscritura: 0.2,
  },
  comissaoMediacaoPct: 0.03,
  cancelamentosEstimadosPct: 0,
};

describe("validarEstruturaRecebimentos", () => {
  it("aceita percentagens que somam exatamente 100%", () => {
    expect(validarEstruturaRecebimentos(planoBase.estruturaRecebimentos)).toBe(true);
  });

  it("rejeita percentagens que não somam 100%", () => {
    expect(
      validarEstruturaRecebimentos({ pctReserva: 0.1, pctCpcv: 0.1, pctDuranteConstrucao: 0.5, pctConclusao: 0.1, pctEscritura: 0.1 })
    ).toBe(false);
  });
});

describe("gerarRecebimentosMensais", () => {
  it("a soma de todos os recebimentos é igual à receita líquida de cancelamentos", () => {
    const { linhas, receitaLiquidaCancelamentos } = gerarRecebimentosMensais(10_000_000, planoBase);
    const soma = linhas.reduce((s, l) => s + l.total, 0);
    expect(soma).toBeCloseTo(receitaLiquidaCancelamentos, 0);
  });

  it("aplica os cancelamentos estimados antes de distribuir, reduzindo a receita total", () => {
    const plano = { ...planoBase, cancelamentosEstimadosPct: 0.1 };
    const { receitaLiquidaCancelamentos } = gerarRecebimentosMensais(10_000_000, plano);
    expect(receitaLiquidaCancelamentos).toBe(9_000_000);
  });

  it("a conclusão cai como valor único no mês de fim de construção", () => {
    const { linhas } = gerarRecebimentosMensais(10_000_000, planoBase);
    const mesConclusao = linhas.find((l) => l.mes === "2027-12");
    expect(mesConclusao?.conclusao).toBeCloseTo(10_000_000 * 0.1, 0);
  });

  it("a escritura cai como valor único no mês da escritura", () => {
    const { linhas } = gerarRecebimentosMensais(10_000_000, planoBase);
    const mesEscritura = linhas.find((l) => l.mes === "2028-01");
    expect(mesEscritura?.escritura).toBeCloseTo(10_000_000 * 0.2, 0);
  });

  it("a parcela 'durante construção' distribui-se ao longo de todo o período de obra, não num só mês", () => {
    const { linhas } = gerarRecebimentosMensais(10_000_000, planoBase);
    const mesesComConstrucao = linhas.filter((l) => l.duranteConstrucao > 0);
    expect(mesesComConstrucao.length).toBeGreaterThan(12); // 24 meses de obra
  });
});

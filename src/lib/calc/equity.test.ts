import { describe, it, expect } from "vitest";
import { simularEquity, calcResultadosEquity, type NecessidadeMensalEquity } from "./equity";

describe("simularEquity — capital calls cobrem exatamente o défice de caixa", () => {
  it("chama capital suficiente para repor o saldo negativo a zero", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -300_000, recebimentosClientes: 0 },
      { mes: "2026-02", saldoCaixaAposFinanciamento: -100_000, recebimentosClientes: 0 },
    ];
    const linhas = simularEquity(necessidades);
    expect(linhas[0].capitalCall).toBe(300_000);
    expect(linhas[1].capitalCall).toBe(100_000);
    expect(linhas[1].equityContribuidoAcumulado).toBe(400_000);
  });

  it("nunca chama capital quando o saldo já é positivo", () => {
    const necessidades: NecessidadeMensalEquity[] = [{ mes: "2026-01", saldoCaixaAposFinanciamento: 50_000, recebimentosClientes: 50_000 }];
    const linhas = simularEquity(necessidades);
    expect(linhas[0].capitalCall).toBe(0);
  });
});

describe("Devolução de capital", () => {
  it("devolve capital aos investidores quando há caixa livre a mais, até ao limite do que foi aportado", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -100_000, recebimentosClientes: 0 }, // capital call 100k
      { mes: "2026-02", saldoCaixaAposFinanciamento: 150_000, recebimentosClientes: 150_000 }, // devolve até 100k, resto fica em caixa livre
    ];
    const linhas = simularEquity(necessidades);
    expect(linhas[1].capitalDevolvido).toBe(100_000);
    expect(linhas[1].netEquityOutstanding).toBe(0);
  });

  it("nunca devolve mais do que o net equity outstanding em risco", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -50_000, recebimentosClientes: 0 },
      { mes: "2026-02", saldoCaixaAposFinanciamento: 500_000, recebimentosClientes: 500_000 },
    ];
    const linhas = simularEquity(necessidades);
    expect(linhas[1].capitalDevolvido).toBe(50_000); // nunca mais do que os 50k aportados
  });
});

describe("Peak cash exposure — calculado do cash flow real, não assumido", () => {
  it("identifica o pico mesmo quando ocorre a meio do projeto, não no início", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -100_000, recebimentosClientes: 0 },
      { mes: "2026-02", saldoCaixaAposFinanciamento: -400_000, recebimentosClientes: 0 }, // pico real aqui
      { mes: "2026-03", saldoCaixaAposFinanciamento: 200_000, recebimentosClientes: 200_000 },
    ];
    const linhas = simularEquity(necessidades);
    const resultados = calcResultadosEquity(linhas);
    expect(resultados.mesPico).toBe("2026-02");
    expect(resultados.peakCashExposure).toBe(500_000); // 100k + 400k acumulados
  });

  it("regista a data do primeiro retorno e da recuperação integral do capital", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -200_000, recebimentosClientes: 0 },
      { mes: "2026-02", saldoCaixaAposFinanciamento: 100_000, recebimentosClientes: 100_000 },
      { mes: "2026-03", saldoCaixaAposFinanciamento: 100_000, recebimentosClientes: 100_000 },
    ];
    const linhas = simularEquity(necessidades);
    const resultados = calcResultadosEquity(linhas);
    expect(resultados.dataPrimeiroRetorno).toBe("2026-02");
    expect(resultados.dataRecuperacaoIntegral).toBe("2026-03");
  });
});

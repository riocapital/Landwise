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
  it("a meio do projeto, devolve capital aos investidores até ao limite do que foi aportado — o resto fica em reserva, nunca distribuído antes de tempo", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -100_000, recebimentosClientes: 0 }, // capital call 100k
      { mes: "2026-02", saldoCaixaAposFinanciamento: 150_000, recebimentosClientes: 150_000 }, // devolve até 100k, resto fica em caixa livre (não é o último mês)
      { mes: "2026-03", saldoCaixaAposFinanciamento: 0, recebimentosClientes: 0 }, // mês neutro, só para 2026-02 não ser o último mês do projeto
    ];
    const linhas = simularEquity(necessidades);
    expect(linhas[1].capitalDevolvido).toBe(100_000);
    expect(linhas[1].netEquityOutstanding).toBe(0);
  });

  it("a meio do projeto, nunca devolve mais do que o net equity outstanding em risco — o excedente fica retido para o fim", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -50_000, recebimentosClientes: 0 },
      { mes: "2026-02", saldoCaixaAposFinanciamento: 500_000, recebimentosClientes: 500_000 },
      { mes: "2026-03", saldoCaixaAposFinanciamento: 0, recebimentosClientes: 0 }, // mês neutro, só para 2026-02 não ser o último mês do projeto
    ];
    const linhas = simularEquity(necessidades);
    expect(linhas[1].capitalDevolvido).toBe(50_000); // nunca mais do que os 50k aportados, a meio do projeto
    expect(linhas[2].capitalDevolvido).toBe(450_000); // o excedente (lucro) só sai no último mês
  });

  it("no ÚLTIMO mês do projeto, distribui TUDO o que sobra — capital + lucro — nunca deixa lucro por distribuir sem dono (bug real: MOIC/IRR do equity ficavam sempre em 1,0x/0% porque o lucro nunca saía do caixaLivre interno)", () => {
    const necessidades: NecessidadeMensalEquity[] = [
      { mes: "2026-01", saldoCaixaAposFinanciamento: -100_000, recebimentosClientes: 0 }, // capital call 100k
      { mes: "2026-02", saldoCaixaAposFinanciamento: 250_000, recebimentosClientes: 250_000 }, // último mês: devolve 100k de capital + 150k de lucro
    ];
    const linhas = simularEquity(necessidades);
    expect(linhas[1].capitalDevolvido).toBe(250_000); // capital (100k) + lucro (150k), tudo distribuído
    expect(linhas[1].netEquityOutstanding).toBe(-150_000); // negativo = mais devolvido do que investido (lucro líquido)

    const resultados = calcResultadosEquity(linhas);
    expect(resultados.equityContributed).toBe(100_000);
    expect(resultados.capitalDevolvidoTotal).toBe(250_000);
    expect(resultados.lucroEquity).toBe(150_000); // 250k distribuídos − 100k investidos
    expect(resultados.moic).toBeCloseTo(2.5, 6); // 250k / 100k — nunca 1,0x quando há lucro real
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

import { describe, it, expect } from "vitest";
import { montarCalendarioAutomatico, type EventoFinanciamentoMensal } from "./calendario-automatico";
import type { LinhaCusto } from "./custos";

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
    dataFinal: "2026-12-31",
    perfilDesembolso: "linear",
    ...overrides,
  };
}

describe("montarCalendarioAutomatico — nunca inventa datas, só lê registos reais", () => {
  it("agrupa aquisição e custos separadamente, cada um só com linhas que têm datas", () => {
    const linhasCusto = [
      custo({ grupo: "aquisicao", nome: "Sinal", dataInicial: "2026-01-01", dataFinal: "2026-01-31" }),
      custo({ grupo: "hard_cost", nome: "Construção acima do solo", dataInicial: "2026-02-01", dataFinal: "2027-06-30" }),
      custo({ grupo: "soft_cost", nome: "Arquitetura", dataInicial: null, dataFinal: null }), // sem datas — nunca aparece
    ];
    const r = montarCalendarioAutomatico(linhasCusto, { dataLancamentoComercial: null, dataEscritura: null, porTipologia: [] }, []);

    const aquisicao = r.grupos.find((g) => g.grupo === "aquisicao");
    const custos = r.grupos.find((g) => g.grupo === "custos");
    expect(aquisicao?.linhas).toHaveLength(1);
    expect(custos?.linhas).toHaveLength(1); // a linha sem datas nunca entra
  });

  it("vendas: lançamento, uma linha por tipologia (1ª à última venda), escritura", () => {
    const r = montarCalendarioAutomatico(
      [],
      {
        dataLancamentoComercial: "2026-01-01",
        dataEscritura: "2028-01-01",
        porTipologia: [{ tipologiaId: "t1", nome: "T1", primeiraData: "2026-03-01", ultimaData: "2026-09-01" }],
      },
      []
    );
    const vendas = r.grupos.find((g) => g.grupo === "vendas");
    expect(vendas?.linhas.map((l) => l.nome)).toEqual(["Lançamento comercial", "Vendas — T1", "Escrituras"]);
  });

  it("financiamento: uma linha do primeiro drawdown até ao mês em que a dívida chega a zero", () => {
    const linhasFinanciamento: EventoFinanciamentoMensal[] = [
      { mes: "2026-01", drawdown: 500_000, amortizacao: 0, saldoDivida: 500_000 },
      { mes: "2026-02", drawdown: 0, amortizacao: 501_000, saldoDivida: 0 },
    ];
    const r = montarCalendarioAutomatico([], { dataLancamentoComercial: null, dataEscritura: null, porTipologia: [] }, linhasFinanciamento);
    const financiamento = r.grupos.find((g) => g.grupo === "financiamento");
    expect(financiamento?.linhas[0].inicio).toBe("2026-01-01");
    expect(financiamento?.linhas[0].fim).toBe("2026-02-01");
  });

  it("sem financiamento (nenhum drawdown), o grupo de financiamento não aparece", () => {
    const linhasFinanciamento: EventoFinanciamentoMensal[] = [{ mes: "2026-01", drawdown: 0, amortizacao: 0, saldoDivida: 0 }];
    const r = montarCalendarioAutomatico([], { dataLancamentoComercial: null, dataEscritura: null, porTipologia: [] }, linhasFinanciamento);
    expect(r.grupos.find((g) => g.grupo === "financiamento")).toBeUndefined();
  });

  it("data inicial = primeiro fluxo financeiro; data final = último evento ativo (secção 30)", () => {
    const linhasCusto = [custo({ grupo: "aquisicao", nome: "Sinal", dataInicial: "2026-01-01", dataFinal: "2026-01-31" })];
    const r = montarCalendarioAutomatico(
      linhasCusto,
      { dataLancamentoComercial: "2026-06-01", dataEscritura: "2028-03-01", porTipologia: [] },
      []
    );
    expect(r.dataInicial).toBe("2026-01-01");
    expect(r.dataFinal).toBe("2028-03-01");
  });

  it("sem nenhum registo com datas, devolve calendário vazio, nunca inventa nada", () => {
    const r = montarCalendarioAutomatico([], { dataLancamentoComercial: null, dataEscritura: null, porTipologia: [] }, []);
    expect(r.grupos).toHaveLength(0);
    expect(r.dataInicial).toBeNull();
    expect(r.dataFinal).toBeNull();
  });
});

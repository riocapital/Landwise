import { describe, it, expect } from "vitest";
import {
  criarFeeZerado,
  resolverValorFee,
  agregarFees,
  calendarioPorDefeitoFee,
  feesParaLinhasCusto,
  type Fee,
  type ContextoFees,
  type DatasProjetoParaFees,
} from "./fees";

const contexto: ContextoFees = {
  valorAquisicao: 1_000_000,
  hardCostsTotal: 2_000_000,
  capexTotal: 3_500_000,
  custoTotal: 4_000_000,
  vgvBruto: 8_000_000,
  vgvLiquido: 7_600_000,
  abcTotal: 1000,
  numeroUnidades: 10,
};

describe("criarFeeZerado", () => {
  it("cria sempre um fee com valor 0 — nunca um valor pré-definido sem modelo escolhido", () => {
    const fee = criarFeeZerado("1", "Origination fee", "origination");
    expect(fee.valorInput).toBe(0);
    expect(resolverValorFee(fee, contexto)).toBe(0);
  });
});

describe("resolverValorFee", () => {
  const base: Omit<Fee, "baseCalculo" | "valorInput"> = {
    id: "1",
    nome: "Fee",
    tipo: "development",
    momentoPagamento: "conclusao",
    dataPersonalizada: null,
    dataInicial: null,
    duracaoMeses: null,
    perfilDesembolso: "unico_inicio",
    taxaIva: null,
    ivaRecuperavelPct: 0,
  };

  it("percentagem_aquisicao", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_aquisicao", valorInput: 0.01 }, contexto)).toBe(10_000);
  });

  it("percentagem_hard_costs", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_hard_costs", valorInput: 0.03 }, contexto)).toBe(60_000);
  });

  it("percentagem_capex — usa o capex já resolvido pelo motor de custos, nunca recalcula com os próprios fees incluídos", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_capex", valorInput: 0.02 }, contexto)).toBe(70_000);
  });

  it("percentagem_custo_total", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_custo_total", valorInput: 0.015 }, contexto)).toBe(60_000);
  });

  it("eur_m2 e eur_unidade", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "eur_m2", valorInput: 15 }, contexto)).toBe(15_000);
    expect(resolverValorFee({ ...base, baseCalculo: "eur_unidade", valorInput: 5000 }, contexto)).toBe(50_000);
  });

  // --- Novas bases (secção 6 do prompt 03_08 — achado P1.6) ---

  it("percentagem_vgv_bruto", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_vgv_bruto", valorInput: 0.02 }, contexto)).toBe(160_000);
  });

  it("percentagem_vgv_liquido", () => {
    expect(resolverValorFee({ ...base, baseCalculo: "percentagem_vgv_liquido", valorInput: 0.02 }, contexto)).toBe(152_000);
  });

  it("valor_mensal usa a duração efetiva passada (calendário resolvido), não fee.duracaoMeses em bruto quando este ainda está por preencher", () => {
    const fee: Fee = { ...base, baseCalculo: "valor_mensal", valorInput: 2000, duracaoMeses: null };
    expect(resolverValorFee(fee, contexto, 6)).toBe(12_000);
    expect(resolverValorFee({ ...fee, duracaoMeses: 4 }, contexto)).toBe(8_000); // sem duração efetiva explícita, cai para fee.duracaoMeses
  });
});

describe("agregarFees", () => {
  it("soma corretamente por tipo e no total, sem misturar categorias", () => {
    const base = { dataPersonalizada: null, dataInicial: null, duracaoMeses: null, perfilDesembolso: "unico_inicio" as const, taxaIva: null, ivaRecuperavelPct: 0 };
    const fees: Fee[] = [
      { ...base, id: "1", nome: "Origination", tipo: "origination", baseCalculo: "percentagem_aquisicao", valorInput: 0.01, momentoPagamento: "aquisicao" },
      { ...base, id: "2", nome: "Development", tipo: "development", baseCalculo: "percentagem_hard_costs", valorInput: 0.02, momentoPagamento: "proporcional_capex" },
    ];
    const resumo = agregarFees(fees, contexto);
    expect(resumo.porTipo.origination).toBe(10_000);
    expect(resumo.porTipo.development).toBe(40_000);
    expect(resumo.porTipo.acquisition).toBe(0);
    expect(resumo.total).toBe(50_000);
  });
});

// --- Calendarização (secção 6 do prompt 03_08 — corrige o achado P0.1:
// o fee deixa de ser só um total agregado aplicado depois do cash flow) ---

describe("calendarioPorDefeitoFee", () => {
  const datas: DatasProjetoParaFees = {
    dataEscrituraAquisicao: "2026-01-15",
    dataInicioConstrucao: "2026-03-01",
    dataFimConstrucao: "2027-02-28",
    dataEscrituraVenda: "2027-06-01",
  };

  it("momento 'aquisicao'/'escritura' usa a data de escritura da aquisição, único mês", () => {
    expect(calendarioPorDefeitoFee("aquisicao", null, datas)).toEqual({ dataInicial: "2026-01-15", duracaoMeses: 1, perfilDesembolso: "unico_inicio" });
    expect(calendarioPorDefeitoFee("escritura", null, datas)).toEqual({ dataInicial: "2026-01-15", duracaoMeses: 1, perfilDesembolso: "unico_inicio" });
  });

  it("momento 'conclusao' usa o fim de obra", () => {
    expect(calendarioPorDefeitoFee("conclusao", null, datas)).toEqual({ dataInicial: "2027-02-28", duracaoMeses: 1, perfilDesembolso: "unico_inicio" });
  });

  it("momento 'durante_desenvolvimento' espalha linearmente pelo período de obra", () => {
    const r = calendarioPorDefeitoFee("durante_desenvolvimento", null, datas);
    expect(r.dataInicial).toBe("2026-03-01");
    expect(r.duracaoMeses).toBe(12);
    expect(r.perfilDesembolso).toBe("linear");
  });

  it("sem datas de obra preenchidas, fica sem calendário — nunca inventa uma data", () => {
    const r = calendarioPorDefeitoFee("durante_desenvolvimento", null, { ...datas, dataInicioConstrucao: null });
    expect(r.dataInicial).toBeNull();
    expect(r.duracaoMeses).toBeNull();
  });

  it("momento 'data_personalizada' usa a data fornecida", () => {
    expect(calendarioPorDefeitoFee("data_personalizada", "2026-05-10", datas)).toEqual({ dataInicial: "2026-05-10", duracaoMeses: 1, perfilDesembolso: "unico_inicio" });
  });
});

describe("feesParaLinhasCusto", () => {
  const datas: DatasProjetoParaFees = {
    dataEscrituraAquisicao: "2026-01-15",
    dataInicioConstrucao: "2026-03-01",
    dataFimConstrucao: "2027-02-28",
    dataEscrituraVenda: "2027-06-01",
  };

  it("transforma um fee sem calendário próprio numa linha de custo com o calendário por defeito e o valor já resolvido", () => {
    const fee: Fee = {
      id: "f1",
      nome: "Development fee",
      tipo: "development",
      baseCalculo: "percentagem_capex",
      valorInput: 0.02,
      momentoPagamento: "conclusao",
      dataPersonalizada: null,
      dataInicial: null,
      duracaoMeses: null,
      perfilDesembolso: "unico_inicio",
      taxaIva: null,
      ivaRecuperavelPct: 0,
    };
    const [linha] = feesParaLinhasCusto([fee], contexto, datas);
    expect(linha.valorInput).toBe(70_000); // 2% de capexTotal (3.500.000)
    expect(linha.dataInicial).toBe("2027-02-28");
    expect(linha.dataFinal).not.toBeNull();
    expect(linha.grupo).toBe("outro");
    expect(linha.tipoCalculo).toBe("valor_fixo"); // já resolvido — a linha entra no cash flow com o valor absoluto final
  });

  it("um calendário próprio explícito no fee prevalece sobre o calendário por defeito", () => {
    const fee: Fee = {
      id: "f2",
      nome: "Acquisition fee",
      tipo: "acquisition",
      baseCalculo: "valor_fixo",
      valorInput: 25_000,
      momentoPagamento: "aquisicao",
      dataPersonalizada: null,
      dataInicial: "2026-06-01", // explicitamente diferente da data de escritura da aquisição
      duracaoMeses: 1,
      perfilDesembolso: "unico_inicio",
      taxaIva: null,
      ivaRecuperavelPct: 0,
    };
    const [linha] = feesParaLinhasCusto([fee], contexto, datas);
    expect(linha.dataInicial).toBe("2026-06-01");
  });

  it("fee 'mensal' sem calendário próprio e sem datas de obra fica sem data — nunca entra no cash flow com uma data inventada", () => {
    const fee: Fee = {
      id: "f3",
      nome: "Asset management fee",
      tipo: "asset_management",
      baseCalculo: "valor_mensal",
      valorInput: 1000,
      momentoPagamento: "mensal",
      dataPersonalizada: null,
      dataInicial: null,
      duracaoMeses: null,
      perfilDesembolso: "linear",
      taxaIva: null,
      ivaRecuperavelPct: 0,
    };
    const [linha] = feesParaLinhasCusto([fee], contexto, { ...datas, dataInicioConstrucao: null });
    expect(linha.dataInicial).toBeNull();
    expect(linha.valorInput).toBe(0); // sem duração efetiva, valor_mensal resolve para 0 — nunca inventa meses
  });
});

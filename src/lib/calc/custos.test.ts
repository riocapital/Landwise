import { describe, it, expect } from "vitest";
import {
  resolverValoresCustos,
  resolverCustos,
  calcIvaLinha,
  agregarCustos,
  calcDataFinal,
  calcDuracaoMeses,
  type LinhaCusto,
  type ContextoCusto,
} from "./custos";

const contexto: ContextoCusto = {
  valorAquisicao: 1_000_000,
  abcPrincipal: 1000,
  abcTotal: 1200,
  numeroUnidades: 10,
};

function linha(overrides: Partial<LinhaCusto>): LinhaCusto {
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
    dataInicial: null,
    duracaoMeses: null,
    dataFinal: null,
    perfilDesembolso: "linear",
    ...overrides,
  };
}

describe("Bases diretas (estágio A)", () => {
  it("valor_fixo devolve o próprio valor", () => {
    const l = linha({ tipoCalculo: "valor_fixo", valorInput: 5000 });
    expect(resolverValoresCustos([l], contexto).get(l.id)).toBe(5000);
  });

  it("percentagem_aquisicao multiplica pelo valor de aquisição", () => {
    const l = linha({ tipoCalculo: "percentagem_aquisicao", valorInput: 0.02 });
    expect(resolverValoresCustos([l], contexto).get(l.id)).toBe(20_000);
  });

  it("eur_m2_abc_principal multiplica pelo ABC principal (sem ABD)", () => {
    const l = linha({ tipoCalculo: "eur_m2_abc_principal", valorInput: 900 });
    expect(resolverValoresCustos([l], contexto).get(l.id)).toBe(900 * 1000);
  });

  it("eur_m2_abc_total multiplica pelo ABC Total (com ABD)", () => {
    const l = linha({ tipoCalculo: "eur_m2_abc_total", valorInput: 50 });
    expect(resolverValoresCustos([l], contexto).get(l.id)).toBe(50 * 1200);
  });

  it("eur_unidade multiplica pelo número de unidades", () => {
    const l = linha({ tipoCalculo: "eur_unidade", valorInput: 3000 });
    expect(resolverValoresCustos([l], contexto).get(l.id)).toBe(30_000);
  });
});

describe("percentagem_hard_costs (estágio B) — nunca inclui a própria linha", () => {
  it("soma só os OUTROS hard costs, excluindo a contingência de si própria", () => {
    const obraAcima = linha({ id: "obra", grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 800_000 });
    const obraAbaixo = linha({ id: "obra2", grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 200_000 });
    const contingencia = linha({ id: "conting", grupo: "hard_cost", tipoCalculo: "percentagem_hard_costs", valorInput: 0.05 });
    const resolvido = resolverValoresCustos([obraAcima, obraAbaixo, contingencia], contexto);
    // 5% de (800k + 200k) = 50k — nunca 5% de (800k+200k+contingencia)
    expect(resolvido.get("conting")).toBe(50_000);
  });

  it("soft cost como percentagem de hard costs usa a mesma base", () => {
    const obra = linha({ id: "obra", grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 1_000_000 });
    const projeto = linha({ id: "proj", grupo: "soft_cost", tipoCalculo: "percentagem_hard_costs", valorInput: 0.08 });
    const resolvido = resolverValoresCustos([obra, projeto], contexto);
    expect(resolvido.get("proj")).toBe(80_000);
  });
});

describe("percentagem_capex / percentagem_custo_total (estágio C)", () => {
  it("soma tudo o que já foi resolvido nos estágios A e B, excluindo-se a si própria", () => {
    const aquisicao = linha({ id: "aq", grupo: "aquisicao", tipoCalculo: "percentagem_aquisicao", valorInput: 1 }); // = 1.000.000
    const obra = linha({ id: "obra", grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 500_000 });
    const contingenciaCapex = linha({ id: "cc", grupo: "outro", tipoCalculo: "percentagem_capex", valorInput: 0.1 });
    const resolvido = resolverValoresCustos([aquisicao, obra, contingenciaCapex], contexto);
    // capex parcial antes desta linha = 1.000.000 (aquisição) + 500.000 (obra) = 1.500.000; 10% = 150.000
    expect(resolvido.get("cc")).toBe(150_000);
  });
});

describe("percentagem_outra_base (estágio D)", () => {
  it("referencia diretamente outra linha já resolvida", () => {
    const honorarios = linha({ id: "hon", grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 100_000 });
    const comissao = linha({
      id: "com",
      grupo: "aquisicao",
      tipoCalculo: "percentagem_outra_base",
      valorInput: 0.1,
      baseReferenciaCustoId: "hon",
    });
    const resolvido = resolverValoresCustos([honorarios, comissao], contexto);
    expect(resolvido.get("com")).toBe(10_000);
  });
});

describe("IVA — nunca contado duas vezes, sempre por linha", () => {
  it("sem taxa de IVA configurada, tudo fica em custo sem IVA", () => {
    const r = calcIvaLinha(10_000, null, 0);
    expect(r).toEqual({ custoSemIva: 10_000, ivaSuportado: 0, ivaRecuperavel: 0, ivaNaoRecuperavel: 0 });
  });

  it("separa corretamente IVA recuperável e não recuperável", () => {
    const r = calcIvaLinha(10_000, 0.23, 0.5);
    expect(r.ivaSuportado).toBeCloseTo(2300, 6);
    expect(r.ivaRecuperavel).toBeCloseTo(1150, 6);
    expect(r.ivaNaoRecuperavel).toBeCloseTo(1150, 6);
  });

  it("agregarCustos soma o IVA de cada linha exatamente uma vez", () => {
    const l1 = linha({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 10_000, taxaIva: 0.23, ivaRecuperavelPct: 1 });
    const l2 = linha({ grupo: "soft_cost", tipoCalculo: "valor_fixo", valorInput: 5_000, taxaIva: 0.06, ivaRecuperavelPct: 0 });
    const resolvidas = resolverCustos([l1, l2], contexto);
    const resumo = agregarCustos(resolvidas);
    expect(resumo.ivaSuportadoTotal).toBeCloseTo(10_000 * 0.23 + 5_000 * 0.06, 6);
    expect(resumo.ivaRecuperavelTotal).toBeCloseTo(10_000 * 0.23, 6);
    expect(resumo.ivaNaoRecuperavelTotal).toBeCloseTo(5_000 * 0.06, 6);
  });
});

describe("agregarCustos — totais por grupo e custo total", () => {
  it("soma cada grupo separadamente e o total geral", () => {
    const linhas = [
      linha({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 1_000_000 }),
      linha({ grupo: "hard_cost", tipoCalculo: "valor_fixo", valorInput: 500_000 }),
      linha({ grupo: "soft_cost", tipoCalculo: "valor_fixo", valorInput: 100_000 }),
      linha({ grupo: "outro", tipoCalculo: "valor_fixo", valorInput: 50_000 }),
    ];
    const resumo = agregarCustos(resolverCustos(linhas, contexto));
    expect(resumo.totalAquisicao).toBe(1_000_000);
    expect(resumo.totalHardCosts).toBe(500_000);
    expect(resumo.totalSoftCosts).toBe(100_000);
    expect(resumo.totalOutros).toBe(50_000);
    expect(resumo.custoTotal).toBe(1_650_000);
  });
});

describe("Calendário — início + duração = fim", () => {
  it("duração de 1 mês termina no último dia do mesmo mês", () => {
    expect(calcDataFinal("2026-09-01", 1)).toBe("2026-09-30");
  });

  it("duração de 24 meses termina no último dia do 24.º mês (exemplo do plano)", () => {
    expect(calcDataFinal("2026-09-01", 24)).toBe("2028-08-31");
  });

  it("calcDuracaoMeses é o inverso de calcDataFinal", () => {
    const inicio = "2026-09-01";
    const fim = calcDataFinal(inicio, 24);
    expect(calcDuracaoMeses(inicio, fim)).toBe(24);
  });
});

import { describe, it, expect } from "vitest";
import {
  gerarUnidadesDeTipologia,
  calcAbdFisica,
  calcAbdVendavel,
  calcAreaVendavel,
  calcPrecoFinalUnidade,
  calcularSincronizacao,
  validarVenda,
  resolverSalesTable,
  calcVgvBruto,
  calcDataEscrituraDefeito,
  validarEscrituraUnidade,
  calcValorEscrituraUnidade,
  type UnidadeVenda,
} from "./sales-table";
import type { Typology } from "./areas";

function tipologia(overrides: Partial<Typology>): Typology {
  return {
    id: "t1",
    nome: "T1",
    quantidade: 10,
    abpUnidade: 70,
    varandaM2: 8,
    varandaPctValorizacao: 0.3,
    terracoM2: 0,
    terracoPctValorizacao: 0,
    jardimPrivativoM2: 0,
    jardimPctValorizacao: 0,
    arrecadacaoM2: 0,
    arrecadacaoPctValorizacao: 0,
    estacionamentosIncluidos: 1,
    valorEstacionamento: 15000,
    precoBaseM2: 4000,
    metodoPrecificacao: "area_vendavel_equivalente",
    precoManualUnidade: null,
    mesesParaPrimeiraVenda: 0,
    unidadesPorMes: 1,
    ...overrides,
  };
}

function unidadeBase(overrides: Partial<UnidadeVenda>): UnidadeVenda {
  return {
    id: "u1",
    tipologiaId: "t1",
    ordem: 0,
    bloco: null,
    piso: null,
    abp: 70,
    varandaM2: 8,
    terracoM2: 0,
    outrasAreasM2: 0,
    estacionamentos: 1,
    valorEstacionamento: 15000,
    precoBaseM2: 4000,
    ajusteFaseComercialPct: 0,
    premioDescontoUnidade: 0,
    overrideManualValor: null,
    precoBloqueado: false,
    personalizada: false,
    dataVenda: null,
    sinalValor: 0,
    reforcosValor: 0,
    dataEscritura: null,
    estadoComercial: "disponivel",
    ...overrides,
  };
}

describe("gerarUnidadesDeTipologia", () => {
  it("gera exatamente a quantidade pedida, uma linha por unidade", () => {
    const t = tipologia({});
    const unidades = gerarUnidadesDeTipologia(t, 10, 0);
    expect(unidades).toHaveLength(10);
    expect(unidades.every((u) => u.tipologiaId === "t1")).toBe(true);
  });

  it("10 T1 + 10 T2 + 10 T3 + 10 T4 = 40 unidades (exemplo do plano)", () => {
    const tipologias = ["t1", "t2", "t3", "t4"].map((id) => tipologia({ id, quantidade: 10 }));
    const todas = tipologias.flatMap((t) => gerarUnidadesDeTipologia(t, 10, 0));
    expect(todas).toHaveLength(40);
  });
});

describe("ABD física e vendável — cada área com o seu próprio coeficiente", () => {
  it("ABD física é a soma bruta, sem coeficientes", () => {
    expect(calcAbdFisica({ varandaM2: 8, terracoM2: 4, outrasAreasM2: 2 })).toBe(14);
  });

  it("ABD vendável pesa cada área pelo seu próprio coeficiente, nunca um único coeficiente para todas", () => {
    const abdVendavel = calcAbdVendavel(
      { varandaM2: 10, terracoM2: 10, outrasAreasM2: 10 },
      { varandaCoef: 0.3, terracoCoef: 0.5, outrasAreasCoef: 0.1 }
    );
    expect(abdVendavel).toBeCloseTo(10 * 0.3 + 10 * 0.5 + 10 * 0.1, 6);
  });

  it("área vendável = ABP + ABD vendável", () => {
    expect(calcAreaVendavel(70, 2.4)).toBeCloseTo(72.4, 6);
  });
});

describe("Hierarquia de preço — override manual prevalece sempre sobre tudo", () => {
  it("sem override: preço-base ajustado × área vendável + estacionamento + prémio/desconto", () => {
    const u = unidadeBase({ ajusteFaseComercialPct: 0.05, premioDescontoUnidade: 2000 });
    const preco = calcPrecoFinalUnidade(u, 72.4);
    expect(preco).toBeCloseTo(4000 * 1.05 * 72.4 + 15000 + 2000, 2);
  });

  it("com override manual, ignora preço-base, ajuste e prémio — usa só o valor definido", () => {
    const u = unidadeBase({ ajusteFaseComercialPct: 0.2, premioDescontoUnidade: 50000, overrideManualValor: 300000 });
    expect(calcPrecoFinalUnidade(u, 72.4)).toBe(300000);
  });
});

describe("calcularSincronizacao — nunca apaga unidade vendida ou personalizada", () => {
  it("quantidade maior: pede para criar a diferença, nada a remover", () => {
    const existentes = gerarUnidadesDeTipologia(tipologia({}), 10, 0);
    const r = calcularSincronizacao(existentes, 15);
    expect(r.paraCriar).toBe(5);
    expect(r.candidatasARemover).toHaveLength(0);
  });

  it("quantidade menor: só marca como candidatas as unidades disponíveis e não personalizadas", () => {
    const existentes = gerarUnidadesDeTipologia(tipologia({}), 5, 0);
    existentes[0].estadoComercial = "vendido";
    existentes[1].personalizada = true;
    const r = calcularSincronizacao(existentes, 2);
    // 5 -> 2: precisa remover 3, mas só 3 das 5 estão livres (as outras 2 estão vendida/personalizada)
    expect(r.candidatasARemover).toHaveLength(3);
    expect(r.bloqueadasParaRemover).toHaveLength(2);
    expect(r.candidatasARemover.every((u) => u.estadoComercial === "disponivel" && !u.personalizada)).toBe(true);
  });

  it("nunca inclui uma unidade vendida entre as candidatas a remover, mesmo que a redução seja drástica", () => {
    const existentes = gerarUnidadesDeTipologia(tipologia({}), 3, 0);
    existentes.forEach((u) => (u.estadoComercial = "vendido"));
    const r = calcularSincronizacao(existentes, 0);
    expect(r.candidatasARemover).toHaveLength(0);
    expect(r.bloqueadasParaRemover).toHaveLength(3);
  });
});

describe("validarVenda — nunca vender duas vezes", () => {
  it("permite vender uma unidade disponível", () => {
    expect(validarVenda(unidadeBase({ estadoComercial: "disponivel" })).valido).toBe(true);
  });
  it("rejeita vender uma unidade já vendida", () => {
    const r = validarVenda(unidadeBase({ estadoComercial: "vendido" }));
    expect(r.valido).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});

describe("calcVgvBruto — fonte única do VGV, nunca quantidade × média", () => {
  it("soma os preços finais reais, não uma média multiplicada pela quantidade", () => {
    const t = tipologia({});
    const unidades = gerarUnidadesDeTipologia(t, 3, 0);
    // personaliza uma unidade para um preço muito diferente da média
    unidades[0].overrideManualValor = 999999;
    const resolvidas = resolverSalesTable(unidades, [t]);
    const vgv = calcVgvBruto(resolvidas);
    // se fosse quantidade × média, o resultado seria muito diferente deste
    const somaEsperada = resolvidas.reduce((s, l) => s + l.precoFinal, 0);
    expect(vgv).toBe(somaEsperada);
    expect(resolvidas[0].precoFinal).toBe(999999);
  });
});

describe("calcDataEscrituraDefeito — fim de obra + X meses", () => {
  it("soma corretamente os meses à data de fim de obra", () => {
    expect(calcDataEscrituraDefeito("2027-06-15", 2)).toBe("2027-08-15");
  });
  it("devolve null sem data de fim de obra", () => {
    expect(calcDataEscrituraDefeito("", 2)).toBeNull();
  });
  it("nunca recua no tempo com duração negativa (trata como zero)", () => {
    expect(calcDataEscrituraDefeito("2027-06-15", -3)).toBe("2027-06-15");
  });
});

describe("validarEscrituraUnidade — sinal + reforços nunca ultrapassam o preço final", () => {
  it("válido quando sinal + reforços é menor ou igual ao preço final", () => {
    const r = validarEscrituraUnidade({ sinalValor: 20_000, reforcosValor: 10_000 }, 200_000);
    expect(r.valido).toBe(true);
  });
  it("inválido quando sinal + reforços ultrapassa o preço final", () => {
    const r = validarEscrituraUnidade({ sinalValor: 150_000, reforcosValor: 100_000 }, 200_000);
    expect(r.valido).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});

describe("calcValorEscrituraUnidade — valor da escritura é sempre o residual", () => {
  it("preço final menos sinal e reforços", () => {
    expect(calcValorEscrituraUnidade({ sinalValor: 20_000, reforcosValor: 10_000 }, 200_000)).toBe(170_000);
  });
  it("nunca negativo, mesmo que sinal+reforços ultrapasse o preço (situação já assinalada como inválida)", () => {
    expect(calcValorEscrituraUnidade({ sinalValor: 150_000, reforcosValor: 100_000 }, 200_000)).toBe(0);
  });
});

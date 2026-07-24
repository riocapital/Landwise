import { describe, it, expect } from "vitest";
import {
  calcAbcPrincipal,
  calcAbcTotalEstimado,
  calcAbpProgramado,
  calcAreaDependenteProgramada,
  calcAbcTotalProgramado,
  calcEficiencia,
  calcDivergenciaAbp,
  calcAreaVendavelEquivalenteUnidade,
  calcAreaVendavelEquivalenteTotal,
  calcReceitaUnidade,
  calcReceitaTipologia,
  calcReceitaTotalPrograma,
  calcResumoPrograma,
  validateTypologies,
  validateAbpConciliacao,
  type Typology,
} from "./areas";

function makeTypology(overrides: Partial<Typology> = {}): Typology {
  return {
    id: "t1",
    nome: "T2",
    quantidade: 10,
    abpUnidade: 100,
    varandaM2: 20,
    varandaPctValorizacao: 0.3,
    terracoM2: 0,
    terracoPctValorizacao: 0,
    jardimPrivativoM2: 0,
    jardimPctValorizacao: 0,
    arrecadacaoM2: 5,
    arrecadacaoPctValorizacao: 0.5,
    estacionamentosIncluidos: 1,
    valorEstacionamento: 15000,
    precoBaseM2: 4000,
    metodoPrecificacao: "abp_mais_coeficientes",
    mesesParaPrimeiraVenda: 0,
    unidadesPorMes: 1,
    ...overrides,
  };
}

describe("ABC Principal / ABC Total (secção 8 da revisão estrutural)", () => {
  it("ABC principal = acima + abaixo do solo", () => {
    expect(calcAbcPrincipal(1000, 300)).toBe(1300);
    expect(calcAbcPrincipal(null, 300)).toBe(300);
    expect(calcAbcPrincipal(null, null)).toBe(0);
  });

  it("ABC Total estimado usa a ABD estimada da identificação", () => {
    const abcTotal = calcAbcTotalEstimado({
      abcAcimaSolo: 1000,
      abcAbaixoSolo: 300,
      areaDependenteEstimada: 150,
      abpEstimada: 900,
      areaImplantacao: null,
      areaJardinsExteriores: null,
      areaDemolicao: null,
    });
    expect(abcTotal).toBe(1450);
  });
});

describe("Programa: ABP, área dependente, ABC Total programado, eficiência", () => {
  const typologies = [makeTypology({ quantidade: 10, abpUnidade: 100 }), makeTypology({ quantidade: 5, abpUnidade: 150, nome: "T3" })];

  it("ABP programada = soma (quantidade × ABP unidade)", () => {
    expect(calcAbpProgramado(typologies)).toBe(10 * 100 + 5 * 150); // 1750
  });

  it("Área dependente programada soma varanda+terraço+jardim+arrecadação físicas", () => {
    // cada unidade: 20 (varanda) + 0 (terraço) + 0 (jardim) + 5 (arrecadação) = 25
    expect(calcAreaDependenteProgramada(typologies)).toBe(25 * 15); // 375
  });

  it("ABC Total programado = ABC principal + área dependente programada", () => {
    expect(calcAbcTotalProgramado(1000, 300, typologies)).toBe(1300 + 375);
  });

  it("Eficiência = ABP total / ABC Total", () => {
    const abcTotal = calcAbcTotalProgramado(1000, 300, typologies);
    const abp = calcAbpProgramado(typologies);
    expect(calcEficiencia(abp, abcTotal)).toBeCloseTo(1750 / 1675, 6);
  });

  it("Eficiência devolve null quando ABC Total é zero (nunca Infinity)", () => {
    expect(calcEficiencia(100, 0)).toBeNull();
  });
});

describe("Divergência entre ABP estimada e ABP programada", () => {
  it("calcula diferença absoluta e percentual corretamente", () => {
    const typologies = [makeTypology({ quantidade: 10, abpUnidade: 100 })]; // ABP calculada = 1000
    const { abpCalculada, diferencaAbsoluta, diferencaPercentual } = calcDivergenciaAbp(900, typologies);
    expect(abpCalculada).toBe(1000);
    expect(diferencaAbsoluta).toBe(100);
    expect(diferencaPercentual).toBeCloseTo(100 / 900, 6);
  });

  it("validateAbpConciliacao não alerta quando a diferença é irrelevante", () => {
    const typologies = [makeTypology({ quantidade: 1, abpUnidade: 100 })];
    expect(validateAbpConciliacao(100, typologies)).toBeNull();
  });

  it("validateAbpConciliacao alerta quando a diferença é relevante", () => {
    const typologies = [makeTypology({ quantidade: 10, abpUnidade: 100 })]; // 1000 vs 900
    const issue = validateAbpConciliacao(900, typologies);
    expect(issue).not.toBeNull();
    expect(issue?.nivel).toBe("alerta");
  });
});

describe("Área vendável equivalente — nunca valoriza a área dependente duas vezes", () => {
  it("unidade = ABP + varanda×% + terraço×% + jardim×% + arrecadação×%, sem estacionamento", () => {
    const t = makeTypology({
      abpUnidade: 100,
      varandaM2: 20,
      varandaPctValorizacao: 0.3, // +6
      terracoM2: 10,
      terracoPctValorizacao: 0.5, // +5
      jardimPrivativoM2: 0,
      arrecadacaoM2: 5,
      arrecadacaoPctValorizacao: 0.5, // +2.5
    });
    expect(calcAreaVendavelEquivalenteUnidade(t)).toBeCloseTo(100 + 6 + 5 + 0 + 2.5, 6);
  });

  it("total = soma (área vendável unidade × quantidade)", () => {
    const typologies = [makeTypology({ quantidade: 4, abpUnidade: 100, varandaM2: 10, varandaPctValorizacao: 0.5, arrecadacaoM2: 0 })];
    // área vendável unidade = 100 + 5 = 105 -> total = 420
    expect(calcAreaVendavelEquivalenteTotal(typologies)).toBeCloseTo(420, 6);
  });
});

describe("Receita por unidade / tipologia / total", () => {
  it("método abp_mais_coeficientes: área vendável × preço + estacionamentos", () => {
    const t = makeTypology({
      abpUnidade: 100,
      varandaM2: 20,
      varandaPctValorizacao: 0.3,
      arrecadacaoM2: 0,
      precoBaseM2: 4000,
      estacionamentosIncluidos: 1,
      valorEstacionamento: 15000,
      metodoPrecificacao: "abp_mais_coeficientes",
    });
    // área vendável = 106; receita = 106*4000 + 15000 = 439000
    expect(calcReceitaUnidade(t)).toBeCloseTo(106 * 4000 + 15000, 6);
  });

  it("método manual_por_unidade ignora a área e usa o valor informado", () => {
    const t = makeTypology({ metodoPrecificacao: "manual_por_unidade", precoManualUnidade: 500000 });
    expect(calcReceitaUnidade(t)).toBe(500000);
  });

  it("receita da tipologia = receita unidade × quantidade", () => {
    const t = makeTypology({ quantidade: 3, metodoPrecificacao: "manual_por_unidade", precoManualUnidade: 100000 });
    expect(calcReceitaTipologia(t)).toBe(300000);
  });

  it("receita total do programa soma todas as tipologias", () => {
    const typologies = [
      makeTypology({ quantidade: 2, metodoPrecificacao: "manual_por_unidade", precoManualUnidade: 100000 }),
      makeTypology({ quantidade: 3, metodoPrecificacao: "manual_por_unidade", precoManualUnidade: 200000 }),
    ];
    expect(calcReceitaTotalPrograma(typologies)).toBe(2 * 100000 + 3 * 200000);
  });
});

describe("Resumo do programa", () => {
  it("agrega unidades, áreas, ABC Total, receita e preço médio ponderado", () => {
    const typologies = [makeTypology({ quantidade: 10, abpUnidade: 100, precoBaseM2: 4000 })];
    const resumo = calcResumoPrograma(typologies, 1000, 200);

    expect(resumo.totalUnidades).toBe(10);
    expect(resumo.abpTotal).toBe(1000);
    expect(resumo.abcTotal).toBe(1000 + 200 + resumo.areaDependenteTotal);
    expect(resumo.precoMedioUnidade).toBeCloseTo(resumo.receitaTotal / 10, 6);
    expect(resumo.precoMedioPonderadoM2).toBeCloseTo(resumo.receitaTotal / resumo.areaVendavelEquivalenteTotal, 6);
  });
});

describe("Validações", () => {
  it("alerta quando não há unidades no programa", () => {
    const issues = validateTypologies([]);
    expect(issues.some((i) => i.campo === "tipologias")).toBe(true);
  });

  it("erro quando a quantidade é negativa ou não inteira", () => {
    const issues = validateTypologies([makeTypology({ quantidade: -1 })]);
    expect(issues.some((i) => i.nivel === "erro" && i.campo.includes("quantidade"))).toBe(true);
  });

  it("erro quando a percentagem de valorização está fora de 0-100%", () => {
    const issues = validateTypologies([makeTypology({ varandaPctValorizacao: 1.5 })]);
    expect(issues.some((i) => i.nivel === "erro" && i.campo.includes("pct"))).toBe(true);
  });

  it("erro quando o preço por m² é negativo", () => {
    const issues = validateTypologies([makeTypology({ precoBaseM2: -100 })]);
    expect(issues.some((i) => i.campo.includes("precoBaseM2"))).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  calcLucroEconomico,
  calcLucroTributavelEstimado,
  calcSeguro,
  calcIMI,
  obterTaxaIRCReferencia,
  resolverTaxaIRC,
  calcLucroTributavel,
  calcIRC,
  calcIRCComRegime,
  calcDerramaMunicipal,
  calcDerramaEstadual,
  calcImpostosAquisicao,
  agregarIVAConsolidado,
  CONFIGURACAO_IRC_REFERENCIA,
} from "./impostos";
import type { LinhaCustoResolvida } from "./custos";

describe("Seguro", () => {
  it("calcula valor anual e total a partir da base escolhida", () => {
    const r = calcSeguro(0.002, "valor_aquisicao", 1_000_000, 3);
    expect(r.valorAnual).toBe(2000);
    expect(r.valorTotal).toBe(6000);
  });

  it("valor_fixo ignora a base e usa o valor diretamente", () => {
    const r = calcSeguro(0, "valor_fixo", 1500, 2);
    expect(r.valorAnual).toBe(1500);
    expect(r.valorTotal).toBe(3000);
  });
});

describe("IMI — incide sobre o VPT, nunca sobre aquisição ou GDV (secção 10 do plano)", () => {
  it("usa o VPT como base, não o valor de aquisição", () => {
    const vpt = 300_000;
    const valorAquisicao = 900_000; // muito diferente do VPT — se o motor usasse isto por engano, o teste falhava
    const r = calcIMI(vpt, 0.003, 1);
    expect(r.valorAnual).toBe(vpt * 0.003);
    expect(r.valorAnual).not.toBe(valorAquisicao * 0.003);
  });

  it("valor total multiplica pelo número de anos", () => {
    const r = calcIMI(300_000, 0.003, 5);
    expect(r.valorTotal).toBe(300_000 * 0.003 * 5);
  });
});

describe("IRC — configuração anual atualizável, nunca hardcoded", () => {
  it("usa a taxa exata do ano configurado", () => {
    expect(obterTaxaIRCReferencia(2026)).toBe(0.19);
    expect(obterTaxaIRCReferencia(2027)).toBe(0.18);
  });

  it("usa o último ano configurado para anos posteriores ('2028 em diante')", () => {
    expect(obterTaxaIRCReferencia(2030)).toBe(0.17);
    expect(obterTaxaIRCReferencia(2050)).toBe(0.17);
  });

  it("a configuração de referência não é alterada por engano nos testes (imutabilidade do array original)", () => {
    expect(CONFIGURACAO_IRC_REFERENCIA.length).toBe(3);
  });

  it("resolverTaxaIRC usa a referência quando não há taxa manual", () => {
    const r = resolverTaxaIRC(2026);
    expect(r.taxa).toBe(0.19);
    expect(r.taxaManualAplicada).toBe(false);
  });

  it("resolverTaxaIRC sinaliza 'Taxa manual aplicada' quando a taxa manual difere da referência", () => {
    const r = resolverTaxaIRC(2026, 0.21);
    expect(r.taxa).toBe(0.21);
    expect(r.taxaManualAplicada).toBe(true);
  });

  it("resolverTaxaIRC não sinaliza manual quando a taxa fornecida é igual à referência", () => {
    const r = resolverTaxaIRC(2026, 0.19);
    expect(r.taxaManualAplicada).toBe(false);
  });
});

describe("Lucro tributável e IRC", () => {
  it("deduz prejuízos fiscais acumulados, nunca fica negativo", () => {
    expect(calcLucroTributavel(100_000, 40_000)).toBe(60_000);
    expect(calcLucroTributavel(30_000, 40_000)).toBe(0);
  });

  it("IRC = lucro tributável × taxa", () => {
    expect(calcIRC(100_000, 0.19)).toBe(19_000);
  });
});

describe("IRC por regime — correções 29/07", () => {
  it("PME/Small Mid Cap aplica 15% apenas aos primeiros 50 mil e 19% ao excedente", () => {
    const r = calcIRCComRegime(55_000, 0.19, "pme_small_mid_cap");
    expect(r.parcelaTaxaReduzida).toBe(50_000);
    expect(r.parcelaTaxaGeral).toBe(5_000);
    expect(r.imposto).toBeCloseTo(50_000 * 0.15 + 5_000 * 0.19, 6);
  });

  it("regime geral aplica a taxa geral a todo o lucro tributável", () => {
    const r = calcIRCComRegime(55_000, 0.19, "geral");
    expect(r.imposto).toBeCloseTo(55_000 * 0.19, 6);
    expect(r.parcelaTaxaReduzida).toBe(0);
  });
});

describe("Derrama municipal — independente da derrama estadual", () => {
  it("aplica a taxa diretamente sobre o lucro tributável", () => {
    expect(calcDerramaMunicipal(100_000, 0.015)).toBe(1500);
  });
});

describe("Derrama estadual — progressiva por escalões, nunca misturada com a taxa-base de IRC", () => {
  it("não aplica nada abaixo do primeiro escalão", () => {
    expect(calcDerramaEstadual(1_000_000)).toBe(0);
  });

  it("aplica só à parcela dentro de cada escalão, não à taxa mais alta sobre tudo", () => {
    // 2.000.000: 500.000 no 1º escalão (1.5M-7.5M) a 3% = 15.000
    const r = calcDerramaEstadual(2_000_000);
    expect(r).toBeCloseTo(500_000 * 0.03, 6);
  });

  it("soma corretamente através de vários escalões", () => {
    // 10.000.000: (7.5M-1.5M)=6M a 3% + (10M-7.5M)=2.5M a 5%
    const r = calcDerramaEstadual(10_000_000);
    expect(r).toBeCloseTo(6_000_000 * 0.03 + 2_500_000 * 0.05, 2);
  });
});

describe("IMT e Imposto de Selo da aquisição", () => {
  it("calcula IMT por percentagem da aquisição", () => {
    const r = calcImpostosAquisicao(1_000_000, "percentagem", 0.065, 0.008);
    expect(r.imt).toBe(65_000);
    expect(r.imposeloAquisicao).toBe(8_000);
  });

  it("permite substituição manual do valor de IMT", () => {
    const r = calcImpostosAquisicao(1_000_000, "valor_manual", 50_000, 0.008);
    expect(r.imt).toBe(50_000);
  });
});

describe("IVA consolidado — sempre calculado a partir dos custos, nunca preenchido de novo", () => {
  function linhaCustoResolvida(overrides: Partial<LinhaCustoResolvida>): LinhaCustoResolvida {
    return {
      id: Math.random().toString(36),
      grupo: "hard_cost",
      categoria: "x",
      nome: "x",
      tipoCalculo: "valor_fixo",
      valorInput: 0,
      baseReferenciaCustoId: null,
      taxaIva: 0.23,
      ivaRecuperavelPct: 1,
      dataIvaRecuperacao: null,
      dataInicial: null,
      duracaoMeses: null,
      dataFinal: null,
      perfilDesembolso: "linear",
      valorResolvido: 10_000,
      custoSemIva: 10_000,
      ivaSuportado: 2300,
      ivaRecuperavel: 2300,
      ivaNaoRecuperavel: 0,
      ...overrides,
    };
  }

  it("soma o IVA suportado, recuperável e não recuperável de todas as linhas", () => {
    const linhas = [
      linhaCustoResolvida({ ivaSuportado: 2300, ivaRecuperavel: 2300, ivaNaoRecuperavel: 0 }),
      linhaCustoResolvida({ ivaSuportado: 300, ivaRecuperavel: 0, ivaNaoRecuperavel: 300 }),
    ];
    const resumo = agregarIVAConsolidado(linhas, "2026-12-31");
    expect(resumo.ivaSuportado).toBe(2600);
    expect(resumo.ivaRecuperavel).toBe(2300);
    expect(resumo.ivaNaoRecuperavel).toBe(300);
  });

  it("só considera 'recuperado' o IVA cuja data de recuperação já passou face à data de referência", () => {
    const linhas = [
      linhaCustoResolvida({ ivaRecuperavel: 1000, dataIvaRecuperacao: "2026-01-15" }), // já passou
      linhaCustoResolvida({ ivaRecuperavel: 2000, dataIvaRecuperacao: "2027-06-01" }), // ainda não
    ];
    const resumo = agregarIVAConsolidado(linhas, "2026-12-31");
    expect(resumo.ivaRecuperado).toBe(1000);
    expect(resumo.saldoIva).toBe(2000);
  });
});

describe("calcLucroEconomico — secção 29 do plano", () => {
  it("VGV Bruto − comissão comercial − custos económicos", () => {
    expect(calcLucroEconomico(1_000_000, 30_000, 600_000)).toBe(370_000);
  });
});

describe("calcLucroTributavelEstimado — nunca igual ao lucro económico por omissão", () => {
  it("subtrai cada componente dedutível separadamente, soma os ajustes", () => {
    const lucroTributavel = calcLucroTributavelEstimado({
      receitasReconhecidas: 1_000_000,
      custosFiscalmenteConsiderados: 500_000,
      comissaoDedutivel: 30_000,
      feesDedutiveis: 20_000,
      custosFinanceirosDedutiveis: 15_000,
      ajustesFiscais: 5_000,
    });
    expect(lucroTributavel).toBe(1_000_000 - 500_000 - 30_000 - 20_000 - 15_000 + 5_000);
  });

  it("pode ser diferente do lucro económico quando os custos fiscalmente aceites divergem dos económicos", () => {
    const lucroEconomico = calcLucroEconomico(1_000_000, 30_000, 400_000); // 570_000
    const lucroTributavel = calcLucroTributavelEstimado({
      receitasReconhecidas: 1_000_000,
      custosFiscalmenteConsiderados: 350_000, // parte dos custos económicos não é fiscalmente aceite
      comissaoDedutivel: 30_000,
      feesDedutiveis: 0,
      custosFinanceirosDedutiveis: 0,
      ajustesFiscais: 0,
    });
    expect(lucroTributavel).not.toBe(lucroEconomico);
  });

  it("pode ser negativo antes de calcLucroTributavel aplicar o limite final a zero", () => {
    const lucroTributavel = calcLucroTributavelEstimado({
      receitasReconhecidas: 100_000,
      custosFiscalmenteConsiderados: 200_000,
      comissaoDedutivel: 0,
      feesDedutiveis: 0,
      custosFinanceirosDedutiveis: 0,
      ajustesFiscais: 0,
    });
    expect(lucroTributavel).toBeLessThan(0);
    expect(calcLucroTributavel(lucroTributavel, 0)).toBe(0); // nunca negativo no valor final
  });
});

import { describe, it, expect } from "vitest";
import { calcScoreComparabilidade, sugerirPreco, type SujeitoComparacao } from "./comparaveis";
import type { MarketComparable } from "./market-comparables-types";

function makeComparable(overrides: Partial<MarketComparable> = {}): MarketComparable {
  return {
    id: Math.random().toString(36),
    source: "Idealista",
    external_id: Math.random().toString(36),
    source_url: null,
    listing_title: null,
    property_type: "Apartamento",
    typology: "T2",
    condition: "Bom estado",
    construction_status: null,
    is_new_construction: false,
    asking_or_transaction: "pedido",
    price: 400000,
    private_area: null,
    gross_area: 90,
    dependent_area: null,
    area_basis: "area_bruta",
    price_per_sqm: 4444,
    address: null,
    postal_code: null,
    zone: "Alvalade",
    locality: null,
    parish: "Alvalade",
    municipality: "Lisboa",
    district: "Lisboa",
    latitude: null,
    longitude: null,
    bedrooms: 2,
    bathrooms: 1,
    parking_spaces: null,
    elevator: true,
    terrace: null,
    balcony: null,
    garden: null,
    floor: null,
    energy_rating: null,
    listing_date: null,
    collection_date: "2026-07-17",
    active: true,
    is_probable_duplicate: false,
    duplicate_group_id: null,
    import_batch_id: null,
    raw_data: null,
    created_at: "2026-07-17T00:00:00Z",
    updated_at: "2026-07-17T00:00:00Z",
    ...overrides,
  };
}

const sujeitoBase: SujeitoComparacao = {
  zone: "Alvalade",
  parish: "Alvalade",
  municipality: "Lisboa",
  propertyType: "Apartamento",
  typology: "T2",
  condition: "Bom estado",
  isNewConstruction: false,
  areaReferencia: 90,
  dataReferencia: new Date("2026-07-17"),
};

describe("calcScoreComparabilidade", () => {
  it("dá score alto a um comparável praticamente idêntico na mesma zona", () => {
    const { score } = calcScoreComparabilidade(sujeitoBase, makeComparable());
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("penaliza zona/freguesia/concelho diferentes", () => {
    const longe = makeComparable({ zone: "Benfica", parish: "Benfica", municipality: "Lisboa" });
    const { score: scorePerto } = calcScoreComparabilidade(sujeitoBase, makeComparable());
    const { score: scoreLonge } = calcScoreComparabilidade(sujeitoBase, longe);
    expect(scoreLonge).toBeLessThan(scorePerto);
  });

  it("redistribui pesos quando o sujeito não tem tipologia nem área de referência", () => {
    const sujeitoSemTipologiaAreas: SujeitoComparacao = {
      ...sujeitoBase,
      typology: null,
      areaReferencia: null,
    };
    const { score } = calcScoreComparabilidade(sujeitoSemTipologiaAreas, makeComparable());
    // não deve ser zero nem lançar erro — os restantes critérios assumem o peso todo
    expect(score).toBeGreaterThan(0);
  });

  it("usa a distância geográfica real quando ambos os lados têm lat/long", () => {
    const sujeitoComGps: SujeitoComparacao = { ...sujeitoBase, latitude: 38.75, longitude: -9.13 };
    const perto = makeComparable({ latitude: 38.751, longitude: -9.131 });
    const longe = makeComparable({ latitude: 38.9, longitude: -9.3 });
    const { score: scorePerto } = calcScoreComparabilidade(sujeitoComGps, perto);
    const { score: scoreLonge } = calcScoreComparabilidade(sujeitoComGps, longe);
    expect(scorePerto).toBeGreaterThan(scoreLonge);
  });
});

describe("sugerirPreco", () => {
  it("devolve 'Amostra insuficiente' quando há poucos comparáveis relevantes", () => {
    const resultado = sugerirPreco(sujeitoBase, [makeComparable(), makeComparable()]);
    expect(resultado.nivelConfianca).toBe("Amostra insuficiente");
  });

  it("usa a mediana, não a média simples, e nunca inclui comparáveis inativos", () => {
    const pool = [
      ...Array.from({ length: 8 }, () => makeComparable({ price_per_sqm: 4000 + Math.random() * 200 })),
      makeComparable({ price_per_sqm: 50000, active: false }), // outlier inativo — nunca deve entrar
    ];
    const resultado = sugerirPreco(sujeitoBase, pool);
    expect(resultado.numeroComparaveis).toBeLessThanOrEqual(8);
    expect(resultado.medianaM2).toBeLessThan(10000);
  });

  it("remove outliers extremos antes de calcular a mediana", () => {
    const pool = [
      ...Array.from({ length: 10 }, () => makeComparable({ price_per_sqm: 4000 })),
      makeComparable({ price_per_sqm: 100000 }), // outlier extremo, mesma zona/tipologia
    ];
    const resultado = sugerirPreco(sujeitoBase, pool);
    expect(resultado.medianaM2).toBeLessThan(5000);
  });

  it("deduplica por duplicate_group_id — mantém só o melhor de cada grupo na estatística", () => {
    const pool = [
      makeComparable({ duplicate_group_id: "DUP-01", price_per_sqm: 4000 }),
      makeComparable({ duplicate_group_id: "DUP-01", price_per_sqm: 4000 }), // mesmo imóvel, outro portal
      ...Array.from({ length: 6 }, () => makeComparable({ price_per_sqm: 4000 })),
    ];
    const resultado = sugerirPreco(sujeitoBase, pool);
    // 1 (do grupo DUP-01, deduplicado) + 6 sem grupo = 7, nunca 8
    expect(resultado.numeroComparaveis).toBe(7);
  });

  it("nunca marca a base de área como identificada quando os comparáveis usados têm bases diferentes", () => {
    const pool = [
      ...Array.from({ length: 5 }, () => makeComparable({ area_basis: "area_bruta" })),
      ...Array.from({ length: 5 }, () => makeComparable({ area_basis: "nao_identificada" })),
    ];
    const resultado = sugerirPreco(sujeitoBase, pool);
    expect(resultado.baseAreaUtilizada).toBe("misto/não identificado");
  });

  it("com amostra grande e base de área consistente, a confiança é Alta", () => {
    const pool = Array.from({ length: 25 }, () => makeComparable({ area_basis: "area_bruta", price_per_sqm: 4200 }));
    const resultado = sugerirPreco(sujeitoBase, pool);
    expect(resultado.nivelConfianca).toBe("Alta");
  });
});

// --- Garagem/elevador/piso (secção 9 do plano 03_08 — achado P1.3) ---

describe("calcScoreComparabilidade — garagem, elevador e piso", () => {
  it("comparável com o mesmo perfil de garagem/elevador/piso pontua mais alto do que um totalmente divergente nesses atributos", () => {
    const sujeito: SujeitoComparacao = { ...sujeitoBase, parkingSpaces: 1, hasElevator: true, floor: "3" };
    const { score: scoreIgual } = calcScoreComparabilidade(sujeito, makeComparable({ parking_spaces: 2, elevator: true, floor: "3" }));
    const { score: scoreDivergente } = calcScoreComparabilidade(sujeito, makeComparable({ parking_spaces: 0, elevator: false, floor: "0" }));
    expect(scoreIgual).toBeGreaterThan(scoreDivergente);
  });

  it("garagem compara Sim/Não, nunca a contagem exata de lugares", () => {
    const sujeito: SujeitoComparacao = { ...sujeitoBase, parkingSpaces: 1 };
    const { score: score1Lugar } = calcScoreComparabilidade(sujeito, makeComparable({ parking_spaces: 1 }));
    const { score: score3Lugares } = calcScoreComparabilidade(sujeito, makeComparable({ parking_spaces: 3 }));
    expect(score1Lugar).toBe(score3Lugares); // ambos "tem garagem" — mesmo score nesse critério
  });

  it("nunca penaliza quando o dado falta de um dos lados — score neutro no critério", () => {
    const sujeito: SujeitoComparacao = { ...sujeitoBase, parkingSpaces: 1, hasElevator: true, floor: "3" };
    const semDados = calcScoreComparabilidade(sujeito, makeComparable({ parking_spaces: null, elevator: null, floor: null }));
    const comDadosIguais = calcScoreComparabilidade(sujeito, makeComparable({ parking_spaces: 1, elevator: true, floor: "3" }));
    // Sem dados no comparável, o critério "atributos" fica neutro (não
    // penaliza) — o score não deve cair abaixo do que teria com o critério
    // simplesmente ausente da comparação.
    expect(semDados.score).toBeGreaterThanOrEqual(comDadosIguais.score - 20);
  });
});

describe("sugerirPreco — amostra exata vs ampliada", () => {
  it("amostra 100% exata quando todos os comparáveis batem tipologia + garagem + elevador + piso pedidos", () => {
    const sujeito: SujeitoComparacao = { ...sujeitoBase, parkingSpaces: 1, hasElevator: true, floor: "3" };
    const pool = Array.from({ length: 10 }, () =>
      makeComparable({ typology: "T2", parking_spaces: 1, elevator: true, floor: "3", price_per_sqm: 4200 })
    );
    const resultado = sugerirPreco(sujeito, pool);
    expect(resultado.amostraExata).toBe(resultado.numeroComparaveis);
    expect(resultado.amostraAmpliada).toBe(0);
    expect(resultado.criteriosRelaxados).toEqual([]);
  });

  it("amostra ampliada e criteriosRelaxados preenchido quando parte dos comparáveis só entra sem garagem", () => {
    const sujeito: SujeitoComparacao = { ...sujeitoBase, parkingSpaces: 1 };
    const pool = [
      ...Array.from({ length: 5 }, () => makeComparable({ typology: "T2", parking_spaces: 1, price_per_sqm: 4200 })),
      ...Array.from({ length: 5 }, () => makeComparable({ typology: "T2", parking_spaces: 0, price_per_sqm: 4200 })),
    ];
    const resultado = sugerirPreco(sujeito, pool);
    expect(resultado.amostraAmpliada).toBeGreaterThan(0);
    expect(resultado.criteriosRelaxados).toContain("garagem");
  });

  it("amostra maioritariamente ampliada nunca chega a confiança Alta, mesmo com muitos comparáveis", () => {
    const sujeito: SujeitoComparacao = { ...sujeitoBase, parkingSpaces: 1, hasElevator: true };
    const pool = [
      ...Array.from({ length: 3 }, () => makeComparable({ typology: "T2", parking_spaces: 1, elevator: true, area_basis: "area_bruta", price_per_sqm: 4200 })),
      ...Array.from({ length: 20 }, () => makeComparable({ typology: "T2", parking_spaces: 0, elevator: false, area_basis: "area_bruta", price_per_sqm: 4200 })),
    ];
    const resultado = sugerirPreco(sujeito, pool);
    expect(resultado.amostraAmpliada).toBeGreaterThan(resultado.amostraExata);
    expect(resultado.nivelConfianca).not.toBe("Alta");
  });

  it("nunca aplica prémio/desconto por causa de atributos — a sugestão continua a ser só a mediana de preço/m²", () => {
    const sujeito: SujeitoComparacao = { ...sujeitoBase, parkingSpaces: 1 };
    const pool = Array.from({ length: 10 }, () => makeComparable({ typology: "T2", parking_spaces: Math.random() > 0.5 ? 1 : 0, price_per_sqm: 4000 }));
    const resultado = sugerirPreco(sujeito, pool);
    expect(resultado.precoSugeridoM2).toBe(4000); // preço nunca ajustado por garagem — só a mediana real dos comparáveis
  });
});

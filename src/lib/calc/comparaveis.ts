// Motor de sugestão de preço por comparáveis — Landwise, Fase 3
//
// Função pura: recebe o "sujeito" (a tipologia/unidade do projeto a
// precificar) e um conjunto de comparáveis já carregados do Supabase, e
// devolve uma sugestão com nível de confiança. NUNCA decide sozinho o preço
// final — o preço manual do utilizador nunca é substituído automaticamente
// (secção 4 do plano).

import type { MarketComparable } from "./market-comparables-types";

export type SujeitoComparacao = {
  zone: string | null;
  parish: string | null;
  municipality: string | null;
  propertyType: string | null;
  typology: string | null;
  condition: string | null;
  isNewConstruction: boolean | null;
  areaReferencia: number | null; // m² a usar como referência (ABP ou área vendável equivalente)
  latitude?: number | null;
  longitude?: number | null;
  dataReferencia?: Date;
};

export type PesosScore = {
  localizacao: number; // zona/freguesia/concelho
  distancia: number; // distância geográfica (lat/long), quando disponível
  estado: number; // estado/situação de construção
  tipologiaArea: number; // tipologia + área semelhante
  recencia: number; // data de recolha
};

export const PESOS_PADRAO: PesosScore = {
  localizacao: 0.35,
  distancia: 0.2,
  estado: 0.2,
  tipologiaArea: 0.15,
  recencia: 0.1,
};

export type ComparavelComScore = {
  comparavel: MarketComparable;
  score: number; // 0-100
  distanciaKm: number | null;
};

// --- Distância geográfica (haversine) — só quando ambos têm lat/long ---
function distanciaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Score de proximidade geográfica de 0 a 1.
 * Com coordenadas em ambos os lados: decai suavemente até 10 km.
 * Sem coordenadas (caso comum nesta base — a fonte não tem lat/long):
 * usa a hierarquia zona > freguesia > concelho como aproximação, para que
 * o critério "distância" nunca fique simplesmente a zero por falta de GPS.
 */
function scoreProximidade(sujeito: SujeitoComparacao, c: MarketComparable): { score: number; distanciaKm: number | null } {
  if (sujeito.latitude != null && sujeito.longitude != null && c.latitude != null && c.longitude != null) {
    const km = distanciaHaversineKm(sujeito.latitude, sujeito.longitude, c.latitude, c.longitude);
    const score = Math.max(0, 1 - km / 10); // 0 km -> 1.0 ; >=10km -> 0
    return { score, distanciaKm: Number(km.toFixed(2)) };
  }
  if (sujeito.zone && c.zone && sujeito.zone === c.zone) return { score: 1, distanciaKm: null };
  if (sujeito.parish && c.parish && sujeito.parish === c.parish) return { score: 0.7, distanciaKm: null };
  if (sujeito.municipality && c.municipality && sujeito.municipality === c.municipality)
    return { score: 0.4, distanciaKm: null };
  return { score: 0, distanciaKm: null };
}

function scoreLocalizacao(sujeito: SujeitoComparacao, c: MarketComparable): number {
  if (sujeito.zone && c.zone && sujeito.zone === c.zone) return 1;
  if (sujeito.parish && c.parish && sujeito.parish === c.parish) return 0.75;
  if (sujeito.municipality && c.municipality && sujeito.municipality === c.municipality) return 0.4;
  return 0;
}

function scoreEstado(sujeito: SujeitoComparacao, c: MarketComparable): number {
  if (!sujeito.condition || !c.condition || c.condition === "Desconhecido") return 0.3; // neutro, não penaliza nem beneficia
  if (sujeito.condition === c.condition) return 1;
  if (sujeito.isNewConstruction != null && c.is_new_construction != null) {
    return sujeito.isNewConstruction === c.is_new_construction ? 0.6 : 0.2;
  }
  return 0.4;
}

function scoreTipologiaArea(sujeito: SujeitoComparacao, c: MarketComparable): number {
  let score = 0;
  if (sujeito.typology && c.typology && sujeito.typology === c.typology) score += 0.6;
  else if (sujeito.propertyType && c.property_type && sujeito.propertyType === c.property_type) score += 0.2;

  const areaComparavel = c.private_area ?? c.gross_area;
  if (sujeito.areaReferencia && areaComparavel) {
    const diffPct = Math.abs(areaComparavel - sujeito.areaReferencia) / sujeito.areaReferencia;
    // tolerância: dentro de 15% => score cheio da parte de área; decai até 50%
    const scoreArea = Math.max(0, 1 - diffPct / 0.5);
    score += 0.4 * scoreArea;
  }
  return Math.min(1, score);
}

function scoreRecencia(sujeito: SujeitoComparacao, c: MarketComparable): number {
  const dataRef = sujeito.dataReferencia ?? new Date();
  if (!c.collection_date) return 0.3; // neutro quando não há data
  const diasDiferenca = Math.abs(dataRef.getTime() - new Date(c.collection_date).getTime()) / (1000 * 60 * 60 * 24);
  // decai até 365 dias
  return Math.max(0, 1 - diasDiferenca / 365);
}

/**
 * Calcula o score de comparabilidade (0-100) de UM comparável face ao
 * sujeito, redistribuindo os pesos dos critérios cujos dados estão em
 * falta em qualquer um dos dois lados (secção 4 do plano).
 */
export function calcScoreComparabilidade(
  sujeito: SujeitoComparacao,
  c: MarketComparable,
  pesos: PesosScore = PESOS_PADRAO
): { score: number; distanciaKm: number | null } {
  const proximidade = scoreProximidade(sujeito, c);

  const criterios: { peso: number; score: number; disponivel: boolean }[] = [
    { peso: pesos.localizacao, score: scoreLocalizacao(sujeito, c), disponivel: Boolean(sujeito.zone || sujeito.parish || sujeito.municipality) },
    { peso: pesos.distancia, score: proximidade.score, disponivel: true }, // sempre disponível (tem fallback hierárquico)
    { peso: pesos.estado, score: scoreEstado(sujeito, c), disponivel: true },
    { peso: pesos.tipologiaArea, score: scoreTipologiaArea(sujeito, c), disponivel: Boolean(sujeito.typology || sujeito.areaReferencia) },
    { peso: pesos.recencia, score: scoreRecencia(sujeito, c), disponivel: true },
  ];

  const pesoTotalDisponivel = criterios.filter((c) => c.disponivel).reduce((s, c) => s + c.peso, 0);
  if (pesoTotalDisponivel === 0) return { score: 0, distanciaKm: proximidade.distanciaKm };

  const somaPonderada = criterios
    .filter((c) => c.disponivel)
    .reduce((s, c) => s + c.score * (c.peso / pesoTotalDisponivel), 0);

  return { score: Math.round(somaPonderada * 100), distanciaKm: proximidade.distanciaKm };
}

// --- Seleção, remoção de outliers e mediana ponderada ---

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

function removerOutliers(valores: number[]): number[] {
  if (valores.length < 4) return valores; // amostra pequena demais para IQR fazer sentido
  const ordenado = [...valores].sort((a, b) => a - b);
  const q1 = ordenado[Math.floor(ordenado.length * 0.25)];
  const q3 = ordenado[Math.floor(ordenado.length * 0.75)];
  const iqr = q3 - q1;
  const min = q1 - 1.5 * iqr;
  const max = q3 + 1.5 * iqr;
  return valores.filter((v) => v >= min && v <= max);
}

export type NivelConfianca = "Alta" | "Média" | "Baixa" | "Amostra insuficiente";

export type SugestaoPreco = {
  precoSugeridoM2: number | null;
  numeroComparaveis: number;
  medianaM2: number | null;
  mediaPonderadaM2: number | null;
  intervaloInferiorM2: number | null;
  intervaloSuperiorM2: number | null;
  distanciaMediaKm: number | null;
  dataMediaRecolha: Date | null;
  nivelConfianca: NivelConfianca;
  baseAreaUtilizada: string | null;
  comparaveisUtilizados: ComparavelComScore[];
};

/**
 * Seleciona e pontua os comparáveis relevantes para o sujeito, a partir de
 * um pool já filtrado por tipo de ativo (o filtro de tipo de ativo é feito
 * antes de chamar esta função, tipicamente na query ao Supabase).
 *
 * - Ordena por score.
 * - Deduplica por grupo de duplicados (mantém só o de maior score/completude
 *   por grupo), para não pesar duas vezes o mesmo imóvel repetido entre
 *   portais — conforme a metodologia da base de comparáveis.
 * - Usa mediana ponderada pelo score, não uma média simples de toda a base.
 */
export function sugerirPreco(
  sujeito: SujeitoComparacao,
  pool: MarketComparable[],
  opcoes: { pesos?: PesosScore; scoreMinimo?: number; maxComparaveis?: number } = {}
): SugestaoPreco {
  const pesos = opcoes.pesos ?? PESOS_PADRAO;
  const scoreMinimo = opcoes.scoreMinimo ?? 30;
  const maxComparaveis = opcoes.maxComparaveis ?? 60;

  const candidatosAtivos = pool.filter((c) => c.active && c.price_per_sqm && c.price_per_sqm > 0);

  const pontuados: ComparavelComScore[] = candidatosAtivos.map((c) => {
    const { score, distanciaKm } = calcScoreComparabilidade(sujeito, c, pesos);
    return { comparavel: c, score, distanciaKm };
  });

  // Deduplicação por grupo: mantém apenas o melhor (maior score) de cada
  // duplicate_group_id — nunca descarta da tabela, só da seleção estatística.
  const melhorPorGrupo = new Map<string, ComparavelComScore>();
  const semGrupo: ComparavelComScore[] = [];
  for (const item of pontuados) {
    const grupo = item.comparavel.duplicate_group_id;
    if (!grupo) {
      semGrupo.push(item);
      continue;
    }
    const atual = melhorPorGrupo.get(grupo);
    if (!atual || item.score > atual.score) melhorPorGrupo.set(grupo, item);
  }
  const deduplicado = [...semGrupo, ...melhorPorGrupo.values()];

  const relevantes = deduplicado
    .filter((item) => item.score >= scoreMinimo)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxComparaveis);

  if (relevantes.length === 0) {
    return {
      precoSugeridoM2: null,
      numeroComparaveis: 0,
      medianaM2: null,
      mediaPonderadaM2: null,
      intervaloInferiorM2: null,
      intervaloSuperiorM2: null,
      distanciaMediaKm: null,
      dataMediaRecolha: null,
      nivelConfianca: "Amostra insuficiente",
      baseAreaUtilizada: null,
      comparaveisUtilizados: [],
    };
  }

  const precosM2SemOutliers = removerOutliers(relevantes.map((r) => r.comparavel.price_per_sqm as number));
  const relevantesSemOutliers = relevantes.filter((r) => precosM2SemOutliers.includes(r.comparavel.price_per_sqm as number));

  const medianaM2 = mediana(precosM2SemOutliers);
  const somaScores = relevantesSemOutliers.reduce((s, r) => s + r.score, 0);
  const mediaPonderadaM2 =
    somaScores > 0
      ? relevantesSemOutliers.reduce((s, r) => s + (r.comparavel.price_per_sqm as number) * r.score, 0) / somaScores
      : medianaM2;

  const ordenadoPrecos = [...precosM2SemOutliers].sort((a, b) => a - b);
  const intervaloInferiorM2 = ordenadoPrecos[Math.floor(ordenadoPrecos.length * 0.25)] ?? medianaM2;
  const intervaloSuperiorM2 = ordenadoPrecos[Math.floor(ordenadoPrecos.length * 0.75)] ?? medianaM2;

  const distancias = relevantesSemOutliers.map((r) => r.distanciaKm).filter((d): d is number => d != null);
  const distanciaMediaKm = distancias.length > 0 ? distancias.reduce((s, d) => s + d, 0) / distancias.length : null;

  const datas = relevantesSemOutliers
    .map((r) => r.comparavel.collection_date)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime());
  const dataMediaRecolha = datas.length > 0 ? new Date(datas.reduce((s, d) => s + d, 0) / datas.length) : null;

  // Base de área: só afirma "€/m² ABP" se TODOS os comparáveis usados tiverem
  // essa base identificada com confiança — nunca por maioria (secção 4 do plano).
  const basesArea = new Set(relevantesSemOutliers.map((r) => r.comparavel.area_basis));
  const baseAreaUtilizada = basesArea.size === 1 ? [...basesArea][0] : "misto/não identificado";

  const nivelConfianca = calcNivelConfianca(relevantesSemOutliers.length, basesArea);

  return {
    precoSugeridoM2: Math.round(medianaM2),
    numeroComparaveis: relevantesSemOutliers.length,
    medianaM2: Math.round(medianaM2),
    mediaPonderadaM2: Math.round(mediaPonderadaM2),
    intervaloInferiorM2: Math.round(intervaloInferiorM2),
    intervaloSuperiorM2: Math.round(intervaloSuperiorM2),
    distanciaMediaKm: distanciaMediaKm != null ? Number(distanciaMediaKm.toFixed(1)) : null,
    dataMediaRecolha,
    nivelConfianca,
    baseAreaUtilizada,
    comparaveisUtilizados: relevantesSemOutliers,
  };
}

function calcNivelConfianca(n: number, basesArea: Set<string>): NivelConfianca {
  if (n < 5) return "Amostra insuficiente";
  const baseInconsistente = basesArea.has("nao_identificada") || basesArea.size > 1;
  if (n >= 20 && !baseInconsistente) return "Alta";
  if (n >= 10) return "Média";
  return "Baixa";
}

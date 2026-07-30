// Serviço server-side de localização por código postal português.
// Provedor principal: GEO API PT, usando o endpoint JSON oficial.

export type SugestaoLocalizacao = {
  rua: string | null;
  localidade: string | null;
  freguesia: string | null;
  concelho: string | null;
  distrito: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ResultadoLookupCodigoPostal =
  | { encontrado: true; opcoes: SugestaoLocalizacao[]; fonte: string; consultadoEm: string }
  | { encontrado: false; motivo: "codigo_invalido" | "sem_resultados" | "erro_provedor" };

const REGEX_CP = /^\d{4}-\d{3}$/;

export async function procurarCodigoPostal(codigoPostal: string): Promise<ResultadoLookupCodigoPostal> {
  const cp = codigoPostal.trim();
  if (!REGEX_CP.test(cp)) return { encontrado: false, motivo: "codigo_invalido" };

  // A documentação oficial recomenda json.geoapi.pt para respostas JSON.
  const providerUrl = process.env.LANDWISE_GEOAPI_BASE_URL ?? "https://json.geoapi.pt/cp";

  try {
    const resposta = await fetch(`${providerUrl}/${encodeURIComponent(cp)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400 },
    });

    if (!resposta.ok) return { encontrado: false, motivo: resposta.status === 404 ? "sem_resultados" : "erro_provedor" };

    const dados = await resposta.json();
    const opcoes = deduplicar(normalizarRespostaGeoApi(dados));
    if (opcoes.length === 0) return { encontrado: false, motivo: "sem_resultados" };

    return {
      encontrado: true,
      opcoes,
      fonte: "GEO API PT",
      consultadoEm: new Date().toISOString(),
    };
  } catch {
    return { encontrado: false, motivo: "erro_provedor" };
  }
}

function normalizarRespostaGeoApi(dados: unknown): SugestaoLocalizacao[] {
  if (!dados || typeof dados !== "object") return [];

  if (Array.isArray(dados)) {
    return dados.flatMap((item) => normalizarRespostaGeoApi(item));
  }

  const r = dados as Record<string, unknown>;
  const distrito = texto(r.distrito) ?? textoObj(r.distrito, ["nome", "designacao"]);
  const concelho =
    texto(r.concelho) ??
    texto(r.municipio) ??
    textoObj(r.concelho, ["nome", "designacao"]) ??
    textoObj(r.municipio, ["nome", "designacao"]);
  const localidade = texto(r.localidade) ?? texto(r.designacao_postal) ?? texto(r.designacaoPostal);

  const centro = extrairCentro(r.centro ?? r.center ?? r.coordenadas ?? r.coordinates);
  const latitude = numero(r.latitude) ?? centro.latitude;
  const longitude = numero(r.longitude) ?? centro.longitude;

  const base: SugestaoLocalizacao = {
    rua: texto(r.rua) ?? texto(r.morada) ?? texto(r.arteria) ?? texto(r.artéria),
    localidade,
    freguesia: texto(r.freguesia) ?? textoObj(r.freguesia, ["nome", "designacao"]),
    concelho,
    distrito,
    latitude,
    longitude,
  };

  const colecoes = [r.opcoes, r.moradas, r.arterias, r.artérias, r.freguesias].filter(Array.isArray) as unknown[][];
  if (colecoes.length === 0) return [base];

  const opcoes = colecoes.flat().flatMap((item) => {
    if (typeof item === "string") {
      return [{ ...base, freguesia: base.freguesia ?? item }];
    }
    if (!item || typeof item !== "object") return [];
    const itemNorm = normalizarRespostaGeoApi(item);
    return itemNorm.map((opcao) => ({
      rua: opcao.rua ?? base.rua,
      localidade: opcao.localidade ?? base.localidade,
      freguesia: opcao.freguesia ?? base.freguesia,
      concelho: opcao.concelho ?? base.concelho,
      distrito: opcao.distrito ?? base.distrito,
      latitude: opcao.latitude ?? base.latitude,
      longitude: opcao.longitude ?? base.longitude,
    }));
  });

  return opcoes.length > 0 ? opcoes : [base];
}

function deduplicar(opcoes: SugestaoLocalizacao[]): SugestaoLocalizacao[] {
  const vistos = new Set<string>();
  return opcoes.filter((o) => {
    const temConteudo = Boolean(o.rua || o.localidade || o.freguesia || o.concelho || o.distrito || o.latitude || o.longitude);
    if (!temConteudo) return false;
    const chave = [o.rua, o.localidade, o.freguesia, o.concelho, o.distrito, o.latitude, o.longitude].join("|");
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function textoObj(v: unknown, chaves: string[]): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  for (const chave of chaves) {
    const t = texto(r[chave]);
    if (t) return t;
  }
  return null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function extrairCentro(v: unknown): { latitude: number | null; longitude: number | null } {
  if (Array.isArray(v) && v.length >= 2) {
    return { latitude: numero(v[0]), longitude: numero(v[1]) };
  }
  if (typeof v === "string") {
    const [lat, lon] = v.split(",");
    return { latitude: numero(lat), longitude: numero(lon) };
  }
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    return {
      latitude: numero(r.latitude ?? r.lat ?? r.y),
      longitude: numero(r.longitude ?? r.lon ?? r.lng ?? r.x),
    };
  }
  return { latitude: null, longitude: null };
}

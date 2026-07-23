// Camada de serviço para localização e geocodificação por código postal — Landwise
//
// Corre SEMPRE no servidor (rota API abaixo, nunca importado por componentes
// "use client"). Nenhuma chave de API é usada aqui neste momento: o provedor
// por omissão (geoapi.pt) é aberto e gratuito. Se no futuro for preciso trocar
// para um provedor que exija chave (ex.: cttcodigopostal.pt), a chave deve
// vir de uma variável de ambiente só do lado do servidor (sem prefixo
// NEXT_PUBLIC_) — nunca hardcoded, nunca enviada ao browser.

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
  | { encontrado: true; opcoes: SugestaoLocalizacao[] }
  | { encontrado: false; motivo: "codigo_invalido" | "sem_resultados" | "erro_provedor" };

const REGEX_CP = /^\d{4}-\d{3}$/;

/**
 * Provedor por omissão: geoapi.pt (dados abertos, sem necessidade de chave).
 * Ver https://geoapi.pt/docs/ — endpoint de códigos postais.
 *
 * A função devolve SEMPRE uma lista (0, 1 ou várias moradas para o mesmo
 * código postal), nunca lança exceção para o chamador — falhas de rede ou
 * do provedor são tratadas como "erro_provedor", permitindo à UI cair em
 * preenchimento manual sem bloquear o wizard (regra do plano: "se a consulta
 * não encontrar resultados, não bloquear o projeto").
 */
export async function procurarCodigoPostal(codigoPostal: string): Promise<ResultadoLookupCodigoPostal> {
  const cp = codigoPostal.trim();
  if (!REGEX_CP.test(cp)) {
    return { encontrado: false, motivo: "codigo_invalido" };
  }

  const providerUrl = process.env.LANDWISE_GEOAPI_BASE_URL ?? "https://geoapi.pt/cp";

  try {
    const resposta = await fetch(`${providerUrl}/${cp}`, {
      headers: { Accept: "application/json" },
      // Timeout curto: preferimos cair em preenchimento manual a bloquear o wizard.
      signal: AbortSignal.timeout(4000),
    });

    if (!resposta.ok) {
      return { encontrado: false, motivo: "erro_provedor" };
    }

    const dados = await resposta.json();
    const opcoes = normalizarRespostaGeoApi(dados);

    if (opcoes.length === 0) {
      return { encontrado: false, motivo: "sem_resultados" };
    }
    return { encontrado: true, opcoes };
  } catch {
    return { encontrado: false, motivo: "erro_provedor" };
  }
}

/**
 * Normaliza a resposta do provedor para o formato interno da Landwise.
 * Isolada numa função própria para que trocar de provedor no futuro
 * (ex.: cttcodigopostal.pt) exija só uma nova função de normalização,
 * não mudanças na rota API nem no wizard.
 */
function normalizarRespostaGeoApi(dados: unknown): SugestaoLocalizacao[] {
  if (!dados || typeof dados !== "object") return [];

  // geoapi.pt devolve um objeto com "distrito", "concelho", "freguesias": [...]
  // e, quando aplicável, uma lista de moradas/artérias. Mantemos a normalização
  // tolerante a formatos ligeiramente diferentes por CP4 vs CP4-CP3.
  const registo = dados as Record<string, unknown>;
  const distrito = typeof registo.distrito === "string" ? registo.distrito : null;
  const concelho = typeof registo.concelho === "string" ? registo.concelho : null;

  const freguesias = Array.isArray(registo.freguesias) ? registo.freguesias : [registo];

  return (freguesias as Record<string, unknown>[]).map((f) => ({
    rua: typeof f.morada === "string" ? f.morada : typeof f.rua === "string" ? f.rua : null,
    localidade: typeof f.localidade === "string" ? f.localidade : null,
    freguesia: typeof f.freguesia === "string" ? f.freguesia : typeof f.nome === "string" ? f.nome : null,
    concelho,
    distrito,
    latitude: typeof f.latitude === "number" ? f.latitude : parseNumeroOuNull(f.latitude),
    longitude: typeof f.longitude === "number" ? f.longitude : parseNumeroOuNull(f.longitude),
  }));
}

function parseNumeroOuNull(v: unknown): number | null {
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

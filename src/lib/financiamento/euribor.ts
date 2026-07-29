// Integração Euribor — Landwise, Fase 3 da revisão estrutural (secção 23
// do plano: "Buscar server-side. Mostrar: Taxa; Data; Fonte; Override;
// Fallback. Não inventar valor.").
//
// Fonte: ECB Data Portal (data-api.ecb.europa.eu), API oficial do Banco
// Central Europeu, pública e sem chave. As séries de Euribor publicadas
// pelo BCE têm frequência MENSAL (média do mês), não diária — é a
// referência mais fiável disponível sem uma licença comercial paga da
// EMMI (a entidade que administra o Euribor oficial). Mostrado sempre
// como "referência do BCE", nunca como a taxa exata do dia.

export type TenorEuribor = "6m" | "12m";

export type ResultadoEuribor =
  | { sucesso: true; taxa: number; dataReferencia: string; fonte: string }
  | { sucesso: false; erro: string };

const SERIES_ECB: Record<TenorEuribor, string> = {
  "6m": "M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA",
  "12m": "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA",
};

/**
 * Vai buscar a Euribor (6M ou 12M) mais recente publicada pelo BCE.
 * Nunca inventa um valor: qualquer falha (rede, formato inesperado,
 * série vazia) devolve um erro explícito para a UI mostrar, nunca um
 * número aproximado ou de exemplo.
 */
export async function obterEuribor(tenor: TenorEuribor): Promise<ResultadoEuribor> {
  const url = `https://data-api.ecb.europa.eu/service/data/FM/${SERIES_ECB[tenor]}?format=csvdata&lastNObservations=1`;

  let resposta: Response;
  try {
    resposta = await fetch(url, { headers: { Accept: "text/csv" }, next: { revalidate: 3600 } });
  } catch {
    return { sucesso: false, erro: "Não foi possível ligar ao BCE (ECB Data Portal). Preenche a taxa manualmente." };
  }

  if (!resposta.ok) {
    return { sucesso: false, erro: `O BCE respondeu com um erro (${resposta.status}). Preenche a taxa manualmente.` };
  }

  const csv = await resposta.text();
  const linhas = csv.trim().split("\n");
  if (linhas.length < 2) {
    return { sucesso: false, erro: "O BCE não devolveu nenhuma observação para esta série. Preenche a taxa manualmente." };
  }

  const cabecalho = linhas[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const idxData = cabecalho.indexOf("TIME_PERIOD");
  const idxValor = cabecalho.indexOf("OBS_VALUE");
  if (idxData === -1 || idxValor === -1) {
    return { sucesso: false, erro: "Formato de resposta do BCE inesperado. Preenche a taxa manualmente." };
  }

  const ultimaLinha = linhas[linhas.length - 1].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const dataReferencia = ultimaLinha[idxData];
  const valorPct = Number(ultimaLinha[idxValor]);

  if (!dataReferencia || Number.isNaN(valorPct)) {
    return { sucesso: false, erro: "Não foi possível interpretar o valor devolvido pelo BCE. Preenche a taxa manualmente." };
  }

  return {
    sucesso: true,
    taxa: valorPct / 100, // o BCE devolve em percentagem (ex. 2.458), o motor usa decimal (0.02458)
    dataReferencia, // "YYYY-MM" — média mensal, não um dia específico
    fonte: "ECB Data Portal (Refinitiv, média mensal)",
  };
}

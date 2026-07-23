// Solver de XIRR — Landwise, Fase 5 (parte 2)
//
// Secção 19 do plano: "Usar XIRR quando existirem datas reais. Não mostrar
// IRR igual a zero quando ela não puder ser calculada." A IRR exige pelo
// menos um fluxo negativo e um fluxo positivo — caso contrário devolve
// null, e a UI deve mostrar "Não calculável", nunca 0%.

export type FluxoDatado = { data: string; valor: number }; // "YYYY-MM-DD"

function diasEntre(dataBase: string, data: string): number {
  const base = new Date(dataBase + "T00:00:00Z").getTime();
  const alvo = new Date(data + "T00:00:00Z").getTime();
  return (alvo - base) / (1000 * 60 * 60 * 24);
}

function valorPresenteLiquido(taxaAnual: number, fluxos: FluxoDatado[]): number {
  const dataBase = fluxos[0].data;
  return fluxos.reduce((soma, f) => {
    const anos = diasEntre(dataBase, f.data) / 365;
    return soma + f.valor / Math.pow(1 + taxaAnual, anos);
  }, 0);
}

function derivadaVPL(taxaAnual: number, fluxos: FluxoDatado[]): number {
  const dataBase = fluxos[0].data;
  return fluxos.reduce((soma, f) => {
    const anos = diasEntre(dataBase, f.data) / 365;
    if (anos === 0) return soma;
    return soma - (anos * f.valor) / Math.pow(1 + taxaAnual, anos + 1);
  }, 0);
}

/**
 * Calcula a XIRR de uma lista de fluxos datados. Devolve null (nunca 0)
 * quando não há pelo menos um fluxo negativo e um positivo, ou quando o
 * solver não converge — a UI deve mostrar "Não calculável" nesse caso.
 */
export function calcXIRR(fluxos: FluxoDatado[]): number | null {
  const relevantes = fluxos.filter((f) => f.valor !== 0);
  if (relevantes.length < 2) return null;

  const temNegativo = relevantes.some((f) => f.valor < 0);
  const temPositivo = relevantes.some((f) => f.valor > 0);
  if (!temNegativo || !temPositivo) return null;

  const ordenados = [...relevantes].sort((a, b) => a.data.localeCompare(b.data));

  // Newton-Raphson, com ponto de partida de 10%.
  let taxa = 0.1;
  for (let i = 0; i < 100; i++) {
    const vpl = valorPresenteLiquido(taxa, ordenados);
    const derivada = derivadaVPL(taxa, ordenados);
    if (Math.abs(derivada) < 1e-10) break;
    const novaTaxa = taxa - vpl / derivada;
    if (!Number.isFinite(novaTaxa) || novaTaxa <= -0.999) break;
    if (Math.abs(novaTaxa - taxa) < 1e-7) {
      return Math.abs(valorPresenteLiquido(novaTaxa, ordenados)) < 1 ? novaTaxa : tentarBisecao(ordenados);
    }
    taxa = novaTaxa;
  }

  return tentarBisecao(ordenados);
}

/** Fallback por bisseção quando Newton-Raphson não converge — mais lento, mas robusto. */
function tentarBisecao(fluxos: FluxoDatado[]): number | null {
  let baixo = -0.99;
  let alto = 10; // 1000% ao ano — teto generoso
  const vplBaixo = valorPresenteLiquido(baixo, fluxos);
  const vplAlto = valorPresenteLiquido(alto, fluxos);
  if (Math.sign(vplBaixo) === Math.sign(vplAlto)) return null; // sem raiz no intervalo — não calculável

  let meio = 0;
  for (let i = 0; i < 200; i++) {
    meio = (baixo + alto) / 2;
    const vplMeio = valorPresenteLiquido(meio, fluxos);
    if (Math.abs(vplMeio) < 1) return meio;
    if (Math.sign(vplMeio) === Math.sign(vplBaixo)) {
      baixo = meio;
    } else {
      alto = meio;
    }
  }
  return meio;
}

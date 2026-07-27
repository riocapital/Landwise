// Motor de evolução de preços — Landwise, Fase 2 da revisão estrutural
// (secção 17 do plano).
//
// Cada regra tem um âmbito (geral ou uma tipologia específica), um
// gatilho (meses após o lançamento, data, % do projeto vendido, % da
// tipologia vendida) e um ajuste percentual, cumulativo ou por
// substituição. Nunca altera unidades já vendidas, com override manual ou
// com preço bloqueado — a proteção é a mesma usada em sales-table.ts e
// sales-curve.ts (nunca tocar no que já é real ou decidido manualmente).

export type EscopoRegraPreco = { tipo: "geral" } | { tipo: "tipologia"; tipologiaId: string };

export type TipoGatilhoPreco = "meses_apos_lancamento" | "data" | "pct_vendido_projeto" | "pct_vendido_tipologia";

export type RegraEvolucaoPreco = {
  id: string;
  escopo: EscopoRegraPreco;
  gatilho: TipoGatilhoPreco;
  valorGatilhoNumero: number | null; // meses ou percentagem (decimal), consoante o gatilho
  valorGatilhoData: string | null; // "YYYY-MM-DD", só quando gatilho = 'data'
  ajustePct: number; // +/- decimal, ex. -0.03, +0.05
  modo: "cumulativo" | "substituicao";
  ordem: number; // ordem de avaliação quando várias regras se aplicam ao mesmo momento
  observacao: string | null;
};

export type ContextoMomento = {
  mesesDesdeLancamento: number;
  dataAtual: string; // "YYYY-MM-DD"
  pctVendidoProjeto: number; // 0-1
  pctVendidoTipologia: number; // 0-1
};

function gatilhoAtivo(regra: RegraEvolucaoPreco, contexto: ContextoMomento): boolean {
  switch (regra.gatilho) {
    case "meses_apos_lancamento":
      return regra.valorGatilhoNumero !== null && contexto.mesesDesdeLancamento >= regra.valorGatilhoNumero;
    case "data":
      return regra.valorGatilhoData !== null && contexto.dataAtual >= regra.valorGatilhoData;
    case "pct_vendido_projeto":
      return regra.valorGatilhoNumero !== null && contexto.pctVendidoProjeto >= regra.valorGatilhoNumero;
    case "pct_vendido_tipologia":
      return regra.valorGatilhoNumero !== null && contexto.pctVendidoTipologia >= regra.valorGatilhoNumero;
    default:
      return false;
  }
}

/**
 * Calcula o ajuste percentual ativo para uma tipologia num determinado
 * momento, combinando as regras gerais e as específicas dessa tipologia.
 * Regras "substituição" ignoram tudo o que veio antes delas (pela
 * ordem); regras "cumulativo" somam-se ao que já estava ativo.
 */
export function calcAjustePrecoAtivo(regras: RegraEvolucaoPreco[], tipologiaId: string, contexto: ContextoMomento): number {
  const aplicaveis = regras
    .filter((r) => r.escopo.tipo === "geral" || r.escopo.tipologiaId === tipologiaId)
    .filter((r) => gatilhoAtivo(r, contexto))
    .sort((a, b) => a.ordem - b.ordem);

  let ajuste = 0;
  for (const regra of aplicaveis) {
    ajuste = regra.modo === "substituicao" ? regra.ajustePct : ajuste + regra.ajustePct;
  }
  return ajuste;
}

export type UnidadeParaEvolucaoPreco = {
  id: string;
  tipologiaId: string;
  dataVendaEfetiva: string | null; // real ou projetada pela curva — null = ainda sem data, não se aplica ajuste
  disponivel: boolean;
  precoBloqueado: boolean;
  overrideManualValor: number | null;
};

/**
 * Calcula o ajuste de preço a aplicar a cada unidade, no momento da sua
 * própria venda (real ou projetada) — nunca retroativo, nunca recalculado
 * depois de a unidade estar vendida. Unidades sem data de venda, com
 * preço bloqueado, override manual ou já vendidas nunca são tocadas
 * (devolve o ajuste antigo/nenhum, para o chamador decidir se atualiza).
 */
export function calcularAjustesParaSalesTable(
  unidades: UnidadeParaEvolucaoPreco[],
  regras: RegraEvolucaoPreco[],
  dataLancamentoComercial: string
): Map<string, number> {
  const resultado = new Map<string, number>();

  // Ordena todas as unidades COM data (real ou projetada) cronologicamente,
  // para poder calcular corretamente a % vendida acumulada do projeto e de
  // cada tipologia em cada ponto no tempo.
  const comData = unidades.filter((u) => u.dataVendaEfetiva !== null).sort((a, b) => a.dataVendaEfetiva!.localeCompare(b.dataVendaEfetiva!));

  const totalProjeto = unidades.length;
  const totalPorTipologia = new Map<string, number>();
  for (const u of unidades) {
    totalPorTipologia.set(u.tipologiaId, (totalPorTipologia.get(u.tipologiaId) ?? 0) + 1);
  }

  let vendidoAcumuladoProjeto = 0;
  const vendidoAcumuladoTipologia = new Map<string, number>();

  const [anoL, mesL] = dataLancamentoComercial.split("-").map(Number);

  for (const u of comData) {
    // A % vendida "até este momento" conta as unidades vendidas ANTES desta (não inclui esta própria venda),
    // porque o preço desta unidade é decidido pelo estado do mercado até ao momento em que ela é colocada à venda.
    const pctVendidoProjeto = totalProjeto > 0 ? vendidoAcumuladoProjeto / totalProjeto : 0;
    const totalTipologia = totalPorTipologia.get(u.tipologiaId) ?? 0;
    const jaVendidoTipologia = vendidoAcumuladoTipologia.get(u.tipologiaId) ?? 0;
    const pctVendidoTipologia = totalTipologia > 0 ? jaVendidoTipologia / totalTipologia : 0;

    const [ano, mes] = u.dataVendaEfetiva!.split("-").map(Number);
    const mesesDesdeLancamento = (ano - anoL) * 12 + (mes - mesL);

    if (!u.precoBloqueado && u.overrideManualValor === null) {
      const ajuste = calcAjustePrecoAtivo(regras, u.tipologiaId, {
        mesesDesdeLancamento,
        dataAtual: u.dataVendaEfetiva!,
        pctVendidoProjeto,
        pctVendidoTipologia,
      });
      resultado.set(u.id, ajuste);
    }

    vendidoAcumuladoProjeto++;
    vendidoAcumuladoTipologia.set(u.tipologiaId, jaVendidoTipologia + 1);
  }

  return resultado;
}

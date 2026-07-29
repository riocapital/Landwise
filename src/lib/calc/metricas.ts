// Motor de métricas de decisão — Landwise, Fase 4 da revisão estrutural
// (secções 35/36 do plano).
//
// "Nunca mostrar apenas €/m² sem base" — cada linha devolvida identifica
// sempre qual a área usada (ABC ou ABP). Quando a área-base é zero,
// devolve null em vez de Infinity ou 0 (nunca inventa um valor).

export type LinhaMetrica = {
  categoria: string;
  euros: number;
  pctVgv: number | null;
  eurPorAbc: number | null;
  eurPorAbp: number | null;
  eurPorUnidade: number | null;
};

function calcLinhaMetrica(categoria: string, euros: number, vgv: number, abcTotal: number, abpTotal: number, numeroUnidades: number): LinhaMetrica {
  return {
    categoria,
    euros,
    pctVgv: vgv > 0 ? euros / vgv : null,
    eurPorAbc: abcTotal > 0 ? euros / abcTotal : null,
    eurPorAbp: abpTotal > 0 ? euros / abpTotal : null,
    eurPorUnidade: numeroUnidades > 0 ? euros / numeroUnidades : null,
  };
}

export type ParametrosMetricas = {
  vgvBruto: number;
  vgvLiquido: number; // vgvBruto - comissão
  aquisicao: number; // valor de compra, sem os custos auxiliares
  custosAquisicao: number; // DD, notário, registos, IMT, IS — sem incluir o valor de compra
  hardCosts: number;
  softCosts: number;
  comissao: number;
  fees: number;
  custosFinanceiros: number; // juros + fees bancários + imposto de selo do empréstimo
  impostoEstimado: number;
  abcTotal: number;
  abpTotal: number;
  numeroUnidades: number;
};

export type MetricasPorM2 = {
  linhas: LinhaMetrica[]; // Compra, Custos aquisição, Construção (hard), Soft, Total, Venda bruta, Venda líquida, Lucro
  lucro: number;
};

/** Métricas por m² (secção 35) — cada categoria com €/ABC e €/ABP, nunca um valor solto sem base. */
export function calcMetricasPorM2(p: ParametrosMetricas): MetricasPorM2 {
  const custoTotal = p.aquisicao + p.custosAquisicao + p.hardCosts + p.softCosts + p.comissao + p.fees + p.custosFinanceiros + p.impostoEstimado;
  const lucro = p.vgvLiquido - custoTotal;

  const linhas = [
    calcLinhaMetrica("Compra", p.aquisicao, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Custos de aquisição", p.custosAquisicao, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Construção", p.hardCosts, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Soft costs", p.softCosts, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Total", custoTotal, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Venda bruta", p.vgvBruto, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Venda líquida", p.vgvLiquido, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Lucro", lucro, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
  ];

  return { linhas, lucro };
}

export type CorSemaforo = "verde" | "amarelo" | "vermelho";

/**
 * Régua de referência Landwise (secção 36) — não é uma regra universal,
 * só uma referência interna: verde <35%, amarelo 35-45%, vermelho >45% no
 * rácio Aquisição/VGV.
 */
export function calcSemaforoAquisicaoVgv(racioAquisicaoVgv: number): CorSemaforo {
  if (racioAquisicaoVgv < 0.35) return "verde";
  if (racioAquisicaoVgv <= 0.45) return "amarelo";
  return "vermelho";
}

export type EstruturaSobreVgv = {
  linhas: LinhaMetrica[]; // Aquisição, Custos aquisição, Hard, Soft, Comissão, Fees, Financeiros, Imposto, Total, Lucro
  totalCustos: number;
  lucro: number;
  racioAquisicaoVgv: number;
  semaforoAquisicaoVgv: CorSemaforo;
};

/** Estrutura sobre VGV (secção 36) — euros, % VGV, €/ABC, €/ABP e €/unidade em cada categoria. */
export function calcEstruturaSobreVgv(p: ParametrosMetricas): EstruturaSobreVgv {
  const categorias: [string, number][] = [
    ["Aquisição", p.aquisicao],
    ["Custos de aquisição", p.custosAquisicao],
    ["Hard costs", p.hardCosts],
    ["Soft costs", p.softCosts],
    ["Comissão", p.comissao],
    ["Fees", p.fees],
    ["Custos financeiros", p.custosFinanceiros],
    ["Imposto", p.impostoEstimado],
  ];

  const linhas = categorias.map(([nome, euros]) => calcLinhaMetrica(nome, euros, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades));
  const totalCustos = categorias.reduce((s, [, euros]) => s + euros, 0);
  const lucro = p.vgvBruto - totalCustos;
  const racioAquisicaoVgv = p.vgvBruto > 0 ? p.aquisicao / p.vgvBruto : 0;

  linhas.push(calcLinhaMetrica("Total", totalCustos, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades));
  linhas.push(calcLinhaMetrica("Lucro", lucro, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades));

  return {
    linhas,
    totalCustos,
    lucro,
    racioAquisicaoVgv,
    semaforoAquisicaoVgv: calcSemaforoAquisicaoVgv(racioAquisicaoVgv),
  };
}

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
  ivaNaoRecuperavel: number; // IVA suportado que não é recuperável — já contado no custo total do cash flow (cashflow.ts), tem de estar aqui também, senão o lucro desta tabela não reconcilia com o Resumo
  impostoEstimado: number;
  abcTotal: number;
  abpTotal: number;
  numeroUnidades: number;
};

export type MetricasPorM2 = {
  linhas: LinhaMetrica[]; // Compra, Custos aquisição, Construção (hard), Soft, Total, Venda bruta, Venda líquida, Lucro
  lucro: number;
};

/**
 * Métricas por m² (secção 35) — cada categoria com €/ABC e €/ABP, nunca um
 * valor solto sem base.
 *
 * Lucro = VGV BRUTO − custo total (o custo total já inclui a comissão
 * comercial, uma única vez). Nunca partir de vgvLiquido (= vgvBruto −
 * comissão) para depois subtrair um custoTotal que TAMBÉM já inclui a
 * comissão — isso descontava a comissão duas vezes (bug real, auditoria
 * financeira). "Venda líquida"/vgvLiquido é só uma linha informativa nesta
 * tabela, nunca a base do lucro.
 */
export function calcMetricasPorM2(p: ParametrosMetricas): MetricasPorM2 {
  const custoTotal =
    p.aquisicao + p.custosAquisicao + p.hardCosts + p.softCosts + p.comissao + p.fees + p.custosFinanceiros + p.ivaNaoRecuperavel + p.impostoEstimado;
  const lucro = p.vgvBruto - custoTotal;

  const linhas = [
    calcLinhaMetrica("Compra", p.aquisicao, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Custos de aquisição", p.custosAquisicao, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Construção", p.hardCosts, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Soft costs", p.softCosts, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("IVA não recuperável", p.ivaNaoRecuperavel, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Total", custoTotal, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Venda bruta", p.vgvBruto, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Venda líquida", p.vgvLiquido, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
    calcLinhaMetrica("Lucro", lucro, p.vgvBruto, p.abcTotal, p.abpTotal, p.numeroUnidades),
  ];

  return { linhas, lucro };
}

export type CorSemaforo = "verde" | "amarelo" | "vermelho";

export type LimiaresSemaforoAquisicaoVgv = { verdeAbaixoDe: number; amareloAte: number };

/**
 * Régua de referência Landwise (secção 36) — explicitamente NÃO uma regra
 * universal, só o ponto de partida que calcSemaforoAquisicaoVgv usa quando
 * nenhum limiar próprio é passado. Organizações/projetos que queiram outra
 * régua passam os seus próprios limiares — nunca editar estes valores como
 * se fossem a verdade para todos os projetos (secção 16/17 do prompt
 * 03_08: "não hardcode uma régua universal").
 */
export const LIMIARES_SEMAFORO_AQUISICAO_VGV_REFERENCIA_LANDWISE: LimiaresSemaforoAquisicaoVgv = {
  verdeAbaixoDe: 0.35,
  amareloAte: 0.45,
};

export function calcSemaforoAquisicaoVgv(
  racioAquisicaoVgv: number,
  limiares: LimiaresSemaforoAquisicaoVgv = LIMIARES_SEMAFORO_AQUISICAO_VGV_REFERENCIA_LANDWISE
): CorSemaforo {
  if (racioAquisicaoVgv < limiares.verdeAbaixoDe) return "verde";
  if (racioAquisicaoVgv <= limiares.amareloAte) return "amarelo";
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
export function calcEstruturaSobreVgv(
  p: ParametrosMetricas,
  limiaresSemaforo: LimiaresSemaforoAquisicaoVgv = LIMIARES_SEMAFORO_AQUISICAO_VGV_REFERENCIA_LANDWISE
): EstruturaSobreVgv {
  const categorias: [string, number][] = [
    ["Aquisição", p.aquisicao],
    ["Custos de aquisição", p.custosAquisicao],
    ["Hard costs", p.hardCosts],
    ["Soft costs", p.softCosts],
    ["Comissão", p.comissao],
    ["Fees", p.fees],
    ["Custos financeiros", p.custosFinanceiros],
    ["IVA não recuperável", p.ivaNaoRecuperavel],
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
    semaforoAquisicaoVgv: calcSemaforoAquisicaoVgv(racioAquisicaoVgv, limiaresSemaforo),
  };
}

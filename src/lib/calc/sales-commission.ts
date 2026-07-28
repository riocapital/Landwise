// Motor de comissão comercial — Landwise, Fase 2 da revisão estrutural
// (secção 18 do plano).
//
// A comissão incide sobre o PREÇO TOTAL da unidade, nunca sobre o sinal.
// É sempre uma saída de cash flow separada — nunca descontada diretamente
// da entrada do comprador (secção 18: "Não descontar diretamente da
// entrada do comprador").

import { calcularDatasEfetivas } from "./sales-curve";
import type { LinhaSalesTableResolvida } from "./sales-table";
import type { Typology } from "./areas";

export type ParametrosComissao = {
  percentagemComissao: number; // decimal, ex. 0.05 — começa em 0, nunca assumido (secção 9/22 do plano: nada de valores pré-definidos sem o utilizador escolher)
  taxaIva: number; // decimal — sugestão 0.23
  pctPagoNoSinal: number; // decimal — sugestão 0.5
  pctPagoNaEscritura: number; // decimal — sugestão 0.5
  ivaRecuperavelPct: number; // decimal — 0 por omissão (comissão de mediação tipicamente não é recuperável para o promotor)
};

export const PARAMETROS_COMISSAO_PADRAO: ParametrosComissao = {
  percentagemComissao: 0,
  taxaIva: 0.23,
  pctPagoNoSinal: 0.5,
  pctPagoNaEscritura: 0.5,
  ivaRecuperavelPct: 0,
};

export type ResultadoComissaoUnidade = {
  comissaoSemIva: number;
  iva: number;
  ivaRecuperavel: number;
  ivaNaoRecuperavel: number;
  comissaoTotal: number; // comissão sem IVA + IVA não recuperável — nunca conta o IVA recuperável como custo
};

/** Comissão sempre sobre o preço final da unidade — nunca sobre o sinal. */
export function calcComissaoUnidade(precoFinalUnidade: number, parametros: ParametrosComissao): ResultadoComissaoUnidade {
  const comissaoSemIva = precoFinalUnidade * parametros.percentagemComissao;
  const iva = comissaoSemIva * parametros.taxaIva;
  const ivaRecuperavel = iva * parametros.ivaRecuperavelPct;
  const ivaNaoRecuperavel = iva - ivaRecuperavel;
  return { comissaoSemIva, iva, ivaRecuperavel, ivaNaoRecuperavel, comissaoTotal: comissaoSemIva + ivaNaoRecuperavel };
}

export type LinhaComissaoMensal = { mes: string; comissaoSemIva: number; ivaNaoRecuperavel: number; total: number };

/**
 * Gera o calendário mensal da comissão comercial de toda a Sales Table —
 * sempre uma linha separada, nunca subtraída diretamente da receita de
 * vendas. Metade (por omissão) paga no mês de venda de cada unidade
 * (real ou projetada pela curva), metade na escritura — a mesma divisão
 * sinal/escritura já usada para os recebimentos do comprador.
 */
export function gerarComissaoMensal(
  unidadesResolvidas: LinhaSalesTableResolvida[],
  tipologias: Typology[],
  dataLancamentoComercial: string,
  dataEscritura: string,
  parametros: ParametrosComissao
): { linhas: LinhaComissaoMensal[]; totalComissaoSemIva: number; totalIvaNaoRecuperavel: number } {
  const datasEfetivas = calcularDatasEfetivas(
    unidadesResolvidas.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
    tipologias.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
    dataLancamentoComercial
  );

  const porMes = new Map<string, { semIva: number; ivaNaoRec: number }>();
  let totalComissaoSemIva = 0;
  let totalIvaNaoRecuperavel = 0;

  const soma = (mes: string, semIva: number, ivaNaoRec: number) => {
    const atual = porMes.get(mes) ?? { semIva: 0, ivaNaoRec: 0 };
    atual.semIva += semIva;
    atual.ivaNaoRec += ivaNaoRec;
    porMes.set(mes, atual);
  };

  const mesEscritura = dataEscritura.slice(0, 7);

  for (const u of unidadesResolvidas) {
    const c = calcComissaoUnidade(u.precoFinal, parametros);
    totalComissaoSemIva += c.comissaoSemIva;
    totalIvaNaoRecuperavel += c.ivaNaoRecuperavel;

    const dataVenda = datasEfetivas.get(u.id);
    if (!dataVenda) continue; // sem data real nem projetável — não agenda, nunca inventa mês

    const mesSinal = dataVenda.slice(0, 7);
    soma(mesSinal, c.comissaoSemIva * parametros.pctPagoNoSinal, c.ivaNaoRecuperavel * parametros.pctPagoNoSinal);
    soma(mesEscritura, c.comissaoSemIva * parametros.pctPagoNaEscritura, c.ivaNaoRecuperavel * parametros.pctPagoNaEscritura);
  }

  const linhas: LinhaComissaoMensal[] = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, comissaoSemIva: v.semIva, ivaNaoRecuperavel: v.ivaNaoRec, total: v.semIva + v.ivaNaoRec }));

  return { linhas, totalComissaoSemIva, totalIvaNaoRecuperavel };
}

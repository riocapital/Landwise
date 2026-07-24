// Motor de plano de vendas e recebimentos — Landwise, Fase 7 (parte 2)
//
// Secção 5 do plano. A soma das percentagens de recebimento (reserva, CPCV,
// durante construção, conclusão, escritura) tem de ser exatamente 100% —
// validado aqui, nunca assumido.

import { distribuirValorPorPerfil } from "./perfil-desembolso";
import { gerarAgendaAbsorcao, atribuirDatasAbsorcao, type UnidadeParaAgendar } from "./sales-curve";
import type { LinhaSalesTableResolvida } from "./sales-table";
import type { Typology } from "./areas";

export type EstruturaRecebimentos = {
  pctReserva: number;
  pctCpcv: number;
  pctDuranteConstrucao: number;
  pctConclusao: number;
  pctEscritura: number;
};

export function validarEstruturaRecebimentos(e: EstruturaRecebimentos): boolean {
  const soma = e.pctReserva + e.pctCpcv + e.pctDuranteConstrucao + e.pctConclusao + e.pctEscritura;
  return Math.abs(soma - 1) < 0.001;
}

export type PlanoVendas = {
  dataLancamentoComercial: string; // "YYYY-MM-DD"
  duracaoVendasMeses: number; // duração esperada das vendas (absorção)
  dataInicioConstrucao: string;
  dataFimConstrucao: string;
  dataEscritura: string; // normalmente perto ou depois da conclusão
  estruturaRecebimentos: EstruturaRecebimentos;
  comissaoMediacaoPct: number; // % da receita, saída de caixa (não uma redução do GDV bruto)
  cancelamentosEstimadosPct: number; // % da receita que se assume não se concretizar
};

export type LinhaRecebimentoMensal = {
  mes: string;
  reserva: number;
  cpcv: number;
  duranteConstrucao: number;
  conclusao: number;
  escritura: number;
  total: number;
};

/**
 * Gera o calendário mensal de recebimentos a partir da receita total (GDV),
 * aplicando a estrutura percentual e espalhando cada parcela pelo período
 * correspondente:
 * - Reserva e CPCV: distribuídas linearmente pelo período de absorção de vendas
 *   (lançamento comercial + duração das vendas) — aproximação da velocidade de vendas.
 * - Durante construção: distribuída linearmente pelo período de construção.
 * - Conclusão: valor único no mês de fim de construção.
 * - Escritura: valor único no mês da escritura.
 *
 * Os cancelamentos estimados reduzem a receita total antes de qualquer
 * distribuição — nunca aplicados só a uma parcela.
 */
export function gerarRecebimentosMensais(
  receitaTotalGdv: number,
  plano: PlanoVendas
): { linhas: LinhaRecebimentoMensal[]; receitaLiquidaCancelamentos: number } {
  const receitaLiquida = receitaTotalGdv * (1 - plano.cancelamentosEstimadosPct);
  const e = plano.estruturaRecebimentos;

  const fimAbsorcao = calcFimAbsorcao(plano.dataLancamentoComercial, plano.duracaoVendasMeses);

  const reservaPorMes = distribuirValorPorPerfil(receitaLiquida * e.pctReserva, plano.dataLancamentoComercial, fimAbsorcao, "linear");
  const cpcvPorMes = distribuirValorPorPerfil(receitaLiquida * e.pctCpcv, plano.dataLancamentoComercial, fimAbsorcao, "linear");
  const construcaoPorMes = distribuirValorPorPerfil(
    receitaLiquida * e.pctDuranteConstrucao,
    plano.dataInicioConstrucao,
    plano.dataFimConstrucao,
    "linear"
  );
  const conclusaoPorMes = new Map([[plano.dataFimConstrucao.slice(0, 7), receitaLiquida * e.pctConclusao]]);
  const escrituraPorMes = new Map([[plano.dataEscritura.slice(0, 7), receitaLiquida * e.pctEscritura]]);

  const todosMeses = new Set<string>([
    ...reservaPorMes.keys(),
    ...cpcvPorMes.keys(),
    ...construcaoPorMes.keys(),
    ...conclusaoPorMes.keys(),
    ...escrituraPorMes.keys(),
  ]);

  const linhas: LinhaRecebimentoMensal[] = [...todosMeses]
    .sort()
    .map((mes) => {
      const reserva = reservaPorMes.get(mes) ?? 0;
      const cpcv = cpcvPorMes.get(mes) ?? 0;
      const duranteConstrucao = construcaoPorMes.get(mes) ?? 0;
      const conclusao = conclusaoPorMes.get(mes) ?? 0;
      const escritura = escrituraPorMes.get(mes) ?? 0;
      return { mes, reserva, cpcv, duranteConstrucao, conclusao, escritura, total: reserva + cpcv + duranteConstrucao + conclusao + escritura };
    });

  return { linhas, receitaLiquidaCancelamentos: receitaLiquida };
}

function calcFimAbsorcao(dataLancamento: string, duracaoMeses: number): string {
  const [ano, mes] = dataLancamento.split("-").map(Number);
  const fim = new Date(Date.UTC(ano, mes - 1 + duracaoMeses - 1, 1));
  return fim.toISOString().slice(0, 10);
}

/**
 * Gera o calendário de recebimentos a partir da Sales Table real e da
 * curva de vendas por tipologia (secções 14/15 do plano de revisão) —
 * substitui a aproximação uniforme de `gerarRecebimentosMensais` quando já
 * há tipologias e unidades reais.
 *
 * Reserva+CPCV seguem o mês de venda de CADA unidade: real, quando a
 * unidade já foi vendida (dataVenda); projetado pela curva de absorção da
 * sua tipologia, quando ainda está disponível. Durante construção,
 * conclusão e escritura continuam globais — dependem do calendário de
 * obra/entrega partilhado por todas as unidades, não da data de venda
 * individual (secção 31, "Entrega e escrituras", ainda por construir).
 *
 * Simplificação assumida e documentada: quando uma tipologia já tem
 * unidades vendidas fora de ordem, as unidades ainda disponíveis recebem
 * os primeiros meses livres da curva teórica, não necessariamente o mês
 * "certo" que ocupariam numa absorção perfeitamente sequencial — o total
 * mensal agregado (o que importa para o cash flow) fica correto, a
 * atribuição unidade a unidade é uma aproximação.
 */
export function gerarRecebimentosDaSalesTable(
  unidadesResolvidas: LinhaSalesTableResolvida[],
  tipologias: Typology[],
  plano: PlanoVendas
): { linhas: LinhaRecebimentoMensal[]; receitaLiquidaCancelamentos: number } {
  const fatorCancelamento = 1 - plano.cancelamentosEstimadosPct;
  const e = plano.estruturaRecebimentos;
  const pctReservaMaisCpcv = e.pctReserva + e.pctCpcv;

  const reservaCpcvPorMes = new Map<string, number>();
  let receitaTotal = 0;

  for (const tipologia of tipologias) {
    const unidadesDaTipologia = unidadesResolvidas.filter((u) => u.tipologiaId === tipologia.id);
    if (unidadesDaTipologia.length === 0) continue;

    const agenda = gerarAgendaAbsorcao(
      unidadesDaTipologia.length,
      tipologia.mesesParaPrimeiraVenda,
      tipologia.unidadesPorMes,
      plano.dataLancamentoComercial
    );

    const paraAgendar: UnidadeParaAgendar[] = unidadesDaTipologia.map((u) => ({
      id: u.id,
      ordem: u.ordem,
      jaTemDataVenda: Boolean(u.dataVenda),
      disponivel: u.estadoComercial === "disponivel",
    }));
    const atribuicoes = atribuirDatasAbsorcao(paraAgendar, agenda);
    const dataProjetadaPorUnidade = new Map(atribuicoes.map((a) => [a.unidadeId, a.dataVenda]));

    for (const u of unidadesDaTipologia) {
      const precoLiquido = u.precoFinal * fatorCancelamento;
      receitaTotal += precoLiquido;

      const dataVendaEfetiva = u.dataVenda ?? dataProjetadaPorUnidade.get(u.id) ?? null;
      if (!dataVendaEfetiva) continue; // sem data real nem projetável (tipologia sem curva configurada) — não agenda, nunca inventa mês

      const mes = dataVendaEfetiva.slice(0, 7);
      reservaCpcvPorMes.set(mes, (reservaCpcvPorMes.get(mes) ?? 0) + precoLiquido * pctReservaMaisCpcv);
    }
  }

  const construcaoPorMes = distribuirValorPorPerfil(
    receitaTotal * e.pctDuranteConstrucao,
    plano.dataInicioConstrucao,
    plano.dataFimConstrucao,
    "linear"
  );
  const conclusaoPorMes = new Map([[plano.dataFimConstrucao.slice(0, 7), receitaTotal * e.pctConclusao]]);
  const escrituraPorMes = new Map([[plano.dataEscritura.slice(0, 7), receitaTotal * e.pctEscritura]]);

  const todosMeses = new Set<string>([...reservaCpcvPorMes.keys(), ...construcaoPorMes.keys(), ...conclusaoPorMes.keys(), ...escrituraPorMes.keys()]);

  const linhas: LinhaRecebimentoMensal[] = [...todosMeses]
    .sort()
    .map((mes) => {
      const reservaCpcv = reservaCpcvPorMes.get(mes) ?? 0;
      const duranteConstrucao = construcaoPorMes.get(mes) ?? 0;
      const conclusao = conclusaoPorMes.get(mes) ?? 0;
      const escritura = escrituraPorMes.get(mes) ?? 0;
      // reserva e cpcv reportados juntos na mesma linha (ambos seguem a data de venda da unidade) — reserva leva o total, cpcv fica a 0, para não duplicar a soma.
      return { mes, reserva: reservaCpcv, cpcv: 0, duranteConstrucao, conclusao, escritura, total: reservaCpcv + duranteConstrucao + conclusao + escritura };
    });

  return { linhas, receitaLiquidaCancelamentos: receitaTotal };
}

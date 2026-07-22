// Motor de plano de vendas e recebimentos — Landwise, Fase 7 (parte 2)
//
// Secção 5 do plano. A soma das percentagens de recebimento (reserva, CPCV,
// durante construção, conclusão, escritura) tem de ser exatamente 100% —
// validado aqui, nunca assumido.

import { distribuirValorPorPerfil } from "./perfil-desembolso";

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

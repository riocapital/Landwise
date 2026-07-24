// Motor de curva de vendas por tipologia — Landwise, Fase 2 da revisão
// estrutural (secção 15 do plano).
//
// O utilizador só informa meses e velocidade — nunca tem de repetir datas
// unidade a unidade. Nunca vende unidade fracionada nem acima do stock
// (validarVenda, em sales-table.ts, continua a ser a garantia final antes
// de qualquer venda real).

export type CurvaVendaTipologia = {
  tipologiaId: string;
  mesesParaPrimeiraVenda: number; // meses após o lançamento comercial
  unidadesPorMes: number; // velocidade de absorção (pode ser fracionário, ex. 1.5/mês)
};

export type MesAbsorcao = { mes: string; unidadesNoMes: number }; // "YYYY-MM"

/**
 * Gera a agenda de absorção mensal para uma tipologia: quantas unidades
 * (inteiras) se vendem em cada mês, nunca excedendo o stock total, nunca
 * fracionando uma unidade entre dois meses.
 */
export function gerarAgendaAbsorcao(
  totalUnidades: number,
  mesesParaPrimeiraVenda: number,
  unidadesPorMes: number,
  dataLancamentoComercial: string
): MesAbsorcao[] {
  if (unidadesPorMes <= 0 || totalUnidades <= 0) return [];

  const [ano, mes] = dataLancamentoComercial.split("-").map(Number);
  const resultado: MesAbsorcao[] = [];
  let vendidoAcumulado = 0;
  let mesIndex = 0;

  while (vendidoAcumulado < totalUnidades) {
    const metaAcumulada = Math.min(totalUnidades, Math.round((mesIndex + 1) * unidadesPorMes));
    const unidadesNoMes = metaAcumulada - vendidoAcumulado;

    if (unidadesNoMes > 0) {
      const dataMes = new Date(Date.UTC(ano, mes - 1 + mesesParaPrimeiraVenda + mesIndex, 1));
      resultado.push({ mes: dataMes.toISOString().slice(0, 7), unidadesNoMes });
      vendidoAcumulado += unidadesNoMes;
    }

    mesIndex++;
    if (mesIndex > 600) break; // guarda de segurança (50 anos) — nunca um ciclo infinito por velocidade mal configurada
  }

  return resultado;
}

export type UnidadeParaAgendar = { id: string; ordem: number; jaTemDataVenda: boolean; disponivel: boolean };
export type AtribuicaoData = { unidadeId: string; dataVenda: string };

/**
 * Atribui a data de venda projetada a cada unidade DISPONÍVEL e sem data
 * própria já definida — nunca reatribui uma unidade já vendida,
 * escriturada ou com data manual (secção 14: "nunca apagar unidade
 * vendida"; a mesma proteção aplica-se aqui a datas já atribuídas).
 */
export function atribuirDatasAbsorcao(unidades: UnidadeParaAgendar[], agenda: MesAbsorcao[]): AtribuicaoData[] {
  const elegiveis = [...unidades]
    .filter((u) => u.disponivel && !u.jaTemDataVenda)
    .sort((a, b) => a.ordem - b.ordem);

  const atribuicoes: AtribuicaoData[] = [];
  let idx = 0;

  for (const { mes, unidadesNoMes } of agenda) {
    for (let i = 0; i < unidadesNoMes && idx < elegiveis.length; i++, idx++) {
      atribuicoes.push({ unidadeId: elegiveis[idx].id, dataVenda: `${mes}-01` });
    }
  }

  return atribuicoes;
}

export type ResumoAbsorcao = {
  mes: string;
  unidadesNoMes: number;
  acumulado: number;
  pctVendido: number;
  stockRestante: number;
};

/** Resumo mensal de absorção — para mostrar a evolução de vendas e o stock restante. */
export function calcResumoAbsorcao(agenda: MesAbsorcao[], totalUnidades: number): ResumoAbsorcao[] {
  let acumulado = 0;
  return agenda.map(({ mes, unidadesNoMes }) => {
    acumulado += unidadesNoMes;
    return {
      mes,
      unidadesNoMes,
      acumulado,
      pctVendido: totalUnidades > 0 ? acumulado / totalUnidades : 0,
      stockRestante: totalUnidades - acumulado,
    };
  });
}

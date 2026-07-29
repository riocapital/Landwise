// Motor de calendário automático — Landwise, Fase 2 da revisão estrutural
// (secção 30 do plano).
//
// "O calendário deve ler os mesmos registos. Preferir editar na origem.
// Não criar cópias de datas." — este motor NUNCA persiste datas próprias;
// monta uma vista a partir dos registos já existentes (custos, plano de
// vendas, financiamento). Para mudar uma data, o utilizador edita a linha
// de custo, o plano de vendas ou o financiamento — nunca este ecrã
// diretamente.
//
// Ficheiro separado de calendario.ts para evitar dependência circular:
// custos.ts já reexporta funções de calendario.ts, por isso
// calendario.ts não pode importar tipos de custos.ts.

import type { LinhaGantt } from "./calendario";
import type { LinhaCusto } from "./custos";

export type EventoFinanciamentoMensal = { mes: string; drawdown: number; amortizacao: number; saldoDivida: number };

export type GrupoCalendarioAutomatico = {
  grupo: "aquisicao" | "custos" | "vendas" | "financiamento";
  titulo: string;
  linhas: LinhaGantt[];
};

export type ResultadoCalendarioAutomatico = {
  grupos: GrupoCalendarioAutomatico[];
  dataInicial: string | null; // primeiro fluxo financeiro (secção 30)
  dataFinal: string | null; // último evento ativo (secção 30)
};

function linhasCustoParaGantt(linhas: LinhaCusto[]): LinhaGantt[] {
  return linhas
    .filter((l) => l.dataInicial && l.dataFinal)
    .map((l, i) => ({ id: l.id, nome: l.nome, inicio: l.dataInicial!, fim: l.dataFinal!, ordem: i }));
}

export type EventoTipologiaVendas = { tipologiaId: string; nome: string; primeiraData: string | null; ultimaData: string | null };

/**
 * Monta o calendário completo do projeto a partir dos registos reais —
 * nunca de uma lista de atividades editada à parte.
 */
export function montarCalendarioAutomatico(
  linhasCusto: LinhaCusto[],
  eventosVendas: {
    dataLancamentoComercial: string | null;
    dataEscritura: string | null;
    porTipologia: EventoTipologiaVendas[];
  },
  linhasFinanciamento: EventoFinanciamentoMensal[]
): ResultadoCalendarioAutomatico {
  const grupos: GrupoCalendarioAutomatico[] = [];
  const todasAsDatas: string[] = [];

  // --- Aquisição ---
  const aquisicaoLinhas = linhasCustoParaGantt(linhasCusto.filter((l) => l.grupo === "aquisicao"));
  if (aquisicaoLinhas.length > 0) {
    grupos.push({ grupo: "aquisicao", titulo: "Aquisição", linhas: aquisicaoLinhas });
    aquisicaoLinhas.forEach((l) => todasAsDatas.push(l.inicio, l.fim));
  }

  // --- Custos (hard, soft, outro) ---
  const custosLinhas = linhasCustoParaGantt(linhasCusto.filter((l) => l.grupo !== "aquisicao"));
  if (custosLinhas.length > 0) {
    grupos.push({ grupo: "custos", titulo: "Custos", linhas: custosLinhas });
    custosLinhas.forEach((l) => todasAsDatas.push(l.inicio, l.fim));
  }

  // --- Vendas: lançamento, uma linha por tipologia (1ª venda -> última venda), escritura ---
  const vendasLinhas: LinhaGantt[] = [];
  if (eventosVendas.dataLancamentoComercial) {
    vendasLinhas.push({ id: "lancamento", nome: "Lançamento comercial", inicio: eventosVendas.dataLancamentoComercial, fim: eventosVendas.dataLancamentoComercial, ordem: 0 });
    todasAsDatas.push(eventosVendas.dataLancamentoComercial);
  }
  eventosVendas.porTipologia.forEach((t, i) => {
    if (t.primeiraData && t.ultimaData) {
      vendasLinhas.push({ id: t.tipologiaId, nome: `Vendas — ${t.nome}`, inicio: t.primeiraData, fim: t.ultimaData, ordem: i + 1 });
      todasAsDatas.push(t.primeiraData, t.ultimaData);
    }
  });
  if (eventosVendas.dataEscritura) {
    vendasLinhas.push({ id: "escritura", nome: "Escrituras", inicio: eventosVendas.dataEscritura, fim: eventosVendas.dataEscritura, ordem: 999 });
    todasAsDatas.push(eventosVendas.dataEscritura);
  }
  if (vendasLinhas.length > 0) {
    grupos.push({ grupo: "vendas", titulo: "Vendas", linhas: vendasLinhas });
  }

  // --- Financiamento: uma linha só, do primeiro drawdown até ao mês em que a dívida chega a zero ---
  const mesesComDrawdown = linhasFinanciamento.filter((l) => l.drawdown > 0);
  const mesesComAtividade = linhasFinanciamento.filter((l) => l.drawdown > 0 || l.saldoDivida > 0 || l.amortizacao > 0);
  if (mesesComDrawdown.length > 0 && mesesComAtividade.length > 0) {
    const inicio = `${mesesComDrawdown[0].mes}-01`;
    const fim = `${mesesComAtividade[mesesComAtividade.length - 1].mes}-01`;
    grupos.push({
      grupo: "financiamento",
      titulo: "Financiamento",
      linhas: [{ id: "financiamento", nome: "Financiamento bancário (drawdowns até liquidação)", inicio, fim, ordem: 0 }],
    });
    todasAsDatas.push(inicio, fim);
  }

  const datasOrdenadas = todasAsDatas.filter(Boolean).sort();
  return {
    grupos,
    dataInicial: datasOrdenadas[0] ?? null,
    dataFinal: datasOrdenadas[datasOrdenadas.length - 1] ?? null,
  };
}

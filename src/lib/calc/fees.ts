// Motor de development fees — Landwise, Fase 5 (parte 3), evoluído no
// Gate 3 da consolidação pré-relatório (03/08).
//
// Secção 9 do plano: "Todos os fees devem começar em 0 quando nenhum modelo
// específico for escolhido." Nunca calculado como percentagem sobre uma
// base que já inclua os próprios fees (evita circularidade) — usa sempre o
// capex/custo total JÁ resolvido pelo motor de custos (custos.ts).
//
// Secção 6 do prompt 03_08 (corrige o achado P0.1): o fee deixa de ser só
// um total agregado aplicado depois do cash flow — feesParaLinhasCusto()
// transforma cada fee numa linha mensal (mesmo formato de LinhaCusto),
// para entrar no MESMO calcularCashFlow que os custos normais, antes de
// financiamento e equity correrem. Isto é o que faz o fee aumentar a
// necessidade de dívida/equity no mês certo, entrar no peak equity e gerar
// juros quando financiado — nunca um segundo motor, só mais linhas na
// mesma entrada do motor existente.

import type { LinhaCusto } from "./custos";
import { calcDataFinal } from "./calendario";

export type TipoFee =
  | "origination"
  | "development"
  | "asset_management"
  | "project_management"
  | "acquisition"
  | "disposition"
  | "outro";

export type BaseCalculoFee =
  | "percentagem_vgv_bruto"
  | "percentagem_vgv_liquido"
  | "percentagem_aquisicao"
  | "percentagem_hard_costs"
  | "percentagem_capex"
  | "percentagem_custo_total"
  | "valor_fixo"
  | "valor_mensal"
  | "eur_m2"
  | "eur_unidade";

export type MomentoPagamentoFee =
  | "aquisicao"
  | "durante_desenvolvimento"
  | "proporcional_capex"
  | "mensal"
  | "conclusao"
  | "escritura"
  | "venda"
  | "data_personalizada";

export type Fee = {
  id: string;
  nome: string;
  tipo: TipoFee;
  baseCalculo: BaseCalculoFee;
  valorInput: number; // € fixo, ou percentagem decimal, ou taxa €/m² / €/unidade / €/mês
  momentoPagamento: MomentoPagamentoFee;
  dataPersonalizada: string | null;

  // Calendarização explícita (secção 6) — quando null, feesParaLinhasCusto
  // usa um valor por defeito derivado de momentoPagamento + datas reais do
  // projeto (nunca inventado: se a data de referência ainda não existe,
  // fica sem calendário, tal como uma linha de custo normal sem data).
  // Sempre rastreável e sobreponível — nunca aplicado silenciosamente por
  // cima de uma escolha manual do utilizador.
  dataInicial: string | null;
  duracaoMeses: number | null;
  perfilDesembolso: LinhaCusto["perfilDesembolso"];
  taxaIva: number | null;
  ivaRecuperavelPct: number;
};

// Categoria usada por feesParaLinhasCusto() para marcar as linhas geradas
// a partir de fees — cashflow.ts usa esta constante (nunca uma string
// repetida à mão) para separar fees de outros custos "outro" no ledger
// mensal, evitando contar o fee duas vezes (uma em outrosCustos, outra em
// `fees`) nas métricas de decisão.
export const CATEGORIA_DEVELOPMENT_FEE = "Development fee";

export type ContextoFees = {
  valorAquisicao: number;
  hardCostsTotal: number;
  capexTotal: number; // capex já resolvido pelo motor de custos — nunca inclui os fees desta lista
  custoTotal: number;
  vgvBruto: number;
  vgvLiquido: number;
  abcTotal: number;
  numeroUnidades: number;
};

/** Cria um fee "vazio" (0€) do tipo pedido — nunca um valor pré-definido sem o utilizador escolher um modelo. */
export function criarFeeZerado(id: string, nome: string, tipo: TipoFee): Fee {
  return {
    id,
    nome,
    tipo,
    baseCalculo: "valor_fixo",
    valorInput: 0,
    momentoPagamento: "aquisicao",
    dataPersonalizada: null,
    dataInicial: null,
    duracaoMeses: null,
    perfilDesembolso: "unico_inicio",
    taxaIva: null,
    ivaRecuperavelPct: 0,
  };
}

/**
 * duracaoMesesEfetiva é usada só pela base "valor_mensal" — tem de ser a
 * duração REALMENTE aplicada no calendário (já com o valor por defeito
 * resolvido), nunca fee.duracaoMeses em bruto, que pode ainda estar por
 * preencher quando o fee usa o calendário por defeito.
 */
export function resolverValorFee(fee: Fee, contexto: ContextoFees, duracaoMesesEfetiva?: number | null): number {
  switch (fee.baseCalculo) {
    case "valor_fixo":
      return fee.valorInput;
    case "valor_mensal":
      return fee.valorInput * Math.max(0, duracaoMesesEfetiva ?? fee.duracaoMeses ?? 0);
    case "percentagem_vgv_bruto":
      return fee.valorInput * contexto.vgvBruto;
    case "percentagem_vgv_liquido":
      return fee.valorInput * contexto.vgvLiquido;
    case "percentagem_aquisicao":
      return fee.valorInput * contexto.valorAquisicao;
    case "percentagem_hard_costs":
      return fee.valorInput * contexto.hardCostsTotal;
    case "percentagem_capex":
      return fee.valorInput * contexto.capexTotal;
    case "percentagem_custo_total":
      return fee.valorInput * contexto.custoTotal;
    case "eur_m2":
      return fee.valorInput * contexto.abcTotal;
    case "eur_unidade":
      return fee.valorInput * contexto.numeroUnidades;
    default:
      return 0;
  }
}

export type ResumoFees = { porTipo: Record<TipoFee, number>; total: number };

export function agregarFees(fees: Fee[], contexto: ContextoFees): ResumoFees {
  const porTipo: Record<TipoFee, number> = {
    origination: 0,
    development: 0,
    asset_management: 0,
    project_management: 0,
    acquisition: 0,
    disposition: 0,
    outro: 0,
  };
  for (const fee of fees) {
    porTipo[fee.tipo] += resolverValorFee(fee, contexto);
  }
  const total = Object.values(porTipo).reduce((s, v) => s + v, 0);
  return { porTipo, total };
}

// --- Calendarização (secção 6 do prompt 03_08 — corrige o achado P0.1) ---

export type DatasProjetoParaFees = {
  dataEscrituraAquisicao: string | null;
  dataInicioConstrucao: string | null;
  dataFimConstrucao: string | null;
  dataEscrituraVenda: string | null;
};

function diferencaMesesInclusive(inicio: string, fim: string): number | null {
  const a = new Date(`${inicio}T00:00:00Z`);
  const b = new Date(`${fim}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  return Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1);
}

/**
 * Calendário por defeito, derivado de momentoPagamento + datas reais do
 * projeto. Nunca inventa uma data: quando a data de referência ainda não
 * existe (ex.: fim de obra por preencher), devolve dataInicial null — a
 * linha fica sem calendário, exatamente como uma linha de custo normal sem
 * data (nunca entra no cash flow até ter uma data real).
 */
export function calendarioPorDefeitoFee(
  momento: MomentoPagamentoFee,
  dataPersonalizada: string | null,
  datas: DatasProjetoParaFees
): { dataInicial: string | null; duracaoMeses: number | null; perfilDesembolso: LinhaCusto["perfilDesembolso"] } {
  switch (momento) {
    case "aquisicao":
    case "escritura":
      return { dataInicial: datas.dataEscrituraAquisicao, duracaoMeses: 1, perfilDesembolso: "unico_inicio" };
    case "conclusao":
      return { dataInicial: datas.dataFimConstrucao, duracaoMeses: 1, perfilDesembolso: "unico_inicio" };
    case "venda":
      return { dataInicial: datas.dataEscrituraVenda, duracaoMeses: 1, perfilDesembolso: "unico_inicio" };
    case "durante_desenvolvimento":
    case "proporcional_capex":
    case "mensal": {
      if (!datas.dataInicioConstrucao || !datas.dataFimConstrucao) return { dataInicial: null, duracaoMeses: null, perfilDesembolso: "linear" };
      const duracao = diferencaMesesInclusive(datas.dataInicioConstrucao, datas.dataFimConstrucao);
      return { dataInicial: datas.dataInicioConstrucao, duracaoMeses: duracao, perfilDesembolso: "linear" };
    }
    case "data_personalizada":
      return { dataInicial: dataPersonalizada, duracaoMeses: 1, perfilDesembolso: "unico_inicio" };
    default:
      return { dataInicial: null, duracaoMeses: null, perfilDesembolso: "unico_inicio" };
  }
}

/**
 * Transforma cada fee numa linha mensal (mesmo formato de LinhaCusto) para
 * ser fundida com os custos normais ANTES de calcularCashFlow correr —
 * nunca um total aplicado depois (achado P0.1). O calendário explícito do
 * fee (dataInicial/duracaoMeses/perfilDesembolso) prevalece sempre sobre o
 * calendário por defeito; quando não está definido, usa
 * calendarioPorDefeitoFee. Fees sem data (nem própria, nem por defeito)
 * ficam sem calendário — nunca entram no cash flow, tal como um custo
 * normal sem data (nunca um valor inventado).
 */
export function feesParaLinhasCusto(fees: Fee[], contexto: ContextoFees, datasProjeto: DatasProjetoParaFees): LinhaCusto[] {
  return fees.map((fee) => {
    const calendarioEfetivo = fee.dataInicial
      ? { dataInicial: fee.dataInicial, duracaoMeses: fee.duracaoMeses, perfilDesembolso: fee.perfilDesembolso }
      : calendarioPorDefeitoFee(fee.momentoPagamento, fee.dataPersonalizada, datasProjeto);

    const valorResolvido = resolverValorFee(fee, contexto, calendarioEfetivo.duracaoMeses);
    const dataFinal =
      calendarioEfetivo.dataInicial && calendarioEfetivo.duracaoMeses ? calcDataFinal(calendarioEfetivo.dataInicial, calendarioEfetivo.duracaoMeses) : null;

    const linha: LinhaCusto = {
      id: fee.id,
      grupo: "outro",
      categoria: CATEGORIA_DEVELOPMENT_FEE,
      nome: fee.nome,
      tipoCalculo: "valor_fixo", // já resolvido acima — a linha entra no cash flow com o valor absoluto final
      valorInput: valorResolvido,
      baseReferenciaCustoId: null,
      taxaIva: fee.taxaIva,
      ivaRecuperavelPct: fee.ivaRecuperavelPct,
      dataIvaRecuperacao: null,
      dataInicial: calendarioEfetivo.dataInicial,
      duracaoMeses: calendarioEfetivo.duracaoMeses,
      dataFinal,
      perfilDesembolso: calendarioEfetivo.perfilDesembolso ?? "unico_inicio",
    };
    return linha;
  });
}

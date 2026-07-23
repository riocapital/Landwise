// Motor de development fees — Landwise, Fase 5 (parte 3)
//
// Secção 9 do plano: "Todos os fees devem começar em 0 quando nenhum modelo
// específico for escolhido." Nunca calculado como percentagem sobre uma
// base que já inclua os próprios fees (evita circularidade) — usa sempre o
// capex/custo total JÁ resolvido pelo motor de custos (custos.ts).

export type TipoFee =
  | "origination"
  | "development"
  | "asset_management"
  | "project_management"
  | "acquisition"
  | "disposition"
  | "outro";

export type BaseCalculoFee =
  | "percentagem_aquisicao"
  | "percentagem_hard_costs"
  | "percentagem_capex"
  | "percentagem_custo_total"
  | "valor_fixo"
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
  valorInput: number; // € fixo, ou percentagem decimal, ou taxa €/m² / €/unidade
  momentoPagamento: MomentoPagamentoFee;
  dataPersonalizada: string | null;
};

export type ContextoFees = {
  valorAquisicao: number;
  hardCostsTotal: number;
  capexTotal: number; // capex já resolvido pelo motor de custos — nunca inclui os fees desta lista
  custoTotal: number;
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
  };
}

export function resolverValorFee(fee: Fee, contexto: ContextoFees): number {
  switch (fee.baseCalculo) {
    case "valor_fixo":
      return fee.valorInput;
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

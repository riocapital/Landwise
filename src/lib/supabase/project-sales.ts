// Acesso a `project_sales_assumptions` — liga o wizard ao motor vendas.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanoVendas } from "./../calc/vendas";

export const PLANO_VENDAS_VAZIO: PlanoVendas = {
  dataLancamentoComercial: "",
  duracaoVendasMeses: 12,
  dataInicioConstrucao: "",
  dataFimConstrucao: "",
  dataEscritura: "",
  estruturaRecebimentos: { pctReserva: 0.1, pctCpcv: 0.2, pctDuranteConstrucao: 0.4, pctConclusao: 0.1, pctEscritura: 0.2 },
  comissaoMediacaoPct: 0.03,
  cancelamentosEstimadosPct: 0,
};

export async function carregarPlanoVendas(supabase: SupabaseClient, projectId: string): Promise<PlanoVendas> {
  const { data, error } = await supabase.from("project_sales_assumptions").select("*").eq("project_id", projectId).maybeSingle();
  if (error || !data) return PLANO_VENDAS_VAZIO;
  return {
    dataLancamentoComercial: data.data_lancamento_comercial ?? "",
    duracaoVendasMeses: data.duracao_vendas_meses ?? 12,
    dataInicioConstrucao: data.data_inicio_construcao ?? "",
    dataFimConstrucao: data.data_fim_construcao ?? "",
    dataEscritura: data.data_escritura ?? "",
    estruturaRecebimentos: {
      pctReserva: data.pct_reserva ?? 0.1,
      pctCpcv: data.pct_cpcv ?? 0.2,
      pctDuranteConstrucao: data.pct_durante_construcao ?? 0.4,
      pctConclusao: data.pct_conclusao ?? 0.1,
      pctEscritura: data.pct_escritura ?? 0.2,
    },
    comissaoMediacaoPct: data.comissao_mediacao_pct ?? 0.03,
    cancelamentosEstimadosPct: data.cancelamentos_estimados_pct ?? 0,
  };
}

export async function guardarPlanoVendas(supabase: SupabaseClient, projectId: string, plano: PlanoVendas): Promise<void> {
  await supabase.from("project_sales_assumptions").upsert(
    {
      project_id: projectId,
      data_lancamento_comercial: plano.dataLancamentoComercial || null,
      duracao_vendas_meses: plano.duracaoVendasMeses,
      data_inicio_construcao: plano.dataInicioConstrucao || null,
      data_fim_construcao: plano.dataFimConstrucao || null,
      data_escritura: plano.dataEscritura || null,
      pct_reserva: plano.estruturaRecebimentos.pctReserva,
      pct_cpcv: plano.estruturaRecebimentos.pctCpcv,
      pct_durante_construcao: plano.estruturaRecebimentos.pctDuranteConstrucao,
      pct_conclusao: plano.estruturaRecebimentos.pctConclusao,
      pct_escritura: plano.estruturaRecebimentos.pctEscritura,
      comissao_mediacao_pct: plano.comissaoMediacaoPct,
      cancelamentos_estimados_pct: plano.cancelamentosEstimadosPct,
    },
    { onConflict: "project_id" }
  );
}

// Motor de recomendação — Gate 6 (prompt 03_08, secção 17).
//
// A recomendação nunca depende só de lucro positivo. Usa uma POLÍTICA
// configurável (por organização/projeto) sobre indicadores já existentes
// no contrato central (underwriting.ts) — nunca uma régua universal
// hardcoded dentro desta função. Quem chama pode passar a sua própria
// política; POLITICA_REFERENCIA_LANDWISE é só o ponto de partida.

import type { ProjectUnderwritingResult } from "./underwriting";

export type NivelRecomendacao = "avancar" | "avancar_com_condicoes" | "rever_premissas" | "nao_avancar" | "dados_insuficientes";

export type PoliticaRecomendacao = {
  irrLeveredMinimo: number | null; // null = fator não usado por esta política
  irrUnleveredMinimo: number | null;
  roiLeveredMinimo: number | null;
  moicMinimo: number | null;
  ltcMaximo: number | null;
  duracaoMaximaMeses: number | null;
  exigirReconciliacoesOk: boolean;
};

/**
 * Ponto de partida de referência — não é uma régua universal (secção 17:
 * "não hardcode uma régua universal"). Cada organização/projeto pode
 * substituir por completo os seus próprios limiares.
 */
export const POLITICA_REFERENCIA_LANDWISE: PoliticaRecomendacao = {
  irrLeveredMinimo: 0.15,
  irrUnleveredMinimo: 0.08,
  roiLeveredMinimo: 0.2,
  moicMinimo: 1.3,
  ltcMaximo: 0.65,
  duracaoMaximaMeses: 48,
  exigirReconciliacoesOk: true,
};

export type FatorRecomendacao = {
  nome: string;
  valor: number | null;
  limiar: number | null;
  ok: boolean | null; // null = fator não avaliado (sem limiar na política ou sem valor calculado)
  peso: "critico" | "medio";
  explicacao: string;
};

export type ResultadoRecomendacao = {
  nivel: NivelRecomendacao;
  fatores: FatorRecomendacao[];
  politicaUsada: PoliticaRecomendacao;
};

function avaliarMinimo(nome: string, valor: number | null, limiar: number | null, peso: FatorRecomendacao["peso"], unidade: "pct" | "x" | "meses"): FatorRecomendacao {
  const fmt = (v: number) => (unidade === "pct" ? `${(v * 100).toFixed(1)}%` : unidade === "x" ? `${v.toFixed(2)}x` : `${v} meses`);
  if (limiar === null) return { nome, valor, limiar, ok: null, peso, explicacao: `${nome}: fator não usado por esta política.` };
  if (valor === null) return { nome, valor, limiar, ok: null, peso, explicacao: `${nome}: não calculável com os dados atuais.` };
  const ok = valor >= limiar;
  return { nome, valor, limiar, ok, peso, explicacao: `${nome}: ${fmt(valor)} ${ok ? "≥" : "<"} mínimo de ${fmt(limiar)}.` };
}

function avaliarMaximo(nome: string, valor: number | null, limiar: number | null, peso: FatorRecomendacao["peso"], unidade: "pct" | "meses"): FatorRecomendacao {
  const fmt = (v: number) => (unidade === "pct" ? `${(v * 100).toFixed(1)}%` : `${v} meses`);
  if (limiar === null) return { nome, valor, limiar, ok: null, peso, explicacao: `${nome}: fator não usado por esta política.` };
  if (valor === null) return { nome, valor, limiar, ok: null, peso, explicacao: `${nome}: não calculável com os dados atuais.` };
  const ok = valor <= limiar;
  return { nome, valor, limiar, ok, peso, explicacao: `${nome}: ${fmt(valor)} ${ok ? "≤" : ">"} máximo de ${fmt(limiar)}.` };
}

/**
 * Calcula a recomendação a partir do contrato central (underwriting.ts),
 * do número de alertas críticos já gerados (alertas.ts) e de uma política
 * configurável. Nunca recalcula nenhum indicador — só lê o que já existe.
 */
export function calcularRecomendacao(
  underwriting: ProjectUnderwritingResult | null,
  alertasCriticos: number,
  politica: PoliticaRecomendacao = POLITICA_REFERENCIA_LANDWISE
): ResultadoRecomendacao {
  if (!underwriting) {
    return { nivel: "dados_insuficientes", fatores: [], politicaUsada: politica };
  }

  const fatores: FatorRecomendacao[] = [
    avaliarMinimo("TIR alavancada", underwriting.leveredIrr, politica.irrLeveredMinimo, "critico", "pct"),
    avaliarMinimo("TIR não alavancada", underwriting.unleveredIrr, politica.irrUnleveredMinimo, "medio", "pct"),
    avaliarMinimo("ROI alavancado", underwriting.leveredRoi, politica.roiLeveredMinimo, "critico", "pct"),
    avaliarMinimo("MOIC", underwriting.moic, politica.moicMinimo, "medio", "x"),
    avaliarMaximo("LTC efetivo", underwriting.effectiveLtc, politica.ltcMaximo, "medio", "pct"),
    avaliarMaximo("Duração", underwriting.durationMonths, politica.duracaoMaximaMeses, "medio", "meses"),
    {
      nome: "Reconciliações",
      valor: underwriting.qualidade.todasReconciliacoesOk ? 1 : 0,
      limiar: politica.exigirReconciliacoesOk ? 1 : null,
      ok: politica.exigirReconciliacoesOk ? underwriting.qualidade.todasReconciliacoesOk : null,
      peso: "critico",
      explicacao: underwriting.qualidade.todasReconciliacoesOk
        ? "Reconciliações: todas dentro da tolerância de €0,01."
        : "Reconciliações: pelo menos uma fora da tolerância de €0,01 — resultado não fiável.",
    },
    {
      nome: "Alertas críticos",
      valor: alertasCriticos,
      limiar: 0,
      ok: alertasCriticos === 0,
      peso: "critico",
      explicacao: alertasCriticos > 0 ? `Alertas críticos: ${alertasCriticos} por resolver.` : "Alertas críticos: nenhum.",
    },
  ];

  const avaliados = fatores.filter((f) => f.ok !== null);
  const criticosFalhados = avaliados.filter((f) => f.peso === "critico" && f.ok === false).length;
  const mediosFalhados = avaliados.filter((f) => f.peso === "medio" && f.ok === false).length;

  let nivel: NivelRecomendacao;
  if (criticosFalhados >= 2) nivel = "nao_avancar";
  else if (criticosFalhados === 1) nivel = "rever_premissas";
  else if (mediosFalhados >= 2) nivel = "avancar_com_condicoes";
  else if (mediosFalhados === 1) nivel = "avancar_com_condicoes";
  else nivel = "avancar";

  return { nivel, fatores, politicaUsada: politica };
}

export const TIPOS_PROJETO = [
  "Terreno para Construção",
  "Terreno com Projeto Aprovado",
  "Prédio com PIP Qualificado",
  "Prédio para Reabilitação",
  "Prédio em Propriedade Total",
  "Apartamento para Remodelar",
  "Outro",
] as const;

export type TipoProjeto = (typeof TIPOS_PROJETO)[number];

const MAPA_TIPOS_LEGADOS: Record<string, TipoProjeto> = {
  "Terreno para construir": "Terreno para Construção",
  "Terreno para Construção": "Terreno para Construção",
  "Terreno com projeto aprovado": "Terreno com Projeto Aprovado",
  "Terreno com Projeto Aprovado": "Terreno com Projeto Aprovado",
  "Prédio aprovado": "Terreno com Projeto Aprovado",
  "Prédio com PIP qualificado": "Prédio com PIP Qualificado",
  "Prédio com PIP Qualificado": "Prédio com PIP Qualificado",
  "Prédio para reabilitação": "Prédio para Reabilitação",
  "Prédio para Reabilitação": "Prédio para Reabilitação",
  "Prédio em propriedade total": "Prédio em Propriedade Total",
  "Prédio em Propriedade Total": "Prédio em Propriedade Total",
  "Apartamento para remodelar": "Apartamento para Remodelar",
  "Apartamento para Remodelar": "Apartamento para Remodelar",
  Outro: "Outro",
};

export function normalizarTipoProjeto(valor: string | null | undefined): TipoProjeto {
  if (!valor) return "Terreno para Construção";
  return MAPA_TIPOS_LEGADOS[valor] ?? "Outro";
}

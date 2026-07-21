import { DEFAULT_INPUTS, calcularViabilidade, type ProjectInputs } from "@/lib/calc/viabilidade";

export const PROJETO_DEMO_INPUTS: ProjectInputs = {
  ...DEFAULT_INPUTS,
  areaLote: 2659,
  localizacao: "Benfica, Lisboa",
  custoTerreno: 2446440,
  custoConstrucaoM2: 1370,
  mapaVendas: [
    { bloco: "Bloco A", piso: 0, tipologia: "T2", quantidade: 6, premioPiso: 0 },
    { bloco: "Bloco A", piso: 1, tipologia: "T2", quantidade: 6, premioPiso: 0.02 },
    { bloco: "Bloco A", piso: 1, tipologia: "T3", quantidade: 4, premioPiso: 0.02 },
    { bloco: "Bloco A", piso: 2, tipologia: "T3", quantidade: 4, premioPiso: 0.04 },
    { bloco: "Bloco A", piso: 3, tipologia: "T4", quantidade: 3, premioPiso: 0.06 },
  ],
  duracaoTotalMeses: 22,
  duracaoObraMeses: 14,
  mesInicioObra: 5,
  ltv: 0.55,
  taxaJuroAnual: 0.065,
  comissaoMediadorPct: 0.05,
};

export function criarPayloadProjetoDemo(userId: string) {
  const results = calcularViabilidade(PROJETO_DEMO_INPUTS);
  return {
    user_id: userId,
    nome: "Projeto demonstrativo — Benfica, Lisboa",
    tipo_projeto: "Terreno para construir",
    localizacao: "Benfica, Lisboa",
    status: "calculado" as const,
    is_demo: true,
    inputs: PROJETO_DEMO_INPUTS,
    results,
    tir: results.tir,
    roi: results.roi,
    margem: results.margem,
  };
}

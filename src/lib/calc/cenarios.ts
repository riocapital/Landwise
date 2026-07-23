// Motor de cenários — Landwise, Fase 8 (parte 2)
//
// Secção 15 do plano. Reutiliza o mesmo motor de recálculo completo do
// sensibilidades.ts (calcularCenarioComVariacoes) — um cenário é apenas uma
// combinação nomeada e persistida de variações, nunca uma fórmula
// diferente.

import { calcularCenarioComVariacoes, extrairIndicador, type PremissasBaseSensibilidade } from "./sensibilidades";

export type Cenario = {
  id: string;
  nome: string;
  ehBase: boolean; // o cenário-base nunca pode ser apagado
  deltaAquisicao: number;
  deltaConstrucao: number;
  deltaPreco: number;
  criadoEm: string; // ISO
  autor: string | null;
};

export function criarCenarioBase(): Cenario {
  return {
    id: "base",
    nome: "Cenário-base",
    ehBase: true,
    deltaAquisicao: 0,
    deltaConstrucao: 0,
    deltaPreco: 0,
    criadoEm: new Date().toISOString(),
    autor: null,
  };
}

export function criarCenarioConservador(autor: string | null): Cenario {
  return {
    id: crypto.randomUUID(),
    nome: "Conservador",
    ehBase: false,
    deltaAquisicao: 0.05,
    deltaConstrucao: 0.05,
    deltaPreco: -0.05,
    criadoEm: new Date().toISOString(),
    autor,
  };
}

export function criarCenarioOtimista(autor: string | null): Cenario {
  return {
    id: crypto.randomUUID(),
    nome: "Otimista",
    ehBase: false,
    deltaAquisicao: -0.05,
    deltaConstrucao: -0.05,
    deltaPreco: 0.05,
    criadoEm: new Date().toISOString(),
    autor,
  };
}

/** Duplica um cenário existente com um novo nome — nunca marca a cópia como base. */
export function duplicarCenario(original: Cenario, novoNome: string, autor: string | null): Cenario {
  return { ...original, id: crypto.randomUUID(), nome: novoNome, ehBase: false, criadoEm: new Date().toISOString(), autor };
}

/** Impede apagar o cenário-base — devolve false sem apagar, para o chamador decidir como avisar o utilizador. */
export function podeApagarCenario(cenario: Cenario): boolean {
  return !cenario.ehBase;
}

export type LinhaComparacaoCenarios = {
  cenario: Cenario;
  aquisicao: number;
  precoVenda: number;
  custoConstrucao: number;
  gdv: number;
  custoTotal: number;
  equity: number;
  peakExposure: number;
  divida: number;
  lucro: number;
  margem: number;
  irr: number | null;
  moic: number | null;
};

/**
 * Recalcula e compara uma lista de cenários lado a lado, usando o mesmo
 * motor completo (nunca uma aproximação percentual).
 */
export function compararCenarios(base: PremissasBaseSensibilidade, cenarios: Cenario[]): LinhaComparacaoCenarios[] {
  const valorAquisicaoBase = base.linhasCusto.filter((l) => l.grupo === "aquisicao").reduce((s, l) => s + l.valorInput, 0);
  const custoConstrucaoBase = base.linhasCusto.filter((l) => l.grupo === "hard_cost").reduce((s, l) => s + l.valorInput, 0);

  return cenarios.map((cenario) => {
    const resultado = calcularCenarioComVariacoes(base, cenario.deltaAquisicao, cenario.deltaConstrucao, cenario.deltaPreco);
    return {
      cenario,
      aquisicao: valorAquisicaoBase * (1 + cenario.deltaAquisicao),
      precoVenda: base.receitaTotalGdvBase * (1 + cenario.deltaPreco),
      custoConstrucao: custoConstrucaoBase * (1 + cenario.deltaConstrucao),
      gdv: resultado.gdv,
      custoTotal: resultado.custoTotal,
      equity: resultado.equity.equityContributed,
      peakExposure: resultado.equity.peakCashExposure,
      divida: resultado.financiamento.peakDebt,
      lucro: resultado.lucroLevered,
      margem: resultado.margem,
      irr: extrairIndicador(resultado, "irr_levered"),
      moic: extrairIndicador(resultado, "moic"),
    };
  });
}

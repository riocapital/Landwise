// Motor de impostos e seguros — Landwise, Fase 6
//
// Regras críticas do plano (secção 10):
// - IMI incide sobre o VPT, nunca automaticamente sobre o valor de
//   aquisição ou o GDV.
// - IRC usa uma configuração anual atualizável (não taxas escritas dentro
//   de componentes) — aqui modelada como tabela/registo, nunca hardcoded
//   num objeto de UI.
// - Derrama estadual nunca se mistura com a taxa-base de IRC.
// - O resumo de IVA nesta secção é sempre calculado a partir das linhas de
//   custo (custos.ts) — nunca preenchido de novo.
// - Nunca mostrar SIC/SICAFI/fundo de investimento na interface pública
//   (isso é uma decisão de UI, não deste motor — mas o motor não define
//   nenhum desses termos, de propósito).

import type { LinhaCustoResolvida } from "./custos";

// --- Seguro ---

export type BaseCalculoSeguro = "valor_aquisicao" | "custo_total" | "gdv" | "valor_fixo";

export function calcSeguro(
  taxa: number,
  baseCalculo: BaseCalculoSeguro,
  valorBase: number,
  duracaoAnos: number
): { valorAnual: number; valorTotal: number } {
  const valorAnual = baseCalculo === "valor_fixo" ? valorBase : valorBase * taxa;
  return { valorAnual, valorTotal: valorAnual * duracaoAnos };
}

export const TAXA_SEGURO_SUGERIDA = 0.002; // 0,20% — sugestão editável, nunca obrigatória (secção 10 do plano)

// --- IMI (incide sobre o VPT, nunca sobre aquisição ou GDV) ---

export const TAXA_IMI_SUGERIDA = 0.003; // 0,30% — usado só na ausência de dados de localização

export function calcIMI(vpt: number, taxa: number, numAnos: number): { valorAnual: number; valorTotal: number } {
  const valorAnual = vpt * taxa;
  return { valorAnual, valorTotal: valorAnual * numAnos };
}

// --- IRC: configuração anual atualizável, nunca hardcoded num componente ---

export type ConfiguracaoIRCAnual = { ano: number; taxa: number };

/** Configuração de referência inicial (secção 10 do plano) — pensada para viver numa tabela na BD, não num componente. */
export const CONFIGURACAO_IRC_REFERENCIA: ConfiguracaoIRCAnual[] = [
  { ano: 2026, taxa: 0.19 },
  { ano: 2027, taxa: 0.18 },
  { ano: 2028, taxa: 0.17 }, // "2028 em diante" — obterTaxaIRCReferencia usa o último ano configurado quando o ano pedido é posterior
];

/** Devolve a taxa de referência para o ano pedido, usando o último ano configurado quando o ano é posterior ao topo da tabela. */
export function obterTaxaIRCReferencia(ano: number, configuracao: ConfiguracaoIRCAnual[] = CONFIGURACAO_IRC_REFERENCIA): number {
  const ordenada = [...configuracao].sort((a, b) => a.ano - b.ano);
  const exata = ordenada.find((c) => c.ano === ano);
  if (exata) return exata.taxa;
  const anteriores = ordenada.filter((c) => c.ano <= ano);
  if (anteriores.length > 0) return anteriores[anteriores.length - 1].taxa;
  return ordenada[0]?.taxa ?? 0;
}

export type ResultadoTaxaIRC = { taxa: number; taxaManualAplicada: boolean };

/**
 * Se `taxaManual` for fornecida e diferente da taxa de referência, é usada
 * — mas sinalizada como "Taxa manual aplicada" (nunca silenciosamente).
 */
export function resolverTaxaIRC(ano: number, taxaManual?: number | null, configuracao?: ConfiguracaoIRCAnual[]): ResultadoTaxaIRC {
  const referencia = obterTaxaIRCReferencia(ano, configuracao);
  if (taxaManual != null && taxaManual !== referencia) {
    return { taxa: taxaManual, taxaManualAplicada: true };
  }
  return { taxa: referencia, taxaManualAplicada: false };
}

export function calcLucroTributavel(lucroContabilistico: number, prejuizosFiscaisAcumulados: number): number {
  return Math.max(0, lucroContabilistico - Math.max(0, prejuizosFiscaisAcumulados));
}

export function calcIRC(lucroTributavel: number, taxa: number): number {
  return Math.max(0, lucroTributavel) * taxa;
}

// --- Derrama municipal (independente da derrama estadual e da taxa-base de IRC) ---

export function calcDerramaMunicipal(lucroTributavel: number, taxa: number): number {
  return Math.max(0, lucroTributavel) * taxa;
}

// --- Derrama estadual: por escalões, nunca misturada com a taxa-base de IRC ---

export type EscalaoDerramaEstadual = { min: number; max: number | null; taxa: number };

export const ESCALOES_DERRAMA_ESTADUAL_REFERENCIA: EscalaoDerramaEstadual[] = [
  { min: 1_500_000, max: 7_500_000, taxa: 0.03 },
  { min: 7_500_000, max: 35_000_000, taxa: 0.05 },
  { min: 35_000_000, max: null, taxa: 0.09 },
];

/**
 * Aplica a derrama estadual só à parcela do lucro tributável dentro de cada
 * escalão (progressiva) — nunca a taxa mais alta sobre o lucro inteiro, e
 * nunca somada à taxa-base de IRC antes deste cálculo.
 */
export function calcDerramaEstadual(
  lucroTributavel: number,
  escaloes: EscalaoDerramaEstadual[] = ESCALOES_DERRAMA_ESTADUAL_REFERENCIA
): number {
  let total = 0;
  for (const escalao of escaloes) {
    if (lucroTributavel <= escalao.min) continue;
    const tetoEscalao = escalao.max ?? Infinity;
    const parcela = Math.min(lucroTributavel, tetoEscalao) - escalao.min;
    if (parcela > 0) total += parcela * escalao.taxa;
  }
  return total;
}

// --- IMT e Imposto de Selo da aquisição ---

export type ResultadoImpostosAquisicao = { imt: number; imposeloAquisicao: number };

export function calcImpostosAquisicao(
  valorAquisicao: number,
  imtMetodo: "percentagem" | "valor_manual",
  imtValor: number, // percentagem (decimal) se método = percentagem, valor absoluto se manual
  taxaImpostoSelo: number
): ResultadoImpostosAquisicao {
  const imt = imtMetodo === "percentagem" ? valorAquisicao * imtValor : imtValor;
  const imposeloAquisicao = valorAquisicao * taxaImpostoSelo;
  return { imt, imposeloAquisicao };
}

// --- IVA consolidado (secção 10 do plano): sempre calculado a partir dos custos, nunca preenchido de novo ---

export type ResumoIVAConsolidado = {
  ivaSuportado: number;
  ivaRecuperavel: number;
  ivaRecuperado: number; // parte do recuperável cuja data de recuperação já passou face à dataReferencia
  ivaNaoRecuperavel: number;
  saldoIva: number; // recuperável ainda não recuperado
};

export function agregarIVAConsolidado(linhasCusto: LinhaCustoResolvida[], dataReferencia: string): ResumoIVAConsolidado {
  const ivaSuportado = linhasCusto.reduce((s, l) => s + l.ivaSuportado, 0);
  const ivaRecuperavel = linhasCusto.reduce((s, l) => s + l.ivaRecuperavel, 0);
  const ivaNaoRecuperavel = linhasCusto.reduce((s, l) => s + l.ivaNaoRecuperavel, 0);

  const ivaRecuperado = linhasCusto
    .filter((l) => l.dataIvaRecuperacao && l.dataIvaRecuperacao <= dataReferencia)
    .reduce((s, l) => s + l.ivaRecuperavel, 0);

  return {
    ivaSuportado,
    ivaRecuperavel,
    ivaRecuperado,
    ivaNaoRecuperavel,
    saldoIva: ivaRecuperavel - ivaRecuperado,
  };
}

// Motor da Sales Table — Landwise, Fase 1 da revisão estrutural.
//
// Fonte única do VGV (secção 14/19 do plano de revisão). Nenhum outro
// ficheiro deve somar preços de unidades para chegar ao VGV — é sempre
// calcVgvBruto() sobre as linhas desta tabela.

import type { Typology } from "./areas";

export type EstadoComercialUnidade = "disponivel" | "reservado" | "vendido" | "escriturado";

export type UnidadeVenda = {
  id: string;
  tipologiaId: string;
  ordem: number; // posição dentro da tipologia (para gerar o número da unidade)
  bloco: string | null;
  piso: string | null;

  abp: number;
  varandaM2: number;
  terracoM2: number;
  outrasAreasM2: number;

  estacionamentos: number;
  valorEstacionamento: number;

  precoBaseM2: number; // herdado da tipologia no momento da criação/sync
  ajusteFaseComercialPct: number; // aplicado pela evolução de preços (soma-se ou substitui, ver price-escalation)
  premioDescontoUnidade: number; // valor absoluto (+/-) específico desta unidade
  overrideManualValor: number | null; // se definido, prevalece sobre tudo o resto

  precoBloqueado: boolean; // impede alteração automática por sync/evolução de preços
  personalizada: boolean; // true assim que o utilizador edita manualmente qualquer campo — protege de sync automático

  dataVenda: string | null;
  sinalValor: number;
  reforcosValor: number;
  dataEscritura: string | null;
  estadoComercial: EstadoComercialUnidade;
};

export function coeficientesPorTipologia(tipologia: Typology): {
  varandaCoef: number;
  terracoCoef: number;
  jardimCoef: number;
  arrecadacaoCoef: number;
} {
  return {
    varandaCoef: tipologia.varandaPctValorizacao,
    terracoCoef: tipologia.terracoPctValorizacao,
    jardimCoef: tipologia.jardimPctValorizacao,
    arrecadacaoCoef: tipologia.arrecadacaoPctValorizacao,
  };
}

/** ABD física: soma das áreas dependentes físicas, sem qualquer coeficiente aplicado. */
export function calcAbdFisica(unidade: Pick<UnidadeVenda, "varandaM2" | "terracoM2" | "outrasAreasM2">): number {
  return unidade.varandaM2 + unidade.terracoM2 + unidade.outrasAreasM2;
}

/**
 * ABD vendável: cada área dependente pesada pelo SEU PRÓPRIO coeficiente —
 * nunca um coeficiente único aplicado à soma (isso duplicaria a lógica de
 * valorização e divergiria dos coeficientes definidos na tipologia).
 */
export function calcAbdVendavel(
  unidade: Pick<UnidadeVenda, "varandaM2" | "terracoM2" | "outrasAreasM2">,
  coeficientes: { varandaCoef: number; terracoCoef: number; outrasAreasCoef: number }
): number {
  return unidade.varandaM2 * coeficientes.varandaCoef + unidade.terracoM2 * coeficientes.terracoCoef + unidade.outrasAreasM2 * coeficientes.outrasAreasCoef;
}

export function calcAreaVendavel(abp: number, abdVendavel: number): number {
  return abp + abdVendavel;
}

/**
 * Hierarquia de preço (secção 14 do plano): preço-base + ajuste de fase
 * comercial + prémio/desconto da unidade + override manual. O override
 * manual, quando definido, substitui tudo o resto — nunca se soma a ele.
 */
export function calcPrecoFinalUnidade(unidade: UnidadeVenda, areaVendavel: number): number {
  if (unidade.overrideManualValor !== null) return unidade.overrideManualValor;

  const precoBaseAjustado = unidade.precoBaseM2 * (1 + unidade.ajusteFaseComercialPct);
  return precoBaseAjustado * areaVendavel + unidade.valorEstacionamento + unidade.premioDescontoUnidade;
}

/** Gera as unidades-base de uma tipologia (uma linha por unidade, sem personalização). */
export function gerarUnidadesDeTipologia(tipologia: Typology, quantidade: number, ordemInicial: number): UnidadeVenda[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    id: crypto.randomUUID(),
    tipologiaId: tipologia.id,
    ordem: ordemInicial + i,
    bloco: null,
    piso: null,
    abp: tipologia.abpUnidade,
    varandaM2: tipologia.varandaM2,
    terracoM2: tipologia.terracoM2,
    outrasAreasM2: tipologia.jardimPrivativoM2 + tipologia.arrecadacaoM2,
    estacionamentos: tipologia.estacionamentosIncluidos,
    valorEstacionamento: tipologia.estacionamentosIncluidos * tipologia.valorEstacionamento,
    precoBaseM2: tipologia.precoBaseM2,
    ajusteFaseComercialPct: 0,
    premioDescontoUnidade: 0,
    overrideManualValor: null,
    precoBloqueado: false,
    personalizada: false,
    dataVenda: null,
    sinalValor: 0,
    reforcosValor: 0,
    dataEscritura: null,
    estadoComercial: "disponivel",
  }));
}

export type ResultadoSincronizacao = {
  paraCriar: number; // quantas unidades novas gerar
  candidatasARemover: UnidadeVenda[]; // unidades não personalizadas, não vendidas — pedem confirmação antes de remover
  bloqueadasParaRemover: UnidadeVenda[]; // vendidas/personalizadas que a diminuição de quantidade NUNCA pode apagar
};

/**
 * Calcula o que fazer quando a quantidade de uma tipologia muda.
 * Nunca decide sozinho apagar uma unidade — só devolve candidatos, quem
 * chama é que decide depois de confirmação do utilizador (secção 14).
 */
export function calcularSincronizacao(unidadesExistentes: UnidadeVenda[], novaQuantidade: number): ResultadoSincronizacao {
  const atual = unidadesExistentes.length;

  if (novaQuantidade > atual) {
    return { paraCriar: novaQuantidade - atual, candidatasARemover: [], bloqueadasParaRemover: [] };
  }

  if (novaQuantidade === atual) {
    return { paraCriar: 0, candidatasARemover: [], bloqueadasParaRemover: [] };
  }

  const aRemoverCount = atual - novaQuantidade;
  const removiveis = unidadesExistentes.filter((u) => !u.personalizada && u.estadoComercial === "disponivel");
  const bloqueadas = unidadesExistentes.filter((u) => u.personalizada || u.estadoComercial !== "disponivel");

  return {
    paraCriar: 0,
    candidatasARemover: removiveis.slice(0, aRemoverCount),
    bloqueadasParaRemover: bloqueadas,
  };
}

export type ValidacaoVenda = { valido: boolean; erro?: string };

/** Nunca permite vender uma unidade já vendida, nem mais unidades do que o stock (secção 15). */
export function validarVenda(unidade: UnidadeVenda): ValidacaoVenda {
  if (unidade.estadoComercial !== "disponivel") {
    return { valido: false, erro: "Esta unidade já não está disponível — não pode ser vendida novamente." };
  }
  return { valido: true };
}

export type LinhaSalesTableResolvida = UnidadeVenda & {
  abdFisica: number;
  abdVendavel: number;
  areaVendavel: number;
  precoFinal: number;
};

export function resolverSalesTable(unidades: UnidadeVenda[], tipologias: Typology[]): LinhaSalesTableResolvida[] {
  const tipologiasPorId = new Map(tipologias.map((t) => [t.id, t]));
  return unidades.map((u) => {
    const tipologia = tipologiasPorId.get(u.tipologiaId);
    const coeficientes = tipologia
      ? { varandaCoef: tipologia.varandaPctValorizacao, terracoCoef: tipologia.terracoPctValorizacao, outrasAreasCoef: tipologia.jardimPctValorizacao }
      : { varandaCoef: 0, terracoCoef: 0, outrasAreasCoef: 0 };

    const abdFisica = calcAbdFisica(u);
    const abdVendavel = calcAbdVendavel(u, coeficientes);
    const areaVendavel = calcAreaVendavel(u.abp, abdVendavel);
    const precoFinal = calcPrecoFinalUnidade(u, areaVendavel);

    return { ...u, abdFisica, abdVendavel, areaVendavel, precoFinal };
  });
}

/**
 * VGV Bruto — fonte única (secção 14/19 do plano). Nunca calculado como
 * quantidade × preço médio; é sempre a soma real das linhas da Sales Table.
 */
export function calcVgvBruto(linhasResolvidas: LinhaSalesTableResolvida[]): number {
  return linhasResolvidas.reduce((s, l) => s + l.precoFinal, 0);
}

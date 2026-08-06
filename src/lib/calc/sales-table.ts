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

  estacionamentos: number; // legado — preservado para projetos antigos, já não é escrito pela UI geral (secção 8 do plano 03_08)
  valorEstacionamento: number; // ajuste manual explícito, começa sempre em 0 — nunca gerado automaticamente pela tipologia ou comparáveis
  incluiGaragem: boolean; // atributo de comparabilidade da unidade — nunca cria prémio automático

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
    // Nunca um prémio automático (achado P1.5 da auditoria 03_08): garagem é
    // um atributo de comparabilidade, não um valor gerado pela tipologia.
    // valorEstacionamento começa sempre em 0 — só existe como ajuste manual
    // explícito, editado depois na Sales Table.
    valorEstacionamento: 0,
    incluiGaragem: tipologia.estacionamentosIncluidos > 0,
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

// --- Ressincronização de atributos herdados (secção 11 do prompt 03_08) ---
//
// calcularSincronizacao (acima) só trata a QUANTIDADE de unidades. Alterar
// o preço-base, a área ou a garagem da tipologia depois de a Sales Table já
// existir não atualizava as unidades já geradas (achado P1.1 da auditoria).
// As funções abaixo tratam essa segunda dimensão, sempre respeitando as
// mesmas proteções: unidades vendidas/escrituradas ou com preço bloqueado
// nunca são tocadas automaticamente; unidades personalizadas só são
// tocadas quando o utilizador escolhe explicitamente substituir.

export type CampoAtributoUnidade = "abp" | "varandaM2" | "terracoM2" | "outrasAreasM2" | "precoBaseM2" | "incluiGaragem";

export type DesvioAtributoUnidade = {
  campo: CampoAtributoUnidade;
  valorAtual: number | boolean;
  valorTipologia: number | boolean;
};

export type UnidadeComDesvio = { unidade: UnidadeVenda; desvios: DesvioAtributoUnidade[] };

export type ResultadoSincronizacaoAtributos = {
  unidadesComDesvio: UnidadeComDesvio[]; // elegíveis para atualização automática (disponíveis, sem preço bloqueado)
  unidadesBloqueadasComDesvio: UnidadeComDesvio[]; // têm desvio mas nunca são tocadas automaticamente (vendidas/escrituradas/preço bloqueado)
};

function valoresAtributosDaTipologia(tipologia: Typology): Record<CampoAtributoUnidade, number | boolean> {
  return {
    abp: tipologia.abpUnidade,
    varandaM2: tipologia.varandaM2,
    terracoM2: tipologia.terracoM2,
    outrasAreasM2: tipologia.jardimPrivativoM2 + tipologia.arrecadacaoM2,
    precoBaseM2: tipologia.precoBaseM2,
    incluiGaragem: tipologia.estacionamentosIncluidos > 0,
  };
}

function unidadeNuncaTocadaAutomaticamente(u: UnidadeVenda): boolean {
  return u.precoBloqueado || u.estadoComercial !== "disponivel";
}

/**
 * Compara cada unidade existente com os atributos ATUAIS da tipologia e
 * devolve os desvios encontrados — nunca decide sozinho aplicar nada, só
 * informa (o chamador decide preservar overrides, substituir, ou cancelar).
 */
export function detetarDesviosAtributos(unidadesExistentes: UnidadeVenda[], tipologia: Typology): ResultadoSincronizacaoAtributos {
  const valoresTipologia = valoresAtributosDaTipologia(tipologia);
  const campos = Object.keys(valoresTipologia) as CampoAtributoUnidade[];

  const unidadesComDesvio: UnidadeComDesvio[] = [];
  const unidadesBloqueadasComDesvio: UnidadeComDesvio[] = [];

  for (const u of unidadesExistentes) {
    const desvios: DesvioAtributoUnidade[] = [];
    for (const campo of campos) {
      const valorAtual = u[campo];
      const valorTipologia = valoresTipologia[campo];
      if (valorAtual !== valorTipologia) {
        desvios.push({ campo, valorAtual, valorTipologia });
      }
    }
    if (desvios.length === 0) continue;
    (unidadeNuncaTocadaAutomaticamente(u) ? unidadesBloqueadasComDesvio : unidadesComDesvio).push({ unidade: u, desvios });
  }

  return { unidadesComDesvio, unidadesBloqueadasComDesvio };
}

export type ModoSincronizacaoAtributos = "substituir" | "preservar_overrides";

/**
 * Aplica os atributos atuais da tipologia às unidades elegíveis.
 * "preservar_overrides": unidades marcadas `personalizada` ficam como estão.
 * "substituir": todas as unidades elegíveis (disponíveis, sem preço
 * bloqueado) recebem os valores da tipologia, mesmo que personalizadas —
 * mas nunca uma vendida/escriturada/com preço bloqueado, em nenhum modo.
 */
export function aplicarSincronizacaoAtributos(
  unidadesExistentes: UnidadeVenda[],
  tipologia: Typology,
  modo: ModoSincronizacaoAtributos
): UnidadeVenda[] {
  const valoresTipologia = valoresAtributosDaTipologia(tipologia);
  return unidadesExistentes.map((u) => {
    if (unidadeNuncaTocadaAutomaticamente(u)) return u;
    if (u.personalizada && modo === "preservar_overrides") return u;
    return {
      ...u,
      abp: valoresTipologia.abp as number,
      varandaM2: valoresTipologia.varandaM2 as number,
      terracoM2: valoresTipologia.terracoM2 as number,
      outrasAreasM2: valoresTipologia.outrasAreasM2 as number,
      precoBaseM2: valoresTipologia.precoBaseM2 as number,
      incluiGaragem: valoresTipologia.incluiGaragem as boolean,
    };
  });
}

/**
 * "Restaurar valores automáticos" (secção 11): repõe os atributos herdados
 * da tipologia numa única unidade e limpa a personalização/override de
 * preço — nunca numa unidade vendida/escriturada ou com preço bloqueado.
 * Preserva sinal/reforços/data de escritura já registados (não são
 * atributos herdados da tipologia).
 */
export function restaurarValoresAutomaticos(unidade: UnidadeVenda, tipologia: Typology): UnidadeVenda {
  if (unidadeNuncaTocadaAutomaticamente(unidade)) return unidade;
  const valoresTipologia = valoresAtributosDaTipologia(tipologia);
  return {
    ...unidade,
    abp: valoresTipologia.abp as number,
    varandaM2: valoresTipologia.varandaM2 as number,
    terracoM2: valoresTipologia.terracoM2 as number,
    outrasAreasM2: valoresTipologia.outrasAreasM2 as number,
    precoBaseM2: valoresTipologia.precoBaseM2 as number,
    incluiGaragem: valoresTipologia.incluiGaragem as boolean,
    premioDescontoUnidade: 0,
    overrideManualValor: null,
    personalizada: false,
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

/**
 * Data de escritura por defeito de uma unidade: fim de obra + X meses. Só
 * sugestão — a Sales Table permite sempre sobrepor manualmente por unidade
 * (campo dataEscritura da própria unidade prevalece quando preenchido).
 */
export function calcDataEscrituraDefeito(dataFimConstrucao: string, duracaoMeses: number): string | null {
  if (!dataFimConstrucao) return null;
  const [ano, mes, dia] = dataFimConstrucao.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  const d = new Date(Date.UTC(ano, mes - 1 + Math.max(0, Math.floor(duracaoMeses)), dia));
  return d.toISOString().slice(0, 10);
}

/**
 * Sinal + reforços da unidade nunca podem ultrapassar o preço final —
 * mesmo espírito da validação já aplicada à aquisição (secção 7 do plano).
 * O valor da escritura é sempre o residual: precoFinal - sinal - reforços.
 */
export function validarEscrituraUnidade(unidade: Pick<UnidadeVenda, "sinalValor" | "reforcosValor">, precoFinal: number): ValidacaoVenda {
  const soma = unidade.sinalValor + unidade.reforcosValor;
  if (soma - precoFinal > 0.005) {
    return { valido: false, erro: "Sinal e reforços não podem ultrapassar o preço final da unidade." };
  }
  return { valido: true };
}

/** Valor da escritura — residual, nunca um campo independente que possa divergir do preço final. */
export function calcValorEscrituraUnidade(unidade: Pick<UnidadeVenda, "sinalValor" | "reforcosValor">, precoFinal: number): number {
  return Math.max(0, precoFinal - unidade.sinalValor - unidade.reforcosValor);
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

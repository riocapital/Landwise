// Motor de custos — Landwise, Fase 4
//
// Resolve o valor de cada linha de custo consoante o tipo de base escolhido,
// sem duplicar IVA e sem circularidade: bases que dependem de agregados
// (hard costs, capex, custo total) só são resolvidas depois de as linhas
// "diretas" (valor fixo, €/m², % da aquisição) estarem calculadas — em
// estágios, não com um solver iterativo (mais previsível e auditável).

export type GrupoCusto = "aquisicao" | "hard_cost" | "soft_cost" | "outro";

export type TipoCalculoCusto =
  | "valor_fixo"
  | "valor_mensal"
  | "percentagem_aquisicao"
  | "percentagem_hard_costs"
  | "percentagem_capex"
  | "percentagem_custo_total"
  | "eur_m2_abc_acima"
  | "eur_m2_abc_abaixo"
  | "eur_m2_abd"
  | "eur_m2_abc_principal"
  | "eur_m2_abc_total"
  | "eur_unidade"
  | "percentagem_outra_base";

export type LinhaCusto = {
  id: string;
  grupo: GrupoCusto;
  categoria: string;
  nome: string;
  tipoCalculo: TipoCalculoCusto;
  valorInput: number; // € fixo, decimal 0-1 (percentagem), ou taxa €/m² / €/unidade
  baseReferenciaCustoId: string | null;
  taxaIva: number | null;
  ivaRecuperavelPct: number; // 0-1
  dataIvaRecuperacao: string | null;
  dataInicial: string | null;
  duracaoMeses: number | null;
  dataFinal: string | null;
  perfilDesembolso: "unico_inicio" | "unico_fim" | "linear" | "curva_s" | "front_loaded" | "back_loaded" | "personalizado";
};

export type ContextoCusto = {
  valorAquisicao: number;
  abcAcimaSolo: number; // secção 21 da revisão estrutural: base automática de "Construção acima do solo"
  abcAbaixoSolo: number; // base automática de "Construção abaixo do solo"
  abdTotal: number; // Área Bruta Dependente total — base automática de "Construção dependente"
  numeroUnidades: number;
};

/** ABC principal (acima+abaixo, sem ABD) — derivado, nunca guardado em duplicado no contexto. */
function calcAbcPrincipalContexto(contexto: ContextoCusto): number {
  return contexto.abcAcimaSolo + contexto.abcAbaixoSolo;
}

/** ABC Total (acima+abaixo+ABD) — derivado, nunca guardado em duplicado no contexto. */
function calcAbcTotalContexto(contexto: ContextoCusto): number {
  return calcAbcPrincipalContexto(contexto) + contexto.abdTotal;
}

export type LinhaCustoResolvida = LinhaCusto & {
  valorResolvido: number; // € absoluto, já calculado
  custoSemIva: number;
  ivaSuportado: number;
  ivaRecuperavel: number;
  ivaNaoRecuperavel: number;
};

// --- Preço de aquisição vs. custos de aquisição (auditoria financeira — nunca voltar a confundir) ---
//
// Dentro do grupo 'aquisicao', algumas linhas representam o PREÇO do ativo
// (sinal, reforços, escritura) — não são um custo acessório, são o próprio
// preço de compra, repartido por datas de pagamento. As restantes linhas
// (due diligence, notário, registos, IMT, imposto de selo, comissão de
// aquisição, outros) são custos acessórios reais. Um bug real (auditoria
// financeira) misturava as duas coisas: "Aquisição" e "Custos de aquisição"
// eram ambos calculados como a soma de TODAS as linhas do grupo, mostrando
// o mesmo valor duas vezes. Esta é a fonte única da distinção — nunca
// reimplementar este filtro noutro sítio (wizard, dashboard, relatórios).
const NOMES_LINHAS_PRECO_AQUISICAO = ["Sinal da aquisição", "Escritura da aquisição"];

export function ehLinhaPrecoAquisicao(nome: string): boolean {
  return NOMES_LINHAS_PRECO_AQUISICAO.includes(nome) || nome.startsWith("Reforço da aquisição");
}

/**
 * Custos de aquisição = soma das linhas do grupo 'aquisicao' que NÃO
 * representam o preço de compra (sinal/reforços/escritura) — nunca inclui
 * o preço do ativo, nunca o mesmo valor que "Aquisição".
 */
export function calcCustosAquisicaoAcessorios(linhasResolvidas: LinhaCustoResolvida[]): number {
  return linhasResolvidas
    .filter((l) => l.grupo === "aquisicao" && !ehLinhaPrecoAquisicao(l.nome))
    .reduce((s, l) => s + l.valorResolvido, 0);
}

function valorDireto(linha: LinhaCusto, contexto: ContextoCusto): number | null {
  switch (linha.tipoCalculo) {
    case "valor_fixo":
      return linha.valorInput;
    case "valor_mensal":
      return linha.valorInput * Math.max(0, linha.duracaoMeses ?? 0);
    case "percentagem_aquisicao":
      return linha.valorInput * contexto.valorAquisicao;
    case "eur_m2_abc_acima":
      return linha.valorInput * contexto.abcAcimaSolo;
    case "eur_m2_abc_abaixo":
      return linha.valorInput * contexto.abcAbaixoSolo;
    case "eur_m2_abd":
      return linha.valorInput * contexto.abdTotal;
    case "eur_m2_abc_principal":
      return linha.valorInput * calcAbcPrincipalContexto(contexto);
    case "eur_m2_abc_total":
      return linha.valorInput * calcAbcTotalContexto(contexto);
    case "eur_unidade":
      return linha.valorInput * contexto.numeroUnidades;
    default:
      return null; // depende de agregados — resolvido em estágio posterior
  }
}

/**
 * Resolve o valor absoluto (€) de cada linha de custo, em estágios:
 *
 * A) Bases diretas: valor_fixo, valor_mensal, percentagem_aquisicao, eur_m2_abc_acima, eur_m2_abc_abaixo, eur_m2_abd, eur_m2_abc_principal, eur_m2_abc_total, eur_unidade.
 * B) percentagem_hard_costs: soma dos hard costs já resolvidos no estágio A (nunca inclui a própria linha).
 * C) percentagem_capex / percentagem_custo_total: soma de aquisição + hard costs (A+B) + soft costs
 *    já resolvidos nos estágios A/B (exclui a própria linha e outras ainda não resolvidas nesta fase).
 * D) percentagem_outra_base: aponta para uma linha específica (base_referencia_custo_id), resolvida
 *    em qualquer estágio anterior — nunca circular (uma linha não pode referenciar-se a si mesma).
 *
 * Uma linha de contingência que aponte para "percentagem_hard_costs" nunca soma a si própria —
 * mesmo que esteja marcada como hard_cost, é excluída do total usado como sua própria base.
 */
export function resolverValoresCustos(linhas: LinhaCusto[], contexto: ContextoCusto): Map<string, number> {
  const resolvido = new Map<string, number>();

  // Estágio A
  for (const linha of linhas) {
    const v = valorDireto(linha, contexto);
    if (v !== null) resolvido.set(linha.id, v);
  }

  // Estágio B: percentagem_hard_costs
  const hardCostsBaseA = linhas.filter((l) => l.grupo === "hard_cost" && resolvido.has(l.id));
  for (const linha of linhas) {
    if (linha.tipoCalculo === "percentagem_hard_costs") {
      const baseTotal = hardCostsBaseA
        .filter((l) => l.id !== linha.id)
        .reduce((s, l) => s + (resolvido.get(l.id) ?? 0), 0);
      resolvido.set(linha.id, linha.valorInput * baseTotal);
    }
  }

  // Estágio C: percentagem_capex / percentagem_custo_total
  // Capex conhecido até aqui = tudo o que já foi resolvido nos estágios A e B.
  const capexParcial = () =>
    linhas.filter((l) => resolvido.has(l.id)).reduce((s, l) => s + (resolvido.get(l.id) ?? 0), 0);
  for (const linha of linhas) {
    if (linha.tipoCalculo === "percentagem_capex" || linha.tipoCalculo === "percentagem_custo_total") {
      const base = capexParcial();
      resolvido.set(linha.id, linha.valorInput * base);
    }
  }

  // Estágio D: percentagem_outra_base — referência direta a outra linha já resolvida.
  for (const linha of linhas) {
    if (linha.tipoCalculo === "percentagem_outra_base" && linha.baseReferenciaCustoId) {
      const baseValor = resolvido.get(linha.baseReferenciaCustoId) ?? 0;
      resolvido.set(linha.id, linha.valorInput * baseValor);
    }
  }

  // Qualquer linha ainda sem valor (referência inválida/em falta) fica a 0 — nunca inventado.
  for (const linha of linhas) {
    if (!resolvido.has(linha.id)) resolvido.set(linha.id, 0);
  }

  return resolvido;
}

/**
 * Separa cada linha em custo sem IVA / IVA suportado / IVA recuperável / IVA
 * não recuperável. Nunca conta o IVA duas vezes: cada linha tem a sua
 * própria taxa e percentagem recuperável — não há linhas globais de IVA.
 */
export function calcIvaLinha(
  valorResolvido: number,
  taxaIva: number | null,
  ivaRecuperavelPct: number
): { custoSemIva: number; ivaSuportado: number; ivaRecuperavel: number; ivaNaoRecuperavel: number } {
  if (!taxaIva) {
    return { custoSemIva: valorResolvido, ivaSuportado: 0, ivaRecuperavel: 0, ivaNaoRecuperavel: 0 };
  }
  const ivaSuportado = valorResolvido * taxaIva;
  const ivaRecuperavel = ivaSuportado * ivaRecuperavelPct;
  const ivaNaoRecuperavel = ivaSuportado - ivaRecuperavel;
  return { custoSemIva: valorResolvido, ivaSuportado, ivaRecuperavel, ivaNaoRecuperavel };
}

export function resolverCustos(linhas: LinhaCusto[], contexto: ContextoCusto): LinhaCustoResolvida[] {
  const valores = resolverValoresCustos(linhas, contexto);
  return linhas.map((linha) => {
    const valorResolvido = valores.get(linha.id) ?? 0;
    const iva = calcIvaLinha(valorResolvido, linha.taxaIva, linha.ivaRecuperavelPct);
    return { ...linha, valorResolvido, ...iva };
  });
}

export type ResumoCustos = {
  totalAquisicao: number;
  totalHardCosts: number;
  totalSoftCosts: number;
  totalOutros: number;
  custoTotal: number;
  ivaSuportadoTotal: number;
  ivaRecuperavelTotal: number;
  ivaNaoRecuperavelTotal: number;
};

export function agregarCustos(linhasResolvidas: LinhaCustoResolvida[]): ResumoCustos {
  const porGrupo = (g: GrupoCusto) =>
    linhasResolvidas.filter((l) => l.grupo === g).reduce((s, l) => s + l.valorResolvido, 0);

  const totalAquisicao = porGrupo("aquisicao");
  const totalHardCosts = porGrupo("hard_cost");
  const totalSoftCosts = porGrupo("soft_cost");
  const totalOutros = porGrupo("outro");

  return {
    totalAquisicao,
    totalHardCosts,
    totalSoftCosts,
    totalOutros,
    custoTotal: totalAquisicao + totalHardCosts + totalSoftCosts + totalOutros,
    ivaSuportadoTotal: linhasResolvidas.reduce((s, l) => s + l.ivaSuportado, 0),
    ivaRecuperavelTotal: linhasResolvidas.reduce((s, l) => s + l.ivaRecuperavel, 0),
    ivaNaoRecuperavelTotal: linhasResolvidas.reduce((s, l) => s + l.ivaNaoRecuperavel, 0),
  };
}

// --- Calendário de cada linha (secção 11 do plano: início + duração = fim) ---
//
// A implementação vive em calendario.ts (Fase 7) — reexportada aqui para não
// duplicar a lógica (secção 19 do plano: um único motor por indicador).
export { calcDataFinal, calcDuracaoMeses } from "./calendario";

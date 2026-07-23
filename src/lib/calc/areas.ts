// Motor de áreas — Landwise, Fase 1
//
// Funções puras. Não dependem de React, Supabase, nem de estado global.
// Reutilizadas por: wizard (Identificação + Programa), dashboard, sensibilidades,
// e futuramente o relatório (reportPayload) — um único lugar para estas fórmulas,
// conforme secção 19 do plano ("não calcular o mesmo indicador de maneiras
// diferentes em páginas diferentes").

export type Typology = {
  id: string;
  nome: string;
  quantidade: number;
  abpUnidade: number;

  varandaM2: number;
  varandaPctValorizacao: number; // 0-1

  terracoM2: number;
  terracoPctValorizacao: number; // 0-1

  jardimPrivativoM2: number;
  jardimPctValorizacao: number; // 0-1

  arrecadacaoM2: number;
  arrecadacaoPctValorizacao: number; // 0-1

  estacionamentosIncluidos: number;
  valorEstacionamento: number;

  precoBaseM2: number;
  metodoPrecificacao: "abp_mais_coeficientes" | "area_vendavel_equivalente" | "manual_por_unidade";
  precoManualUnidade?: number | null;
};

export type IdentificacaoAreas = {
  abcAcimaSolo: number | null;
  abcAbaixoSolo: number | null;
  areaDependenteEstimada: number | null;
  abpEstimada: number | null;
  areaImplantacao: number | null;
  areaJardinsExteriores: number | null;
  areaDemolicao: number | null;
};

// --- Fórmulas de identificação (áreas "físicas", uma vez por projeto) ---

/** ABC total = ABC acima do solo + ABC abaixo do solo. */
export function calcAbcTotal(abcAcimaSolo: number | null, abcAbaixoSolo: number | null): number {
  return (abcAcimaSolo ?? 0) + (abcAbaixoSolo ?? 0);
}

/**
 * GCA total = ABC acima + ABC abaixo + Área Bruta Dependente total.
 * Usa a área dependente ESTIMADA (identificação) quando as tipologias
 * ainda não foram preenchidas; ver `calcGcaProgramado` para a versão
 * calculada a partir do programa.
 */
export function calcGcaEstimado(areas: IdentificacaoAreas): number {
  return calcAbcTotal(areas.abcAcimaSolo, areas.abcAbaixoSolo) + (areas.areaDependenteEstimada ?? 0);
}

// --- Fórmulas derivadas do programa de tipologias (secção 1 e 2 do plano) ---

/** ABP total programada = soma de (quantidade × ABP por unidade) de cada tipologia. */
export function calcAbpProgramado(typologies: Typology[]): number {
  return typologies.reduce((sum, t) => sum + t.quantidade * t.abpUnidade, 0);
}

/**
 * Área bruta dependente total programada = soma de todas as áreas físicas
 * dependentes (varandas, terraços, jardins privativos considerados
 * dependentes, arrecadações) × quantidade de cada tipologia.
 * Nota: esta é a área FÍSICA, não a "vendável equivalente" (que aplica os
 * coeficientes comerciais — ver calcAreaVendavelEquivalenteUnidade).
 */
export function calcAreaDependenteProgramada(typologies: Typology[]): number {
  return typologies.reduce((sum, t) => {
    const dependenteUnidade = t.varandaM2 + t.terracoM2 + t.jardimPrivativoM2 + t.arrecadacaoM2;
    return sum + dependenteUnidade * t.quantidade;
  }, 0);
}

/** GCA total programado = ABC total (identificação) + área dependente programada. */
export function calcGcaProgramado(
  abcAcimaSolo: number | null,
  abcAbaixoSolo: number | null,
  typologies: Typology[]
): number {
  return calcAbcTotal(abcAcimaSolo, abcAbaixoSolo) + calcAreaDependenteProgramada(typologies);
}

/**
 * Eficiência = ABP total ÷ GCA total.
 * Devolve null quando o GCA é zero (evita divisão por zero) — a UI deve
 * mostrar "—" nesse caso, nunca 0% nem Infinity.
 */
export function calcEficiencia(abpTotal: number, gcaTotal: number): number | null {
  if (gcaTotal <= 0) return null;
  return abpTotal / gcaTotal;
}

/**
 * Diferença entre a ABP estimada (identificação, preenchida manualmente) e a
 * ABP calculada a partir do programa de tipologias. Usada para o aviso:
 * "Existe uma diferença entre a ABP estimada e a ABP calculada pelo programa."
 */
export function calcDivergenciaAbp(
  abpEstimada: number | null,
  typologies: Typology[]
): { abpCalculada: number; diferencaAbsoluta: number; diferencaPercentual: number | null } {
  const abpCalculada = calcAbpProgramado(typologies);
  const estimada = abpEstimada ?? 0;
  const diferencaAbsoluta = abpCalculada - estimada;
  const diferencaPercentual = estimada > 0 ? diferencaAbsoluta / estimada : null;
  return { abpCalculada, diferencaAbsoluta, diferencaPercentual };
}

// --- Área vendável equivalente (secção 2 do plano) ---

/**
 * Área vendável equivalente de UMA unidade da tipologia:
 * ABP + (varanda × %) + (terraço × %) + (jardim × %) + (arrecadação × %).
 * O estacionamento NÃO entra aqui — é sempre tratado como valor fixo à parte
 * (ver calcReceitaUnidade), para nunca valorizar a área dependente em dobro.
 */
export function calcAreaVendavelEquivalenteUnidade(t: Typology): number {
  return (
    t.abpUnidade +
    t.varandaM2 * t.varandaPctValorizacao +
    t.terracoM2 * t.terracoPctValorizacao +
    t.jardimPrivativoM2 * t.jardimPctValorizacao +
    t.arrecadacaoM2 * t.arrecadacaoPctValorizacao
  );
}

/** Área vendável equivalente total do programa = soma de (área por unidade × quantidade). */
export function calcAreaVendavelEquivalenteTotal(typologies: Typology[]): number {
  return typologies.reduce((sum, t) => sum + calcAreaVendavelEquivalenteUnidade(t) * t.quantidade, 0);
}

// --- Receita (ligação áreas → vendas, secção 2 do plano) ---

/**
 * Receita de UMA unidade, de acordo com o método de precificação escolhido.
 * Nunca valoriza a mesma área dependente duas vezes: o método
 * 'abp_mais_coeficientes' e 'area_vendavel_equivalente' chegam ao mesmo
 * resultado matemático (a área vendável equivalente já inclui os
 * coeficientes); 'manual_por_unidade' ignora a área e usa o valor informado.
 */
export function calcReceitaUnidade(t: Typology): number {
  if (t.metodoPrecificacao === "manual_por_unidade") {
    return t.precoManualUnidade ?? 0;
  }
  const areaVendavel = calcAreaVendavelEquivalenteUnidade(t);
  const valorEstacionamentos = t.estacionamentosIncluidos * t.valorEstacionamento;
  return areaVendavel * t.precoBaseM2 + valorEstacionamentos;
}

/** Receita total da tipologia = receita por unidade × quantidade. */
export function calcReceitaTipologia(t: Typology): number {
  return calcReceitaUnidade(t) * t.quantidade;
}

/** Receita total do programa (GDV/VGV bruto), somando todas as tipologias. */
export function calcReceitaTotalPrograma(typologies: Typology[]): number {
  return typologies.reduce((sum, t) => sum + calcReceitaTipologia(t), 0);
}

// --- Resumo do programa (usado no ecrã "Programa e vendas" e no dashboard) ---

export type ResumoPrograma = {
  totalUnidades: number;
  abpTotal: number;
  areaVarandas: number;
  varandaVendavel: number;
  areaTerracos: number;
  terracoVendavel: number;
  areaJardins: number;
  jardimVendavel: number;
  areaArrecadacoes: number;
  arrecadacaoVendavel: number;
  areaDependenteTotal: number;
  areaDependenteVendavel: number;
  gcaTotal: number;
  areaVendavelEquivalenteTotal: number;
  totalEstacionamentos: number;
  precoMedioUnidade: number;
  precoMedioPonderadoM2: number;
  receitaTotal: number;
};

export function calcResumoPrograma(
  typologies: Typology[],
  abcAcimaSolo: number | null,
  abcAbaixoSolo: number | null
): ResumoPrograma {
  const totalUnidades = typologies.reduce((s, t) => s + t.quantidade, 0);
  const abpTotal = calcAbpProgramado(typologies);

  const areaVarandas = typologies.reduce((s, t) => s + t.varandaM2 * t.quantidade, 0);
  const varandaVendavel = typologies.reduce(
    (s, t) => s + t.varandaM2 * t.varandaPctValorizacao * t.quantidade,
    0
  );
  const areaTerracos = typologies.reduce((s, t) => s + t.terracoM2 * t.quantidade, 0);
  const terracoVendavel = typologies.reduce(
    (s, t) => s + t.terracoM2 * t.terracoPctValorizacao * t.quantidade,
    0
  );
  const areaJardins = typologies.reduce((s, t) => s + t.jardimPrivativoM2 * t.quantidade, 0);
  const jardimVendavel = typologies.reduce(
    (s, t) => s + t.jardimPrivativoM2 * t.jardimPctValorizacao * t.quantidade,
    0
  );
  const areaArrecadacoes = typologies.reduce((s, t) => s + t.arrecadacaoM2 * t.quantidade, 0);
  const arrecadacaoVendavel = typologies.reduce(
    (s, t) => s + t.arrecadacaoM2 * t.arrecadacaoPctValorizacao * t.quantidade,
    0
  );

  const areaDependenteTotal = areaVarandas + areaTerracos + areaJardins + areaArrecadacoes;
  const areaDependenteVendavel = varandaVendavel + terracoVendavel + jardimVendavel + arrecadacaoVendavel;

  const gcaTotal = calcAbcTotal(abcAcimaSolo, abcAbaixoSolo) + areaDependenteTotal;
  const areaVendavelEquivalenteTotal = calcAreaVendavelEquivalenteTotal(typologies);
  const totalEstacionamentos = typologies.reduce(
    (s, t) => s + t.estacionamentosIncluidos * t.quantidade,
    0
  );

  const receitaTotal = calcReceitaTotalPrograma(typologies);
  const precoMedioUnidade = totalUnidades > 0 ? receitaTotal / totalUnidades : 0;
  const precoMedioPonderadoM2 =
    areaVendavelEquivalenteTotal > 0 ? receitaTotal / areaVendavelEquivalenteTotal : 0;

  return {
    totalUnidades,
    abpTotal,
    areaVarandas,
    varandaVendavel,
    areaTerracos,
    terracoVendavel,
    areaJardins,
    jardimVendavel,
    areaArrecadacoes,
    arrecadacaoVendavel,
    areaDependenteTotal,
    areaDependenteVendavel,
    gcaTotal,
    areaVendavelEquivalenteTotal,
    totalEstacionamentos,
    precoMedioUnidade,
    precoMedioPonderadoM2,
    receitaTotal,
  };
}

// --- Validações (secção 2 do plano) ---

export type ValidationIssue = { campo: string; mensagem: string; nivel: "erro" | "alerta" };

export function validateTypologies(typologies: Typology[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typologies.length === 0 || typologies.every((t) => t.quantidade === 0)) {
    issues.push({ campo: "tipologias", mensagem: "Não existem unidades no programa.", nivel: "alerta" });
  }

  typologies.forEach((t, i) => {
    const label = t.nome || `Tipologia ${i + 1}`;
    if (!Number.isInteger(t.quantidade) || t.quantidade < 0) {
      issues.push({ campo: `${label}.quantidade`, mensagem: "Quantidade deve ser um número inteiro ≥ 0.", nivel: "erro" });
    }
    for (const [campo, valor] of [
      ["ABP", t.abpUnidade],
      ["Varanda", t.varandaM2],
      ["Terraço", t.terracoM2],
      ["Jardim privativo", t.jardimPrivativoM2],
      ["Arrecadação", t.arrecadacaoM2],
    ] as const) {
      if (valor < 0) {
        issues.push({ campo: `${label}.${campo}`, mensagem: `${campo} não pode ser negativa.`, nivel: "erro" });
      }
    }
    for (const [campo, pct] of [
      ["Varanda", t.varandaPctValorizacao],
      ["Terraço", t.terracoPctValorizacao],
      ["Jardim", t.jardimPctValorizacao],
      ["Arrecadação", t.arrecadacaoPctValorizacao],
    ] as const) {
      if (pct < 0 || pct > 1) {
        issues.push({
          campo: `${label}.${campo}.pct`,
          mensagem: `Percentagem de valorização de ${campo.toLowerCase()} deve ficar entre 0% e 100%.`,
          nivel: "erro",
        });
      }
    }
    if (t.precoBaseM2 < 0) {
      issues.push({ campo: `${label}.precoBaseM2`, mensagem: "Preço por m² não pode ser negativo.", nivel: "erro" });
    }
  });

  return issues;
}

/**
 * Compara a ABP estimada na Identificação com a ABP programada e devolve o
 * alerta correspondente, se a diferença for relevante (>1 m² ou >1%).
 */
export function validateAbpConciliacao(
  abpEstimada: number | null,
  typologies: Typology[]
): ValidationIssue | null {
  if (abpEstimada === null || abpEstimada === 0) return null;
  const { diferencaAbsoluta, diferencaPercentual } = calcDivergenciaAbp(abpEstimada, typologies);
  const percentualRelevante = diferencaPercentual !== null && Math.abs(diferencaPercentual) > 0.01;
  if (Math.abs(diferencaAbsoluta) > 1 && percentualRelevante) {
    return {
      campo: "abpEstimada",
      mensagem: "Existe uma diferença entre a ABP estimada e a ABP calculada pelo programa.",
      nivel: "alerta",
    };
  }
  return null;
}

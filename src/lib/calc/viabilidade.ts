// Motor de cálculo de viabilidade — Landwise
// Espelha a metodologia validada: VGV bruto → comissão → VGV líquido → CAPEX → Lucro → Equity → ROI → TIR

export type Tipologia = {
  nome: string;
  gpa: number; // m² área privativa
  varanda: number; // m²
  terraco: number; // m²
  precoBaseM2: number; // €/m²
};

export type LinhaVendas = {
  bloco: string;
  piso: number;
  tipologia: string; // nome da tipologia
  quantidade: number;
  premioPiso: number; // ex.: 0.02 = +2%
};

export type ProjectInputs = {
  // Terreno
  areaLote: number | null;
  localizacao: string;

  // Estrutura de capital
  pctCapitalProprio: number; // 0-1
  pctDivida: number; // 0-1
  pctInvestidores: number; // 0-1

  // Financiamento
  recorreBanco: boolean;
  ltv: number; // 0-1
  taxaJuroAnual: number; // 0-1

  // Fiscalidade
  ivaConstrucao: 0.06 | 0.23;

  // Calendário
  duracaoTotalMeses: number;
  duracaoObraMeses: number;
  mesInicioObra: number;

  // Comercialização
  sinalVendaPct: number; // 0-1
  comissaoMediadorPct: number; // 0-1, antes de IVA
  marketingPct: number; // 0-1, sobre CAPEX hard

  // Custos (fallback se não vier do mapa de vendas)
  pesoVarandaTerraco: number; // 0-1, área ponderada

  // Programa
  tipologias: Tipologia[];
  mapaVendas: LinhaVendas[];

  // Custo de aquisição do terreno (fixo, não vem do mapa de vendas)
  custoTerreno: number;
  custosAquisicaoPct: number; // 0-1 sobre custo do terreno (IMT+IS+notário)
  softCostsPct: number; // 0-1 sobre custo de construção
  contingenciaPct: number; // 0-1 sobre custo de construção
  custoConstrucaoM2: number | null; // se não vier do mapa de vendas, usar isto × GCA
};

export type ProjectResults = {
  vgvBruto: number;
  areaVendaTotal: number;
  unidadesTotal: number;
  comissao: number;
  vgvLiquido: number;
  custoTerreno: number;
  custoConstrucao: number;
  custosAquisicao: number;
  softCosts: number;
  marketing: number;
  contingencia: number;
  juros: number;
  capexTotal: number;
  lucroLiquido: number;
  margem: number;
  divida: number;
  equity: number;
  roi: number;
  equityMultiple: number;
  tir: number;
  terrenoSobreVgv: number;
  cashflow: { mes: number; fluxo: number; acumulado: number }[];
  picoCapital: number;
  mesPico: number;
  mesPayback: number | null;
  nivelConfianca: "Alto" | "Médio" | "Baixo";
};

export const DEFAULT_INPUTS: ProjectInputs = {
  areaLote: null,
  localizacao: "",
  pctCapitalProprio: 0.35,
  pctDivida: 0.4,
  pctInvestidores: 0.25,
  recorreBanco: true,
  ltv: 0.55,
  taxaJuroAnual: 0.065,
  ivaConstrucao: 0.23,
  duracaoTotalMeses: 22,
  duracaoObraMeses: 14,
  mesInicioObra: 5,
  sinalVendaPct: 0.2,
  comissaoMediadorPct: 0.05,
  marketingPct: 0.01,
  pesoVarandaTerraco: 0.3,
  tipologias: [
    { nome: "T0", gpa: 48, varanda: 5, terraco: 0, precoBaseM2: 4200 },
    { nome: "T1", gpa: 68, varanda: 8, terraco: 0, precoBaseM2: 4000 },
    { nome: "T2", gpa: 100, varanda: 15, terraco: 0, precoBaseM2: 3800 },
    { nome: "T3", gpa: 135, varanda: 20, terraco: 0, precoBaseM2: 3600 },
    { nome: "T4", gpa: 180, varanda: 25, terraco: 20, precoBaseM2: 3500 },
  ],
  mapaVendas: [],
  custoTerreno: 0,
  custosAquisicaoPct: 0.078,
  softCostsPct: 0.06,
  contingenciaPct: 0.05,
  custoConstrucaoM2: 1650,
};

function areaPonderada(t: Tipologia, peso: number) {
  return t.gpa + (t.varanda + t.terraco) * peso;
}

export function calcularViabilidade(inputs: ProjectInputs): ProjectResults {
  const tipoPorNome = new Map(inputs.tipologias.map((t) => [t.nome, t]));

  // --- VGV bruto: soma do mapa de vendas (se existir), senão 0 ---
  let vgvBruto = 0;
  let areaVendaTotal = 0;
  let unidadesTotal = 0;

  for (const linha of inputs.mapaVendas) {
    const t = tipoPorNome.get(linha.tipologia);
    if (!t) continue;
    const precoM2 = t.precoBaseM2 * (1 + linha.premioPiso);
    const areaUnidade = areaPonderada(t, inputs.pesoVarandaTerraco);
    const valorLinha = areaUnidade * precoM2 * linha.quantidade;
    vgvBruto += valorLinha;
    areaVendaTotal += areaUnidade * linha.quantidade;
    unidadesTotal += linha.quantidade;
  }

  const comissao = vgvBruto * (inputs.comissaoMediadorPct * 1.23); // + IVA 23% sobre a comissão
  const vgvLiquido = vgvBruto - comissao;

  // --- Custos ---
  const custoTerreno = inputs.custoTerreno;
  const gcaTotal = areaVendaTotal > 0 ? areaVendaTotal / 0.82 : 0; // eficiência ~82%
  const custoConstrucaoM2Efetivo =
    inputs.custoConstrucaoM2 ?? 1650;
  const custoConstrucao = gcaTotal * custoConstrucaoM2Efetivo;

  const custosAquisicao = custoTerreno * inputs.custosAquisicaoPct;
  const softCosts = custoConstrucao * inputs.softCostsPct;
  const marketing = (custoTerreno + custoConstrucao) * inputs.marketingPct;
  const contingencia = custoConstrucao * inputs.contingenciaPct;

  const capexSemJuros =
    custoTerreno + custoConstrucao + custosAquisicao + softCosts + marketing + contingencia;

  const divida = inputs.recorreBanco ? capexSemJuros * inputs.ltv : 0;
  const juros = inputs.recorreBanco
    ? divida * inputs.taxaJuroAnual * (inputs.duracaoObraMeses / 12) * 0.55
    : 0;

  const capexTotal = capexSemJuros + juros;
  const equity = capexTotal - divida;

  const lucroLiquido = vgvLiquido - capexTotal;
  const margem = vgvBruto > 0 ? lucroLiquido / vgvBruto : 0;
  const roi = equity > 0 ? lucroLiquido / equity : 0;
  const equityMultiple = 1 + roi;
  const tir =
    inputs.duracaoTotalMeses > 0
      ? Math.pow(1 + roi, 12 / inputs.duracaoTotalMeses) - 1
      : 0;
  const terrenoSobreVgv = vgvBruto > 0 ? custoTerreno / vgvBruto : 0;

  // --- Fluxo de caixa simplificado: equity investido até ao pico, devolvido + lucro no fim ---
  const cashflow: { mes: number; fluxo: number; acumulado: number }[] = [];
  const mesesInvestimento = Math.max(1, inputs.mesInicioObra + 4); // até ~4 meses após início da obra
  let acumulado = 0;
  for (let mes = 1; mes <= inputs.duracaoTotalMeses; mes++) {
    let fluxo = 0;
    if (mes <= mesesInvestimento) {
      fluxo = -equity / mesesInvestimento;
    } else if (mes === inputs.duracaoTotalMeses) {
      fluxo = equity + lucroLiquido;
    }
    acumulado += fluxo;
    cashflow.push({ mes, fluxo, acumulado });
  }

  let picoCapital = 0;
  let mesPico = 0;
  let mesPayback: number | null = null;
  for (const c of cashflow) {
    if (c.acumulado < picoCapital) {
      picoCapital = c.acumulado;
      mesPico = c.mes;
    }
    if (c.acumulado >= 0 && mesPayback === null && c.mes > 1) {
      mesPayback = c.mes;
    }
  }

  // --- Nível de confiança: heurística simples baseada em dados em falta ---
  let confiancaScore = 0;
  if (inputs.mapaVendas.length > 0) confiancaScore++;
  if (inputs.custoTerreno > 0) confiancaScore++;
  if (inputs.areaLote) confiancaScore++;
  if (inputs.custoConstrucaoM2) confiancaScore++;
  const nivelConfianca: ProjectResults["nivelConfianca"] =
    confiancaScore >= 4 ? "Alto" : confiancaScore >= 2 ? "Médio" : "Baixo";

  return {
    vgvBruto,
    areaVendaTotal,
    unidadesTotal,
    comissao,
    vgvLiquido,
    custoTerreno,
    custoConstrucao,
    custosAquisicao,
    softCosts,
    marketing,
    contingencia,
    juros,
    capexTotal,
    lucroLiquido,
    margem,
    divida,
    equity,
    roi,
    equityMultiple,
    tir,
    terrenoSobreVgv,
    cashflow,
    picoCapital,
    mesPico,
    mesPayback,
    nivelConfianca,
  };
}

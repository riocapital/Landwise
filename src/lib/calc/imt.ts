// IMT (Imposto Municipal sobre Transmissões Onerosas de Imóveis) + Imposto do
// Selo sobre a transmissão — calculadora assistida para a linha "IMT" e
// "Imposto do selo" da aquisição. O valor calculado é sempre uma sugestão:
// as linhas de custo continuam editáveis manualmente (override).
//
// Fonte oficial das tabelas de habitação: Ofício Circulado da Autoridade
// Tributária n.º 40129/2026, de 2026-01-06, "IMT — Tabelas práticas em vigor
// a partir de 01 de janeiro de 2026", emitido ao abrigo do art. 17.º do
// CIMT e da Lei n.º 73-A/2025, de 30 de dezembro (Orçamento do Estado para
// 2026). Documento consultado em portaldasfinancas.gov.pt.
//
// As taxas fixas (prédios rústicos, outros prédios urbanos/terrenos para
// construção, agravamento por residência em paraíso fiscal) vêm do art.
// 17.º, n.os 1-b), 1-c) e 4 do CIMT — não são alteradas anualmente pelo
// ofício circulado, só os escalões de habitação o são.
//
// Se a lei mudar, atualizar TABELAS_IMT_2026 (e o nome/vigência) numa nova
// versão datada — nunca substituir silenciosamente os valores antigos.

export type EscalaoImt = { ate: number | null; taxa: number; parcelaAbater: number };

const TABELA_I_CONTINENTE_HPP: EscalaoImt[] = [
  { ate: 106_346, taxa: 0, parcelaAbater: 0 },
  { ate: 145_470, taxa: 0.02, parcelaAbater: 2_126.92 },
  { ate: 198_347, taxa: 0.05, parcelaAbater: 6_491.02 },
  { ate: 330_539, taxa: 0.07, parcelaAbater: 10_457.96 },
  { ate: 660_982, taxa: 0.08, parcelaAbater: 13_763.35 },
  { ate: 1_150_853, taxa: 0.06, parcelaAbater: 0 },
  { ate: null, taxa: 0.075, parcelaAbater: 0 },
];

const TABELA_II_CONTINENTE_HPP_JOVEM: EscalaoImt[] = [
  { ate: 330_539, taxa: 0, parcelaAbater: 0 },
  { ate: 660_982, taxa: 0.08, parcelaAbater: 26_443.12 },
  { ate: 1_150_853, taxa: 0.06, parcelaAbater: 0 },
  { ate: null, taxa: 0.075, parcelaAbater: 0 },
];

const TABELA_III_CONTINENTE_SECUNDARIA: EscalaoImt[] = [
  { ate: 106_346, taxa: 0.01, parcelaAbater: 0 },
  { ate: 145_470, taxa: 0.02, parcelaAbater: 1_063.46 },
  { ate: 198_347, taxa: 0.05, parcelaAbater: 5_427.56 },
  { ate: 330_539, taxa: 0.07, parcelaAbater: 9_394.5 },
  { ate: 633_931, taxa: 0.08, parcelaAbater: 12_699.89 },
  { ate: 1_150_853, taxa: 0.06, parcelaAbater: 0 },
  { ate: null, taxa: 0.075, parcelaAbater: 0 },
];

const TABELA_IV_REGIAO_AUTONOMA_HPP: EscalaoImt[] = [
  { ate: 132_933, taxa: 0, parcelaAbater: 0 },
  { ate: 181_838, taxa: 0.02, parcelaAbater: 2_658.66 },
  { ate: 247_934, taxa: 0.05, parcelaAbater: 8_113.8 },
  { ate: 413_174, taxa: 0.07, parcelaAbater: 13_072.48 },
  { ate: 826_228, taxa: 0.08, parcelaAbater: 17_204.22 },
  { ate: 1_438_566, taxa: 0.06, parcelaAbater: 0 },
  { ate: null, taxa: 0.075, parcelaAbater: 0 },
];

const TABELA_V_REGIAO_AUTONOMA_HPP_JOVEM: EscalaoImt[] = [
  { ate: 413_174, taxa: 0, parcelaAbater: 0 },
  { ate: 826_228, taxa: 0.08, parcelaAbater: 33_053.92 },
  { ate: 1_438_566, taxa: 0.06, parcelaAbater: 0 },
  { ate: null, taxa: 0.075, parcelaAbater: 0 },
];

const TABELA_VI_REGIAO_AUTONOMA_SECUNDARIA: EscalaoImt[] = [
  { ate: 132_933, taxa: 0.01, parcelaAbater: 0 },
  { ate: 181_838, taxa: 0.02, parcelaAbater: 1_329.33 },
  { ate: 247_934, taxa: 0.05, parcelaAbater: 6_784.47 },
  { ate: 413_174, taxa: 0.07, parcelaAbater: 11_743.15 },
  { ate: 792_414, taxa: 0.08, parcelaAbater: 15_874.89 },
  { ate: 1_438_566, taxa: 0.06, parcelaAbater: 0 },
  { ate: null, taxa: 0.075, parcelaAbater: 0 },
];

const TAXA_PREDIO_RUSTICO = 0.05;
// "Outros prédios urbanos e outras aquisições onerosas" — cobre comercial/industrial e terrenos para construção.
const TAXA_OUTRO_URBANO_OU_TERRENO = 0.065;
const TAXA_OFFSHORE = 0.1;
const TAXA_IMPOSTO_SELO_TRANSMISSAO = 0.008; // verba 1.1 da TGIS

export const FONTE_TABELAS_IMT = "Ofício Circulado da AT n.º 40129/2026, de 06/01/2026 (art. 17.º do CIMT, Lei n.º 73-A/2025 — OE2026)";
export const VIGENCIA_TABELAS_IMT = "2026-01-01";

export type TipoImovelImt = "habitacao_propria_permanente" | "habitacao_secundaria_ou_arrendamento" | "predio_rustico" | "outro_urbano_ou_terreno_construcao";

export type ParametrosImt = {
  tipoImovel: TipoImovelImt;
  valor: number; // valor sobre que incide o IMT: o maior entre o preço de aquisição e o VPT (regra do CIMT; a app usa o preço de aquisição introduzido pelo utilizador)
  regiaoAutonoma: boolean;
  jovemAte35: boolean; // só relevante para habitação própria e permanente
  offshore: boolean; // adquirente pessoa coletiva com residência fiscal em país/território com regime fiscal privilegiado
};

export type ResultadoImt = {
  imt: number;
  impostoSelo: number;
  total: number;
  taxaMarginal: number;
  escalaoDescricao: string;
  fonte: string;
};

function calcularPorEscaloes(valor: number, escaloes: EscalaoImt[]): { imposto: number; taxa: number; descricao: string } {
  if (valor <= 0) return { imposto: 0, taxa: escaloes[0].taxa, descricao: "—" };
  const encontrado = escaloes.find((e) => e.ate === null || valor <= e.ate) ?? escaloes[escaloes.length - 1];
  const imposto = Math.max(0, valor * encontrado.taxa - encontrado.parcelaAbater);
  const descricao = encontrado.parcelaAbater > 0 || (encontrado.ate !== null && escaloes.indexOf(encontrado) === 0)
    ? `Taxa marginal de ${(encontrado.taxa * 100).toFixed(1).replace(".0", "")}%, parcela a abater €${encontrado.parcelaAbater.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`
    : `Taxa única de ${(encontrado.taxa * 100).toFixed(1).replace(".0", "")}%`;
  return { imposto, taxa: encontrado.taxa, descricao };
}

/** Calculadora assistida — sugestão a rever/sobrepor manualmente, nunca aplicada automaticamente sem confirmação. */
export function calcularImt(p: ParametrosImt): ResultadoImt {
  const valor = Math.max(0, p.valor);

  if (p.offshore) {
    const imt = valor * TAXA_OFFSHORE;
    return {
      imt,
      impostoSelo: valor * TAXA_IMPOSTO_SELO_TRANSMISSAO,
      total: imt + valor * TAXA_IMPOSTO_SELO_TRANSMISSAO,
      taxaMarginal: TAXA_OFFSHORE,
      escalaoDescricao: "Taxa agravada de 10% — adquirente com residência fiscal em país/território com regime fiscal privilegiado (art. 17.º, n.º 4 CIMT)",
      fonte: FONTE_TABELAS_IMT,
    };
  }

  let resultado: { imposto: number; taxa: number; descricao: string };
  switch (p.tipoImovel) {
    case "predio_rustico":
      resultado = { imposto: valor * TAXA_PREDIO_RUSTICO, taxa: TAXA_PREDIO_RUSTICO, descricao: "Taxa fixa de 5% — prédio rústico (art. 17.º, n.º 1-b) CIMT)" };
      break;
    case "outro_urbano_ou_terreno_construcao":
      resultado = { imposto: valor * TAXA_OUTRO_URBANO_OU_TERRENO, taxa: TAXA_OUTRO_URBANO_OU_TERRENO, descricao: "Taxa fixa de 6,5% — outros prédios urbanos e terrenos para construção (art. 17.º, n.º 1-c) CIMT)" };
      break;
    case "habitacao_propria_permanente": {
      const tabela = p.regiaoAutonoma
        ? p.jovemAte35 ? TABELA_V_REGIAO_AUTONOMA_HPP_JOVEM : TABELA_IV_REGIAO_AUTONOMA_HPP
        : p.jovemAte35 ? TABELA_II_CONTINENTE_HPP_JOVEM : TABELA_I_CONTINENTE_HPP;
      const r = calcularPorEscaloes(valor, tabela);
      resultado = { imposto: r.imposto, taxa: r.taxa, descricao: r.descricao };
      break;
    }
    case "habitacao_secundaria_ou_arrendamento": {
      const tabela = p.regiaoAutonoma ? TABELA_VI_REGIAO_AUTONOMA_SECUNDARIA : TABELA_III_CONTINENTE_SECUNDARIA;
      const r = calcularPorEscaloes(valor, tabela);
      resultado = { imposto: r.imposto, taxa: r.taxa, descricao: r.descricao };
      break;
    }
  }

  const impostoSelo = valor * TAXA_IMPOSTO_SELO_TRANSMISSAO;
  return {
    imt: resultado.imposto,
    impostoSelo,
    total: resultado.imposto + impostoSelo,
    taxaMarginal: resultado.taxa,
    escalaoDescricao: resultado.descricao,
    fonte: FONTE_TABELAS_IMT,
  };
}

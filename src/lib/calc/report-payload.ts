// reportPayload — Landwise, Fase 8 (parte 3), atualizado na Fase 4 da
// revisão estrutural para incluir todos os motores construídos desde
// então (Sales Table, curva de vendas, evolução de preços, comissão,
// cash sweep, estrutura fiscal, métricas de decisão, calendário
// automático, cenários, alertas).
//
// Secção 13 do plano: "Preparar, contudo, um objeto de dados consistente
// chamado reportPayload... será utilizado futuramente para gerar o
// relatório." Este ficheiro só monta dados já calculados pelos motores
// existentes — não introduz nenhuma fórmula nova, para nunca haver dois
// sítios a calcular o mesmo indicador de forma diferente (secção 19).

import type { ResumoPrograma, Typology } from "./areas";
import type { SugestaoPreco } from "./comparaveis";
import type { ResumoCustos } from "./custos";
import type { ResultadoCashFlow } from "./cashflow";
import type { ResultadosFinanciamento } from "./financiamento";
import type { ResultadosEquity } from "./equity";
import type { ResultadoInvestidorExterno, ResultadoPromotor } from "./estrutura-capital";
import type { MatrizResultado } from "./sensibilidades";
import type { LinhaSalesTableResolvida } from "./sales-table";
import type { RegraEvolucaoPreco } from "./price-escalation";
import type { Cenario, LinhaComparacaoCenarios } from "./cenarios";
import type { ResultadoCalendarioAutomatico } from "./calendario-automatico";
import type { MetricasPorM2, EstruturaSobreVgv } from "./metricas";
import type { Alerta } from "./alertas";

export type OrigemValor = "utilizador" | "sugestao_landwise" | "assumido_automaticamente" | "calculado" | "importado" | "substituido_manualmente";

export type PremissaComOrigem<T> = { valor: T; origem: OrigemValor; badge?: string };

export type ReportPayload = {
  geradoEm: string; // ISO — nunca "cacheado" indefinidamente sem esta marca

  identificacao: {
    nome: string;
    tipoProjeto: string;
    estadoProjeto: string;
    tipoAtivo: string;
    descricaoResumida: string | null;
    dataReferenciaAnalise: string;
  };

  localizacao: {
    codigoPostal: string | null;
    rua: string | null;
    freguesia: string | null;
    concelho: string | null;
    distrito: string | null;
    latitude: number | null;
    longitude: number | null;
    origem: "manual" | "codigo_postal" | "geocodificacao";
  };

  areas: {
    areaLote: number | null;
    abcAcimaSolo: number | null;
    abcAbaixoSolo: number | null;
    abcPrincipal: number; // ABC acima + ABC abaixo, sem a ABD
    abcTotal: number; // ABC acima + ABC abaixo + ABD (secção 8 da revisão estrutural)
    abpEstimada: number | null;
    abpProgramada: number;
    eficiencia: number | null;
  };

  programa: ResumoPrograma;
  tipologias: Typology[];

  // Sales Table (secção 14) — fonte única do VGV. Guardada linha a linha
  // para rastreabilidade total; o VGV apresentado em `receita.gdv` é
  // sempre a soma real destas linhas, nunca uma média × quantidade.
  salesTable: LinhaSalesTableResolvida[];
  regrasEvolucaoPreco: RegraEvolucaoPreco[]; // secção 17

  comparaveis: {
    sugestoesUsadas: Record<string, SugestaoPreco>; // por tipologia id
  };

  receita: {
    gdv: number;
    precoMedioPonderadoM2: number;
    comissaoComercialTotal: number; // secção 18 — sempre separada, nunca descontada da receita
  };

  custos: ResumoCustos;

  impostos: {
    estruturaFiscalAssumida: "empresa_spv" | "pessoa_singular" | "nao_definida" | "outra"; // secção 29
    seguroTotal: number;
    imiTotal: number;
    lucroEconomico: number | null; // só calculado quando estruturaFiscalAssumida = empresa_spv
    lucroTributavelEstimado: number | null;
    ircEstimado: number;
    derramaMunicipal: number;
    derramaEstadual: number;
    simulacaoManual: { taxaEfetivaManual: number | null; impostoEstimadoManual: number | null } | null; // só quando não é empresa_spv
    ivaSuportado: number;
    ivaRecuperavel: number;
    ivaNaoRecuperavel: number;
  };

  calendarioAutomatico: ResultadoCalendarioAutomatico; // secção 30 — sempre derivado dos registos reais, nunca uma lista de atividades à parte

  cashFlow: ResultadoCashFlow;

  financiamento: ResultadosFinanciamento;
  cashSweep: { ativo: boolean; mesInicio: string | null }; // secção 24
  equity: ResultadosEquity;

  investidor: ResultadoInvestidorExterno | null; // null quando não há investidor externo
  promotor: ResultadoPromotor;

  sensibilidades: MatrizResultado[];
  cenarios: { lista: Cenario[]; comparacao: LinhaComparacaoCenarios[] }; // secção 39

  metricasPorM2: MetricasPorM2 | null; // secção 35
  estruturaSobreVgv: EstruturaSobreVgv | null; // secção 36

  alertas: Alerta[]; // secção 41 — tipo partilhado com alertas.ts, nunca redefinido em paralelo

  premissas: Record<string, PremissaComOrigem<unknown>>;

  fontes: {
    comparaveis: { totalUsados: number; fontesUnicas: string[] };
    localizacao: string | null; // ex.: "geoapi.pt"
  };
};

/**
 * Monta o reportPayload a partir dos resultados já calculados pelos
 * motores existentes. Não recalcula nada — só empacota. Se algum motor
 * ainda não tiver corrido (ex.: sem investidor externo, ou estrutura
 * fiscal não é empresa/SPV), os campos correspondentes ficam null/vazios,
 * nunca com valores inventados.
 */
export function montarReportPayload(dados: {
  identificacao: ReportPayload["identificacao"];
  localizacao: ReportPayload["localizacao"];
  areas: ReportPayload["areas"];
  programa: ResumoPrograma;
  tipologias: Typology[];
  salesTable: LinhaSalesTableResolvida[];
  regrasEvolucaoPreco: RegraEvolucaoPreco[];
  sugestoesUsadas: Record<string, SugestaoPreco>;
  custos: ResumoCustos;
  impostos: ReportPayload["impostos"];
  calendarioAutomatico: ResultadoCalendarioAutomatico;
  cashFlow: ResultadoCashFlow;
  cashSweep: ReportPayload["cashSweep"];
  investidor: ResultadoInvestidorExterno | null;
  promotor: ResultadoPromotor;
  sensibilidades: MatrizResultado[];
  cenarios: ReportPayload["cenarios"];
  metricasPorM2: MetricasPorM2 | null;
  estruturaSobreVgv: EstruturaSobreVgv | null;
  alertas: Alerta[];
  premissas: Record<string, PremissaComOrigem<unknown>>;
  fontesComparaveis: { totalUsados: number; fontesUnicas: string[] };
  fonteLocalizacao: string | null;
}): ReportPayload {
  return {
    geradoEm: new Date().toISOString(),
    identificacao: dados.identificacao,
    localizacao: dados.localizacao,
    areas: dados.areas,
    programa: dados.programa,
    tipologias: dados.tipologias,
    salesTable: dados.salesTable,
    regrasEvolucaoPreco: dados.regrasEvolucaoPreco,
    comparaveis: { sugestoesUsadas: dados.sugestoesUsadas },
    receita: {
      gdv: dados.cashFlow.gdv,
      precoMedioPonderadoM2: dados.programa.precoMedioPonderadoM2,
      comissaoComercialTotal: dados.cashFlow.comissaoComercialTotal,
    },
    custos: dados.custos,
    impostos: dados.impostos,
    calendarioAutomatico: dados.calendarioAutomatico,
    cashFlow: dados.cashFlow,
    financiamento: dados.cashFlow.financiamento,
    cashSweep: dados.cashSweep,
    equity: dados.cashFlow.equity,
    investidor: dados.investidor,
    promotor: dados.promotor,
    sensibilidades: dados.sensibilidades,
    cenarios: dados.cenarios,
    metricasPorM2: dados.metricasPorM2,
    estruturaSobreVgv: dados.estruturaSobreVgv,
    alertas: dados.alertas,
    premissas: dados.premissas,
    fontes: { comparaveis: dados.fontesComparaveis, localizacao: dados.fonteLocalizacao },
  };
}

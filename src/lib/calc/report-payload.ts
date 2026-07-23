// reportPayload — Landwise, Fase 8 (parte 3)
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
import type { AlertaCalendario } from "./calendario";

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
    abcTotal: number;
    gcaTotal: number;
    abpEstimada: number | null;
    abpProgramada: number;
    eficiencia: number | null;
  };

  programa: ResumoPrograma;
  tipologias: Typology[];

  comparaveis: {
    sugestoesUsadas: Record<string, SugestaoPreco>; // por tipologia id
  };

  receita: {
    gdv: number;
    precoMedioPonderadoM2: number;
  };

  custos: ResumoCustos;

  impostos: {
    seguroTotal: number;
    imiTotal: number;
    ircEstimado: number;
    derramaMunicipal: number;
    derramaEstadual: number;
    ivaSuportado: number;
    ivaRecuperavel: number;
    ivaNaoRecuperavel: number;
  };

  calendario: {
    alertas: AlertaCalendario[];
  };

  cashFlow: ResultadoCashFlow;

  financiamento: ResultadosFinanciamento;
  equity: ResultadosEquity;

  investidor: ResultadoInvestidorExterno | null; // null quando não há investidor externo
  promotor: ResultadoPromotor;

  sensibilidades: MatrizResultado[];

  alertas: { tipo: "erro" | "alerta" | "recomendacao"; mensagem: string }[];

  premissas: Record<string, PremissaComOrigem<unknown>>;

  fontes: {
    comparaveis: { totalUsados: number; fontesUnicas: string[] };
    localizacao: string | null; // ex.: "geoapi.pt"
  };
};

/**
 * Monta o reportPayload a partir dos resultados já calculados pelos
 * motores existentes. Não recalcula nada — só empacota. Se algum motor
 * ainda não tiver corrido (ex.: sem investidor externo), os campos
 * correspondentes ficam null/vazios, nunca com valores inventados.
 */
export function montarReportPayload(dados: {
  identificacao: ReportPayload["identificacao"];
  localizacao: ReportPayload["localizacao"];
  areas: ReportPayload["areas"];
  programa: ResumoPrograma;
  tipologias: Typology[];
  sugestoesUsadas: Record<string, SugestaoPreco>;
  custos: ResumoCustos;
  impostos: ReportPayload["impostos"];
  alertasCalendario: AlertaCalendario[];
  cashFlow: ResultadoCashFlow;
  investidor: ResultadoInvestidorExterno | null;
  promotor: ResultadoPromotor;
  sensibilidades: MatrizResultado[];
  alertas: ReportPayload["alertas"];
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
    comparaveis: { sugestoesUsadas: dados.sugestoesUsadas },
    receita: { gdv: dados.cashFlow.gdv, precoMedioPonderadoM2: dados.programa.precoMedioPonderadoM2 },
    custos: dados.custos,
    impostos: dados.impostos,
    calendario: { alertas: dados.alertasCalendario },
    cashFlow: dados.cashFlow,
    financiamento: dados.cashFlow.financiamento,
    equity: dados.cashFlow.equity,
    investidor: dados.investidor,
    promotor: dados.promotor,
    sensibilidades: dados.sensibilidades,
    alertas: dados.alertas,
    premissas: dados.premissas,
    fontes: { comparaveis: dados.fontesComparaveis, localizacao: dados.fonteLocalizacao },
  };
}

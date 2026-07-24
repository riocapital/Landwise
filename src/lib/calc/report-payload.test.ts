import { describe, it, expect } from "vitest";
import { montarReportPayload } from "./report-payload";
import { calcularCashFlow } from "./cashflow";
import { calcResultadoPromotor } from "./estrutura-capital";
import type { LinhaCusto } from "./custos";
import type { ParametrosFinanciamento } from "./financiamento";

function custo(overrides: Partial<LinhaCusto>): LinhaCusto {
  return {
    id: Math.random().toString(36),
    grupo: "hard_cost",
    categoria: "Genérico",
    nome: "Linha",
    tipoCalculo: "valor_fixo",
    valorInput: 0,
    baseReferenciaCustoId: null,
    taxaIva: null,
    ivaRecuperavelPct: 0,
    dataIvaRecuperacao: null,
    dataInicial: "2026-01-01",
    duracaoMeses: 12,
    dataFinal: "2026-12-31",
    perfilDesembolso: "linear",
    ...overrides,
  };
}

const parametrosSemFinanciamento: ParametrosFinanciamento = {
  comFinanciamento: false,
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  spread: 0,
  structuringFeePct: 0,
  setupCosts: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
  limiteCredito: null,
  saldoMinimoCaixa: 0,
  metodoTaxaMensal: "nominal_anual_div_12",
};

describe("montarReportPayload", () => {
  it("monta o objeto completo a partir de resultados já calculados, sem inventar valores", () => {
    const cashFlow = calcularCashFlow({
      linhasCusto: [custo({ grupo: "aquisicao", tipoCalculo: "valor_fixo", valorInput: 500_000, duracaoMeses: 1, dataFinal: "2026-01-31" })],
      contextoCusto: { valorAquisicao: 500_000, abcPrincipal: 500, abcTotal: 600, numeroUnidades: 5 },
      recebimentos: [{ mes: "2027-01", reserva: 0, cpcv: 0, duranteConstrucao: 0, conclusao: 1_500_000, escritura: 0, total: 1_500_000 }],
      parametrosFinanciamento: parametrosSemFinanciamento,
      saldoMinimoCaixa: 0,
    });

    const promotor = calcResultadoPromotor([], cashFlow.equity.equityContributed, 0);

    const payload = montarReportPayload({
      identificacao: {
        nome: "Projeto Teste",
        tipoProjeto: "Terreno",
        estadoProjeto: "Em estudo",
        tipoAtivo: "Residencial",
        descricaoResumida: null,
        dataReferenciaAnalise: "2026-01-01",
      },
      localizacao: { codigoPostal: null, rua: null, freguesia: null, concelho: null, distrito: null, latitude: null, longitude: null, origem: "manual" },
      areas: { areaLote: null, abcAcimaSolo: null, abcAbaixoSolo: null, abcPrincipal: 0, abcTotal: 0, abpEstimada: null, abpProgramada: 0, eficiencia: null },
      programa: {
        totalUnidades: 0, abpTotal: 0, areaVarandas: 0, varandaVendavel: 0, areaTerracos: 0, terracoVendavel: 0,
        areaJardins: 0, jardimVendavel: 0, areaArrecadacoes: 0, arrecadacaoVendavel: 0, areaDependenteTotal: 0,
        areaDependenteVendavel: 0, abcTotal: 0, areaVendavelEquivalenteTotal: 0, totalEstacionamentos: 0,
        precoMedioUnidade: 0, precoMedioPonderadoM2: 0, receitaTotal: 1_500_000,
      },
      tipologias: [],
      sugestoesUsadas: {},
      custos: { totalAquisicao: 500_000, totalHardCosts: 0, totalSoftCosts: 0, totalOutros: 0, custoTotal: 500_000, ivaSuportadoTotal: 0, ivaRecuperavelTotal: 0, ivaNaoRecuperavelTotal: 0 },
      impostos: { seguroTotal: 0, imiTotal: 0, ircEstimado: 0, derramaMunicipal: 0, derramaEstadual: 0, ivaSuportado: 0, ivaRecuperavel: 0, ivaNaoRecuperavel: 0 },
      alertasCalendario: [],
      cashFlow,
      investidor: null, // sem investidor externo — nunca inventar um
      promotor,
      sensibilidades: [],
      alertas: [],
      premissas: { areaLote: { valor: null, origem: "utilizador" } },
      fontesComparaveis: { totalUsados: 0, fontesUnicas: [] },
      fonteLocalizacao: null,
    });

    expect(payload.identificacao.nome).toBe("Projeto Teste");
    expect(payload.investidor).toBeNull(); // nunca inventa investidor quando não há
    expect(payload.cashFlow).toBe(cashFlow); // reaproveita o mesmo objeto, não recalcula
    expect(payload.financiamento).toBe(cashFlow.financiamento);
    expect(payload.equity).toBe(cashFlow.equity);
    expect(new Date(payload.geradoEm).getTime()).toBeGreaterThan(0);
  });
});

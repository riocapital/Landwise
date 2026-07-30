import assert from "node:assert/strict";
import { resolverValoresCustos, type ContextoCusto, type LinhaCusto } from "../src/lib/calc/custos";
import { calcIRCComRegime, calcDerramaEstadual } from "../src/lib/calc/impostos";
import { gerarAgendaAbsorcao, atribuirDatasAbsorcao } from "../src/lib/calc/sales-curve";
import { gerarRecebimentosDaSalesTable, type PlanoVendas } from "../src/lib/calc/vendas";
import { calcComissaoUnidade, gerarComissaoMensal } from "../src/lib/calc/sales-commission";
import { calcularCashFlow, calcularReservaMinimaCustos } from "../src/lib/calc/cashflow";
import type { ParametrosFinanciamento } from "../src/lib/calc/financiamento";
import type { LinhaSalesTableResolvida } from "../src/lib/calc/sales-table";
import type { Typology } from "../src/lib/calc/areas";

const contexto: ContextoCusto = {
  valorAquisicao: 1_000_000,
  abcAcimaSolo: 600,
  abcAbaixoSolo: 400,
  abdTotal: 200,
  numeroUnidades: 10,
};

function custo(overrides: Partial<LinhaCusto>): LinhaCusto {
  return {
    id: crypto.randomUUID(),
    grupo: "hard_cost",
    categoria: "QA",
    nome: "Linha QA",
    tipoCalculo: "valor_fixo",
    valorInput: 0,
    baseReferenciaCustoId: null,
    taxaIva: null,
    ivaRecuperavelPct: 0,
    dataIvaRecuperacao: null,
    dataInicial: "2026-01-01",
    duracaoMeses: 1,
    dataFinal: "2026-01-31",
    perfilDesembolso: "linear",
    ...overrides,
  };
}

const semFinanciamento: ParametrosFinanciamento = {
  comFinanciamento: false,
  percentagemHardCostsFinanciada: 0,
  percentagemAquisicaoFinanciada: 0,
  euribor: 0,
  euriborOrigem: "manual",
  euriborDataReferencia: null,
  euriborFonte: null,
  spread: 0,
  structuringFeePct: 0,
  setupCosts: 0,
  setupCostsPct: 0,
  impostoSeloEmprestimoPct: 0,
  impostoSeloJurosPct: 0,
  limiteCredito: null,
  saldoMinimoCaixa: 0,
  saldoMinimoMesesReserva: 6,
  metodoTaxaMensal: "nominal_anual_div_12",
  cashSweepAtivo: false,
  cashSweepPctCaixaLivre: 0,
  cashSweepMesesCustosFuturos: 0,
  cashSweepInicioTipo: "primeira_escritura",
  cashSweepInicioValorPct: null,
  cashSweepInicioData: null,
  carenciaAtiva: false,
  carenciaAnos: 0,
  prazoAnos: 0,
};

const tipologia: Typology = {
  id: "t1",
  nome: "T1",
  quantidade: 2,
  abpUnidade: 70,
  varandaM2: 0,
  varandaPctValorizacao: 0,
  terracoM2: 0,
  terracoPctValorizacao: 0,
  jardimPrivativoM2: 0,
  jardimPctValorizacao: 0,
  arrecadacaoM2: 0,
  arrecadacaoPctValorizacao: 0,
  estacionamentosIncluidos: 0,
  valorEstacionamento: 0,
  precoBaseM2: 4_000,
  metodoPrecificacao: "abp_mais_coeficientes",
  mesesParaPrimeiraVenda: 2,
  unidadesPorMes: 1,
};

function unidade(id: string, ordem: number): LinhaSalesTableResolvida {
  return {
    id,
    tipologiaId: "t1",
    ordem,
    bloco: null,
    piso: null,
    abp: 70,
    varandaM2: 0,
    terracoM2: 0,
    outrasAreasM2: 0,
    estacionamentos: 0,
    valorEstacionamento: 0,
    precoBaseM2: 4_000,
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
    abdFisica: 0,
    abdVendavel: 0,
    areaVendavel: 70,
    precoFinal: 280_000,
  };
}

const plano: PlanoVendas = {
  dataLancamentoComercial: "2026-01-01",
  duracaoVendasMeses: 6,
  dataInicioConstrucao: "2026-01-01",
  dataFimConstrucao: "2027-12-01",
  dataEscritura: "2028-01-01",
  duracaoEscrituraAposObraMeses: 2,
  estruturaRecebimentos: {
    pctReserva: 0.05,
    pctCpcv: 0.15,
    pctDuranteConstrucao: 0.5,
    pctConclusao: 0.1,
    pctEscritura: 0.2,
  },
  comissaoMediacaoPct: 0.05,
  comissaoTaxaIva: 0.23,
  comissaoPctPagoSinal: 0.5,
  comissaoPctPagoEscritura: 0.5,
  comissaoIvaRecuperavelPct: 0,
  cancelamentosEstimadosPct: 0,
};

const checks: string[] = [];
const ok = (name: string, fn: () => void) => {
  fn();
  checks.push(name);
};

ok("custo mensal multiplica valor pela duração", () => {
  const linha = custo({ tipoCalculo: "valor_mensal", valorInput: 2_500, duracaoMeses: 12 });
  assert.equal(resolverValoresCustos([linha], contexto).get(linha.id), 30_000);
});

ok("IRC PME usa 15% nos primeiros €50 mil e 19% no excedente", () => {
  const r = calcIRCComRegime(55_000, 0.19, "pme_small_mid_cap");
  assert.equal(r.imposto, 50_000 * 0.15 + 5_000 * 0.19);
});

ok("derrama estadual não incide abaixo do primeiro limiar", () => {
  assert.equal(calcDerramaEstadual(1_000_000), 0);
});

ok("data de lançamento inválida não quebra a curva", () => {
  assert.deepEqual(gerarAgendaAbsorcao(2, 2, 1, ""), []);
});

ok("primeira venda ocorre dois meses após o lançamento", () => {
  const agenda = gerarAgendaAbsorcao(2, 2, 1, "2026-01-01");
  assert.equal(agenda[0]?.mes, "2026-03");
});

ok("datas são atribuídas de cima para baixo", () => {
  const agenda = gerarAgendaAbsorcao(2, 2, 1, "2026-01-01");
  const atribuicoes = atribuirDatasAbsorcao(
    [
      { id: "u2", ordem: 2, jaTemDataVenda: false, disponivel: true },
      { id: "u1", ordem: 1, jaTemDataVenda: false, disponivel: true },
    ],
    agenda
  );
  assert.deepEqual(
    atribuicoes.map((a) => [a.unidadeId, a.dataVenda]),
    [
      ["u1", "2026-03-01"],
      ["u2", "2026-04-01"],
    ]
  );
});

ok("reserva e CPCV aparecem separados no mês da venda", () => {
  const { linhas } = gerarRecebimentosDaSalesTable([unidade("u1", 0)], [{ ...tipologia, quantidade: 1 }], plano);
  const marco = linhas.find((l) => l.mes === "2026-03");
  assert.ok(marco);
  assert.equal(marco.reserva, 280_000 * 0.05);
  assert.equal(marco.cpcv, 280_000 * 0.15);
});

ok("comissão incide no preço total da unidade", () => {
  const c = calcComissaoUnidade(280_000, {
    percentagemComissao: 0.05,
    taxaIva: 0.23,
    pctPagoNoSinal: 0.5,
    pctPagoNaEscritura: 0.5,
    ivaRecuperavelPct: 0,
  });
  assert.equal(c.comissaoSemIva, 14_000);
});

ok("comissão é dividida entre sinal e escritura", () => {
  const r = gerarComissaoMensal([unidade("u1", 0)], [{ ...tipologia, quantidade: 1 }], "2026-01-01", "2028-01-01", {
    percentagemComissao: 0.05,
    taxaIva: 0,
    pctPagoNoSinal: 0.5,
    pctPagoNaEscritura: 0.5,
    ivaRecuperavelPct: 0,
  });
  assert.equal(r.linhas.find((l) => l.mes === "2026-03")?.total, 7_000);
  assert.equal(r.linhas.find((l) => l.mes === "2028-01")?.total, 7_000);
});

ok("IVA não recuperável é contado uma única vez no cash flow", () => {
  const r = calcularCashFlow({
    linhasCusto: [custo({ valorInput: 10_000, taxaIva: 0.23, ivaRecuperavelPct: 0 })],
    contextoCusto: contexto,
    recebimentos: [],
    parametrosFinanciamento: semFinanciamento,
    saldoMinimoCaixa: 0,
  });
  assert.equal(r.custoTotal, 12_300);
  assert.equal(r.linhas[0]?.hardCosts, 10_000);
  assert.equal(r.linhas[0]?.ivaNaoRecuperavel, 2_300);
});

ok("reserva mínima ignora aquisição e usa maior janela móvel", () => {
  const r = calcularReservaMinimaCustos(
    [
      custo({ grupo: "aquisicao", valorInput: 1_000_000, dataInicial: "2026-01-01", dataFinal: "2026-01-31" }),
      custo({ grupo: "hard_cost", valorInput: 100_000, dataInicial: "2026-02-01", dataFinal: "2026-02-28" }),
      custo({ grupo: "soft_cost", valorInput: 150_000, dataInicial: "2026-03-01", dataFinal: "2026-03-31" }),
      custo({ grupo: "hard_cost", valorInput: 50_000, dataInicial: "2026-04-01", dataFinal: "2026-04-30" }),
    ],
    contexto,
    2
  );
  assert.equal(r.valor, 250_000);
  assert.equal(r.mesInicio, "2026-02");
  assert.equal(r.mesFim, "2026-03");
});

console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));

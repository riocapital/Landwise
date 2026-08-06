// Motor de financiamento bancário — Landwise, Fase 5
//
// Trabalha mensalmente (secção 7 do plano). O drawdown nunca é lançado todo
// no primeiro mês — acompanha os custos elegíveis, a percentagem financiada,
// o limite de crédito e o saldo de caixa. Quando `comFinanciamento` é falso,
// TODOS os valores ficam a zero (regra explícita da secção 7 e teste
// obrigatório da secção 20 do plano) — nunca reaproveita valores bancários
// de uma configuração anterior.

export type ParametrosFinanciamento = {
  comFinanciamento: boolean;
  percentagemHardCostsFinanciada: number; // 0-1
  percentagemAquisicaoFinanciada: number; // 0-1
  euribor: number; // decimal, ex. 0.03
  euriborOrigem: "6m" | "12m" | "manual"; // secção 23 do plano: rastreabilidade da premissa
  euriborDataReferencia: string | null; // "YYYY-MM" quando vem do BCE, null quando manual
  euriborFonte: string | null; // nome da fonte, null quando manual
  spread: number; // decimal, ex. 0.02
  structuringFeePct: number; // % do limite, decimal
  setupCosts: number; // valor fixo legado €
  setupCostsPct?: number; // % do limite/contratado, decimal — premissa inicial 0,30%
  impostoSeloEmprestimoPct: number; // decimal, sobre o valor do limite/contratado
  impostoSeloJurosPct: number; // decimal, sobre juros de cada mês
  limiteCredito: number | null; // null = sem limite explícito
  saldoMinimoCaixa: number;
  saldoMinimoMesesReserva?: number; // meses de custos futuros cobertos pela reserva automática
  metodoTaxaMensal: "nominal_anual_div_12" | "mensal_equivalente";

  // Revolver vs. non-revolver (secção 22 do prompt 03_08 — Gate 4). Numa
  // facility revolver, amortizar reabre capacidade disponível (o limite
  // compara-se ao saldo em dívida). Numa non-revolver (a norma em
  // financiamento de promoção imobiliária), amortizar NUNCA reabre o
  // limite — o teto compara-se ao total já alguma vez levantado, mesmo que
  // entretanto pago. Default true (revolver) preserva o comportamento
  // anterior a esta secção para projetos já configurados.
  revolver: boolean;
  // Comissão de compromisso anual (decimal) sobre o montante não
  // utilizado do limite, pro-rata mensal — separada dos juros (que só
  // incidem sobre o saldo levantado) e nunca confundida com eles.
  commitmentFeePct: number;
  // Evento de saída/refinanciamento explícito (secção 22): mês "YYYY-MM"
  // em que a dívida é liquidada integralmente por venda final ou
  // refinanciamento. Quando null, mantém a rede de segurança implícita
  // (liquidação forçada no último mês do horizonte modelado) — nunca
  // deixa saldo por pagar depois do fim do horizonte, mas o evento deixa
  // de ser um "plug" silencioso quando configurado explicitamente.
  mesEventoSaida: string | null;

  // Cash sweep (secção 24 do plano)
  cashSweepAtivo: boolean;
  cashSweepPctCaixaLivre: number; // 0-1 — % do caixa livre usado para amortizar
  cashSweepMesesCustosFuturos: number; // reserva: quantos meses de custos futuros nunca tocar
  cashSweepInicioTipo: "primeira_escritura" | "pct_vendido" | "pct_vgv_recebido" | "data";
  cashSweepInicioValorPct: number | null; // decimal, quando início = pct_vendido ou pct_vgv_recebido
  cashSweepInicioData: string | null; // "YYYY-MM-DD", quando início = data

  // Carência do principal (secção 15 da auditoria). Conta a partir do
  // primeiro drawdown (não há ainda uma "data inicial do financiamento"
  // dedicada — usar o primeiro mês com drawdown > 0 como âncora, conforme
  // a regra explícita de fallback). Durante a carência: paga juros, nunca
  // amortiza capital (nem por cash sweep). Depois da carência: amortização
  // linear mensal do saldo então existente, distribuída pelo prazo
  // restante (prazoAnos − carenciaAnos), somada a qualquer amortização por
  // cash sweep que também esteja ativa.
  carenciaAtiva: boolean;
  carenciaAnos: number; // 0 quando carenciaAtiva = false — projetos antigos ficam sempre sem carência
  prazoAnos: number; // prazo total do empréstimo, em anos — tem de ser > carenciaAnos
};

export type NecessidadeMensal = {
  mes: string; // "YYYY-MM"
  custosElegiveisAquisicao: number; // parcela de custos de aquisição neste mês
  custosElegiveisHardCosts: number; // parcela de hard costs neste mês
  saldoCaixaAntesFinanciamento: number; // caixa disponível antes de recorrer a dívida/equity neste mês (pode ser negativo)
};

export type LinhaFinanciamentoMensal = {
  mes: string;
  saldoInicial: number;
  drawdown: number;
  juros: number;
  jurosCapitalizados: number;
  fees: number;
  comissaoCompromisso: number; // sobre o montante não utilizado do limite — nunca somada a `fees` (setup/estruturação), sempre linha própria
  impostoSelo: number;
  amortizacao: number;
  saldoFinal: number;
  eventoLiquidacao: boolean; // true só no mês em que a dívida foi forçada a zero (evento de saída explícito ou fim do horizonte)
};

export type EventoMensalCashSweep = {
  mes: string;
  temEscritura: boolean;
  pctVendidoAcumulado: number; // 0-1, no fim deste mês
  pctVgvRecebidoAcumulado: number; // 0-1, no fim deste mês
};

/**
 * Resolve em que mês o cash sweep começa a atuar, consoante o gatilho
 * escolhido (secção 24 do plano). Devolve null quando o gatilho nunca é
 * atingido nos eventos fornecidos — nunca assume um mês por omissão.
 */
export function resolverMesInicioCashSweep(parametros: ParametrosFinanciamento, eventos: EventoMensalCashSweep[]): string | null {
  if (!parametros.cashSweepAtivo) return null;

  switch (parametros.cashSweepInicioTipo) {
    case "primeira_escritura":
      return eventos.find((e) => e.temEscritura)?.mes ?? null;
    case "pct_vendido":
      if (parametros.cashSweepInicioValorPct === null) return null;
      return eventos.find((e) => e.pctVendidoAcumulado >= parametros.cashSweepInicioValorPct!)?.mes ?? null;
    case "pct_vgv_recebido":
      if (parametros.cashSweepInicioValorPct === null) return null;
      return eventos.find((e) => e.pctVgvRecebidoAcumulado >= parametros.cashSweepInicioValorPct!)?.mes ?? null;
    case "data":
      return parametros.cashSweepInicioData ? parametros.cashSweepInicioData.slice(0, 7) : null;
    default:
      return null;
  }
}

export function taxaAnual(p: ParametrosFinanciamento): number {
  return p.euribor + p.spread;
}

export function taxaMensal(p: ParametrosFinanciamento): number {
  const anual = taxaAnual(p);
  if (p.metodoTaxaMensal === "mensal_equivalente") {
    return Math.pow(1 + anual, 1 / 12) - 1;
  }
  return anual / 12;
}

const PARAMETROS_ZERO: Pick<
  ParametrosFinanciamento,
  | "percentagemHardCostsFinanciada"
  | "percentagemAquisicaoFinanciada"
  | "euribor"
  | "euriborOrigem"
  | "euriborDataReferencia"
  | "euriborFonte"
  | "spread"
  | "structuringFeePct"
  | "setupCosts"
  | "setupCostsPct"
  | "impostoSeloEmprestimoPct"
  | "impostoSeloJurosPct"
  | "cashSweepAtivo"
  | "cashSweepPctCaixaLivre"
  | "cashSweepMesesCustosFuturos"
  | "saldoMinimoMesesReserva"
  | "carenciaAtiva"
  | "carenciaAnos"
  | "commitmentFeePct"
  | "mesEventoSaida"
> = {
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
  cashSweepAtivo: false,
  cashSweepPctCaixaLivre: 0,
  cashSweepMesesCustosFuturos: 0,
  saldoMinimoMesesReserva: 0,
  carenciaAtiva: false,
  carenciaAnos: 0,
  commitmentFeePct: 0,
  mesEventoSaida: null,
};

/** Aplica a regra "financiamento bancário = Não zera e desativa todos os campos bancários" (secção 7). */
export function normalizarParametrosSemFinanciamento(p: ParametrosFinanciamento): ParametrosFinanciamento {
  if (p.comFinanciamento) return p;
  return { ...p, ...PARAMETROS_ZERO, limiteCredito: 0 };
}

/**
 * Simula o financiamento mês a mês. Nunca lança o valor todo no primeiro mês:
 * o drawdown de cada mês é o mínimo entre (a) a necessidade de caixa elegível
 * do mês, (b) a percentagem financiada dos custos elegíveis, e (c) o limite
 * de crédito disponível.
 *
 * Se `comFinanciamento` for falso, devolve uma linha por mês com tudo a
 * zero — nunca "sem linhas" (para o cash flow poder somar sem casos especiais).
 */
export function simularFinanciamento(
  necessidades: NecessidadeMensal[],
  parametrosInput: ParametrosFinanciamento,
  mesInicioCashSweep: string | null = null
): LinhaFinanciamentoMensal[] {
  const parametros = normalizarParametrosSemFinanciamento(parametrosInput);

  if (!parametros.comFinanciamento) {
    return necessidades.map((n) => ({
      mes: n.mes,
      saldoInicial: 0,
      drawdown: 0,
      juros: 0,
      jurosCapitalizados: 0,
      fees: 0,
      comissaoCompromisso: 0,
      impostoSelo: 0,
      amortizacao: 0,
      saldoFinal: 0,
      eventoLiquidacao: false,
    }));
  }

  const taxaMes = taxaMensal(parametros);
  const linhas: LinhaFinanciamentoMensal[] = [];
  let saldo = 0;
  let feesSetupLancados = false;
  // Total alguma vez levantado (nunca decresce com amortizações) — só
  // usado quando revolver = false, para que pagar dívida não reabra
  // capacidade já consumida do limite (achado da secção 22 do prompt
  // 03_08: a norma em financiamento de promoção é non-revolver).
  let totalAlgumaVezLevantado = 0;
  // Carência (secção 15): contada a partir do primeiro mês com drawdown >
  // 0 — null até lá, nunca assume um início por omissão.
  let mesesDesdeInicioFinanciamento: number | null = null;
  // Saldo no exato mês em que a carência termina, congelado uma única vez
  // — é a base da prestação linear constante (nunca recalculada a cada mês).
  let saldoBaseAmortizacaoLinear: number | null = null;

  for (let i = 0; i < necessidades.length; i++) {
    const n = necessidades[i];
    const saldoInicial = saldo;
    const juros = saldoInicial * taxaMes;
    const impostoSeloJuros = juros * parametros.impostoSeloJurosPct;

    const necessidadeElegivel =
      n.custosElegiveisAquisicao * parametros.percentagemAquisicaoFinanciada +
      n.custosElegiveisHardCosts * parametros.percentagemHardCostsFinanciada;

    // Só recorre à dívida na medida em que o saldo de caixa do mês não chegue.
    const necessidadeReal = Math.max(0, Math.min(necessidadeElegivel, -n.saldoCaixaAntesFinanciamento));

    let drawdown = necessidadeReal;
    if (parametros.limiteCredito !== null) {
      const baseIndisponivel = parametros.revolver ? saldoInicial : totalAlgumaVezLevantado;
      const disponivel = Math.max(0, parametros.limiteCredito - baseIndisponivel);
      drawdown = Math.min(drawdown, disponivel);
    }
    totalAlgumaVezLevantado += drawdown;

    // Comissão de compromisso (secção 22): pro-rata mensal da taxa anual
    // sobre o que ainda não foi utilizado do limite — nunca sobre o saldo
    // levantado (isso são juros). Sem limite explícito não há "não
    // utilizado" a comissionar.
    let comissaoCompromisso = 0;
    if (parametros.limiteCredito !== null && parametros.commitmentFeePct > 0) {
      const baseIndisponivelParaFee = parametros.revolver ? saldoInicial + drawdown : totalAlgumaVezLevantado;
      const naoUtilizado = Math.max(0, parametros.limiteCredito - baseIndisponivelParaFee);
      comissaoCompromisso = naoUtilizado * (parametros.commitmentFeePct / 12);
    }

    let fees = 0;
    let impostoSeloEmprestimo = 0;
    if (!feesSetupLancados && drawdown > 0) {
      const baseFee = parametros.limiteCredito ?? drawdown;
      fees = parametros.setupCosts + baseFee * (parametros.structuringFeePct + (parametros.setupCostsPct ?? 0));
      impostoSeloEmprestimo = baseFee * parametros.impostoSeloEmprestimoPct;
      feesSetupLancados = true;
    }

    // Juros pagos correntemente em caixa (cashflow.ts subtrai `juros` todos
    // os meses) — nunca capitalizados no saldo devedor. Capitalizar E pagar
    // em caixa no mesmo mês era dupla contabilização do custo de juros
    // (Achado P0.2 da auditoria de 2026-07-31): o mesmo euro descontava o
    // caixa uma vez e ainda engordava o saldo a pagar mais tarde.
    let saldoFinal = saldoInicial + drawdown;

    // Atualiza a contagem de meses desde o início do financiamento — âncora
    // da carência, definida no mês do primeiro drawdown.
    if (drawdown > 0 && mesesDesdeInicioFinanciamento === null) {
      mesesDesdeInicioFinanciamento = 0;
    } else if (mesesDesdeInicioFinanciamento !== null) {
      mesesDesdeInicioFinanciamento += 1;
    }
    const mesesCarencia = parametros.carenciaAtiva ? Math.max(0, Math.round(parametros.carenciaAnos * 12)) : 0;
    const dentroCarencia = parametros.carenciaAtiva && mesesDesdeInicioFinanciamento !== null && mesesDesdeInicioFinanciamento < mesesCarencia;

    // Cash sweep (secção 24): a partir do mês de início, usa o caixa livre
    // para amortizar dívida — nunca abaixo do saldo mínimo, nunca sem
    // reservar os próximos N meses de custos, nunca mais do que a dívida
    // restante (nunca deixa o projeto sem caixa). Nunca durante a carência
    // (secção 15) — só paga juros nesse período.
    let amortizacao = 0;
    const sweepAtivoNesteMes = parametros.cashSweepAtivo && mesInicioCashSweep !== null && n.mes >= mesInicioCashSweep && !dentroCarencia;
    if (sweepAtivoNesteMes && saldoFinal > 0) {
      const caixaDisponivel = n.saldoCaixaAntesFinanciamento + drawdown;
      const reservaFutura = necessidades
        .slice(i + 1, i + 1 + parametros.cashSweepMesesCustosFuturos)
        .reduce((s, futuro) => s + futuro.custosElegiveisAquisicao + futuro.custosElegiveisHardCosts, 0);
      const caixaLivre = Math.max(0, caixaDisponivel - parametros.saldoMinimoCaixa - reservaFutura);
      amortizacao = Math.min(saldoFinal, caixaLivre * parametros.cashSweepPctCaixaLivre);
      saldoFinal -= amortizacao;
    }

    // Amortização programada (secção 15): só depois da carência terminar.
    // Prestação linear constante (capital ÷ meses restantes de prazo),
    // calculada uma única vez sobre o saldo no momento em que a carência
    // acaba — nunca recalculada a cada mês. Na maturidade (ou além),
    // liquida integralmente o que resta, nunca deixa saldo por pagar.
    if (parametros.carenciaAtiva && !dentroCarencia && mesesDesdeInicioFinanciamento !== null && saldoFinal > 0) {
      const prazoTotalMeses = Math.max(1, Math.round(parametros.prazoAnos * 12));
      const naMaturidadeOuAlem = mesesDesdeInicioFinanciamento >= prazoTotalMeses - 1;
      let amortizacaoProgramada: number;
      if (naMaturidadeOuAlem) {
        amortizacaoProgramada = saldoFinal;
      } else {
        if (saldoBaseAmortizacaoLinear === null) saldoBaseAmortizacaoLinear = saldoInicial;
        const mesesAmortizacao = Math.max(1, prazoTotalMeses - mesesCarencia);
        amortizacaoProgramada = Math.min(saldoFinal, Math.max(0, saldoBaseAmortizacaoLinear / mesesAmortizacao));
      }
      saldoFinal -= amortizacaoProgramada;
      amortizacao += amortizacaoProgramada;
    }

    // Último mês do horizonte modelado (Achado P0.1 da auditoria de
    // 2026-07-31): a dívida bancária nunca pode ficar por liquidar quando o
    // horizonte de cash flow termina — mesmo sem carência nem cash sweep
    // ativos, e mesmo que a maturidade do empréstimo (prazoAnos) seja mais
    // longa do que a vida comercial do projeto. Sem isto, o saldo devedor
    // por pagar fluía para o caixa levered e o motor de equity distribuía-o
    // ao investidor no último mês como se fosse lucro — dinheiro do banco
    // apresentado como retorno do investidor. Espelha a mesma lógica que já
    // existia só para a maturidade da carência (acima), agora sempre.
    //
    // Evento de saída explícito (secção 22 do prompt 03_08): quando
    // `mesEventoSaida` está definido, a liquidação integral acontece nesse
    // mês (venda final ou refinanciamento), não silenciosamente escondida
    // no último mês do horizonte. Quando não está definido, mantém-se a
    // rede de segurança acima (último mês do horizonte) — nunca deixa
    // saldo por pagar de qualquer forma.
    const ehMesDoEventoSaidaExplicito = parametros.mesEventoSaida !== null && n.mes === parametros.mesEventoSaida;
    const ehUltimoMesDoHorizonte = i === necessidades.length - 1;
    const eventoLiquidacao = (ehMesDoEventoSaidaExplicito || ehUltimoMesDoHorizonte) && saldoFinal > 0;
    if (eventoLiquidacao) {
      amortizacao += saldoFinal;
      saldoFinal = 0;
    }

    linhas.push({
      mes: n.mes,
      saldoInicial,
      drawdown,
      juros,
      jurosCapitalizados: 0, // juros pagos correntemente em caixa, nunca capitalizados — ver comentário acima em saldoFinal
      fees,
      comissaoCompromisso,
      impostoSelo: impostoSeloEmprestimo + impostoSeloJuros,
      amortizacao,
      saldoFinal,
      eventoLiquidacao,
    });

    saldo = saldoFinal;
  }

  return linhas;
}

export type ResultadosFinanciamento = {
  dividaTotalLevantada: number;
  peakDebt: number;
  mesDividaMaxima: string | null;
  jurosTotais: number;
  feesBancarios: number;
  comissaoCompromissoTotal: number; // secção 22 — nunca somada a feesBancarios, sempre discriminada
  impostoSeloTotal: number;
  dividaAllIn: number; // peak debt + juros + fees + imposto selo + comissão de compromisso acumulados ATÉ ao mês do pico (nunca o total do horizonte inteiro)
  ltv: number | null; // peak debt / GDV
  ltc: number | null; // peak debt / custos elegíveis
  mesLiquidacaoDivida: string | null; // mês do evento de saída explícito ou, na ausência de um, do fim do horizonte — nunca null quando alguma dívida foi levantada
  valorLiquidadoNoEvento: number; // amortização total nesse mês (inclui a liquidação forçada, não só a programada)
};

export function calcResultadosFinanciamento(
  linhas: LinhaFinanciamentoMensal[],
  gdv: number,
  custosElegiveisTotal: number
): ResultadosFinanciamento {
  const dividaTotalLevantada = linhas.reduce((s, l) => s + l.drawdown, 0);
  const jurosTotais = linhas.reduce((s, l) => s + l.juros, 0);
  const feesBancarios = linhas.reduce((s, l) => s + l.fees, 0);
  const comissaoCompromissoTotal = linhas.reduce((s, l) => s + l.comissaoCompromisso, 0);
  const impostoSeloTotal = linhas.reduce((s, l) => s + l.impostoSelo, 0);

  let peakDebt = 0;
  let mesDividaMaxima: string | null = null;
  let idxPico = -1;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (l.saldoFinal > peakDebt) {
      peakDebt = l.saldoFinal;
      mesDividaMaxima = l.mes;
      idxPico = i;
    }
  }
  const custosFinanceirosAtePico =
    idxPico >= 0 ? linhas.slice(0, idxPico + 1).reduce((s, l) => s + l.juros + l.fees + l.comissaoCompromisso + l.impostoSelo, 0) : 0;

  const linhaLiquidacao = linhas.find((l) => l.eventoLiquidacao) ?? null;

  return {
    dividaTotalLevantada,
    peakDebt,
    mesDividaMaxima,
    jurosTotais,
    comissaoCompromissoTotal,
    feesBancarios,
    impostoSeloTotal,
    dividaAllIn: peakDebt + custosFinanceirosAtePico,
    ltv: gdv > 0 ? peakDebt / gdv : null,
    ltc: custosElegiveisTotal > 0 ? peakDebt / custosElegiveisTotal : null,
    mesLiquidacaoDivida: linhaLiquidacao?.mes ?? null,
    valorLiquidadoNoEvento: linhaLiquidacao?.amortizacao ?? 0,
  };
}

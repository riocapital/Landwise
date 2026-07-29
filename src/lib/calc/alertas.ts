// Motor de alertas — Landwise, Fase 4 da revisão estrutural (secção 41
// do plano).
//
// Cada verificação é uma função pura e independente. Nenhuma delas
// inventa dados em falta — quando a informação necessária não existe
// ainda, a verificação simplesmente não dispara (nem erro, nem alerta).
//
// Três categorias, nunca misturadas: "erro" (algo está matematicamente
// errado ou fisicamente impossível), "alerta" (algo precisa de atenção,
// mas não é necessariamente um erro), "recomendação" (uma sugestão de
// melhoria, não um problema).

export type TipoAlerta = "erro" | "alerta" | "recomendacao";
export type Alerta = { id: string; tipo: TipoAlerta; mensagem: string };

function erro(id: string, mensagem: string): Alerta {
  return { id, tipo: "erro", mensagem };
}
function alerta(id: string, mensagem: string): Alerta {
  return { id, tipo: "alerta", mensagem };
}
function recomendacao(id: string, mensagem: string): Alerta {
  return { id, tipo: "recomendacao", mensagem };
}

const TOLERANCIA_EUR = 0.01; // secção 1 do plano: reconciliação até ao cêntimo

export type ContextoAlertas = {
  // Identificação / áreas
  temCodigoPostalValido: boolean | null;
  abcTotal: number | null;
  abpProgramada: number | null;
  eficiencia: number | null; // decimal, ex. 1.05 = 105%

  // Programa / Sales Table
  totalUnidades: number;
  unidadesVendidas: number;
  dataLancamentoComercialPassada: boolean; // true quando a data de lançamento já passou
  algumaUnidadeComSinalMaisReforcosAcimaDe100Pct: boolean;
  algumaTipologiaVendeuMaisDoQueAQuantidade: boolean;

  // Aquisição
  sinalMaisReforcosAquisicaoAcimaDe100Pct: boolean;
  temEscrituraAquisicaoSemData: boolean;

  // Custos / calendário
  existeCustoAtivoSemData: boolean;
  existeHardCostSemDuracao: boolean;
  dataEscritura: string | null;
  primeiraDataVendaUnidade: string | null;
  dataFimConstrucao: string | null;

  // Fiscal
  ivaReduzidoAplicadoSemConfirmacao: boolean;

  // Financiamento
  ltv: number | null; // decimal
  algumMesComSaldoCaixaNegativoAposFinanciamento: boolean;
  equityCommitted: number | null;
  peakCashExposure: number | null;

  // Resultados
  irrLevered: number | null | undefined; // undefined = ainda não calculado nesta sessão; null = calculado mas não calculável
  gdv: number | null;
  custoTotal: number | null;
  margem: number | null;

  // Waterfall (só quando há investidor externo)
  temInvestidorExterno: boolean;
  lucroLevered: number | null;
  lucroInvestidor: number | null;
  lucroPromotorTotal: number | null;
  feesPromotor: number | null;

  // Reconciliação de cash flow: cada linha { saldoAcumuladoAnterior, entradas, saidas, saldoAcumuladoAtual }
  linhasReconciliacao: { mes: string; saldoAnterior: number; entradas: number; saidas: number; saldoAtual: number }[];

  // Sensibilidades
  margemSensibilidadeBase: number | null; // extraído da célula 0%×0% da matriz, quando já calculada
};

/**
 * Gera a lista de alertas aplicáveis — nunca dispara uma verificação cujo
 * dado de entrada ainda não existe (ex.: sem LTV calculado, a verificação
 * de LTV>65% simplesmente não corre).
 */
export function gerarAlertas(c: ContextoAlertas): Alerta[] {
  const alertas: Alerta[] = [];

  // --- Identificação / Áreas ---
  if (c.temCodigoPostalValido === false) {
    alertas.push(alerta("cep", "O código postal não foi reconhecido — confirme a localização manualmente."));
  }
  if (c.abcTotal !== null && c.abcTotal <= 0) {
    alertas.push(erro("abc_zero", "ABC Total é zero ou negativo — preencha as áreas na Identificação."));
  }
  if (c.abpProgramada !== null && c.abcTotal !== null && c.abpProgramada > c.abcTotal) {
    alertas.push(erro("abp_maior_que_abc", "A ABP programada é maior do que o ABC Total — verifique as áreas das tipologias."));
  }
  if (c.eficiencia !== null && c.eficiencia > 1) {
    alertas.push(erro("eficiencia_acima_100", "A eficiência calculada é superior a 100% — fisicamente impossível, reveja as áreas."));
  }

  // --- Programa / Sales Table ---
  if (c.totalUnidades === 0) {
    alertas.push(alerta("unidades_zero", "Ainda não há unidades geradas na Sales Table."));
  }
  if (c.totalUnidades > 0 && c.unidadesVendidas === 0 && c.dataLancamentoComercialPassada) {
    alertas.push(alerta("vendas_zero", "A data de lançamento comercial já passou e ainda não há nenhuma unidade vendida."));
  }
  if (c.algumaUnidadeComSinalMaisReforcosAcimaDe100Pct) {
    alertas.push(erro("sinais_acima_100", "Existe pelo menos uma unidade com sinal + reforços acima de 100% do preço."));
  }
  if (c.algumaTipologiaVendeuMaisDoQueAQuantidade) {
    alertas.push(erro("venda_acima_stock", "Há mais unidades vendidas do que a quantidade definida numa tipologia."));
  }

  // --- Aquisição ---
  if (c.sinalMaisReforcosAquisicaoAcimaDe100Pct) {
    alertas.push(erro("aquisicao_acima_100", "O sinal + reforços da aquisição excede 100% do valor de compra."));
  }
  if (c.temEscrituraAquisicaoSemData) {
    alertas.push(alerta("escritura_aquisicao_sem_data", "A escritura de aquisição ainda não tem data definida."));
  }

  // --- Custos / calendário ---
  if (c.existeCustoAtivoSemData) {
    alertas.push(alerta("custos_sem_data", "Existem linhas de custo ativas sem data de início ou fim."));
  }
  if (c.existeHardCostSemDuracao) {
    alertas.push(alerta("obra_sem_duracao", "Existem linhas de hard cost sem duração definida."));
  }
  if (c.dataEscritura && c.primeiraDataVendaUnidade && c.dataEscritura < c.primeiraDataVendaUnidade) {
    alertas.push(erro("escritura_antes_de_venda", "A data de escritura é anterior à primeira venda registada."));
  }
  if (c.dataEscritura && c.dataFimConstrucao && c.dataEscritura < c.dataFimConstrucao) {
    alertas.push(erro("escritura_antes_de_obra", "A data de escritura é anterior à conclusão da obra."));
  }

  // --- Fiscal ---
  if (c.ivaReduzidoAplicadoSemConfirmacao) {
    alertas.push(alerta("iva_reduzido_sem_confirmacao", "A taxa reduzida de IVA na empreitada está aplicada mas ainda não foi confirmada."));
  }

  // --- Financiamento ---
  if (c.ltv !== null && c.ltv > 0.65) {
    alertas.push(alerta("ltv_acima_65", "O LTV está acima de 65% — confirme esta estrutura com a entidade bancária."));
  }
  if (c.algumMesComSaldoCaixaNegativoAposFinanciamento) {
    alertas.push(erro("funding_gap", "Existe pelo menos um mês com saldo de caixa negativo mesmo depois do financiamento (funding gap)."));
  }
  if (c.equityCommitted !== null && c.peakCashExposure !== null && c.equityCommitted < c.peakCashExposure) {
    alertas.push(erro("equity_committed_abaixo_exposure", "O equity committed é inferior ao peak cash exposure — capital comprometido insuficiente."));
  }

  // --- Resultados ---
  if (c.irrLevered === null) {
    alertas.push(alerta("irr_nao_calculavel", "O IRR levered não é calculável com os dados atuais."));
  }
  if (c.gdv !== null && c.custoTotal !== null && c.custoTotal > c.gdv) {
    alertas.push(erro("custo_acima_vgv", "O custo total do projeto excede o VGV Bruto."));
  }
  if (c.margem !== null && c.margem < 0) {
    alertas.push(alerta("margem_negativa", "A margem do projeto é negativa."));
  }
  if (c.margem !== null && c.margem >= 0 && c.margem < 0.1) {
    alertas.push(recomendacao("margem_apertada", "A margem está positiva mas abaixo de 10% — vale a pena rever preços ou custos antes de avançar."));
  }

  // --- Waterfall (só com investidor externo) ---
  if (c.temInvestidorExterno && c.lucroLevered !== null && c.lucroInvestidor !== null && c.lucroPromotorTotal !== null && c.feesPromotor !== null) {
    const somaDistribuida = c.lucroInvestidor + (c.lucroPromotorTotal - c.feesPromotor); // fees não são "lucro distribuído da waterfall", só remuneração fixa
    if (Math.abs(somaDistribuida - c.lucroLevered) > TOLERANCIA_EUR * 100) {
      // tolerância maior aqui: soma de vários arredondamentos ao longo da cascata
      alertas.push(erro("waterfall_inconsistente", "A soma dos lucros do investidor e do promotor não reconcilia com o lucro levered do projeto."));
    }
  }

  // --- Reconciliação de cash flow ---
  for (const linha of c.linhasReconciliacao) {
    const esperado = linha.saldoAnterior + linha.entradas - linha.saidas;
    if (Math.abs(esperado - linha.saldoAtual) > TOLERANCIA_EUR) {
      alertas.push(erro("cash_flow_nao_conciliado", `O cash flow do mês ${linha.mes} não concilia (diferença acima de €0,01).`));
      break; // um alerta chega — não repete por cada mês
    }
  }

  // --- Sensibilidades ---
  if (c.margemSensibilidadeBase !== null && c.margem !== null && Math.abs(c.margemSensibilidadeBase - c.margem) > 0.0001) {
    alertas.push(erro("sensibilidade_base_divergente", "A célula 0%×0% da matriz de sensibilidades não coincide com o resultado principal."));
  }

  return alertas;
}

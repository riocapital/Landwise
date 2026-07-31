"use client";

// Extraído de page.tsx (achado S1 da auditoria de 2026-07-31) — Etapa 8 (final) do wizard.

import { useState } from "react";
import { validarEstruturaRecebimentos, type PlanoVendas } from "@/lib/calc/vendas";
import { resolverCustos, type LinhaCusto, type ContextoCusto } from "@/lib/calc/custos";
import { calcResumoPrograma, type Typology } from "@/lib/calc/areas";
import type { IdentificacaoEstruturada } from "../page";
import type { ParametrosFinanciamento } from "@/lib/calc/financiamento";
import type { EstruturaCapitalEstado } from "@/lib/supabase/project-capital";
import type { NivelHurdle } from "@/lib/calc/waterfall";
import { agregarFees, type Fee, type ContextoFees } from "@/lib/calc/fees";
import { calcularCashFlow } from "@/lib/calc/cashflow";
import type { LinhaSalesTableResolvida } from "@/lib/calc/sales-table";
import { compararCenarios, type Cenario } from "@/lib/calc/cenarios";
import { calcularResultadosComWaterfall } from "@/lib/calc/estrutura-capital";
import {
  extrairIndicador,
  type MatrizSensibilidade,
  type IndicadorSensibilidade,
} from "@/lib/calc/sensibilidades";
import { Card, Row, FieldGroup, PercentInput, ResumoItem, SensibilidadesMatriz } from "./ui";
import { CashFlowChart } from "./cash-flow-chart";
import { fmtEUR } from "./helpers";

const SUBTABS_RESULTADOS = [
  "Resumo",
  "Cash flow",
  "Capex",
  "Funding",
  "Financiamento",
  "Investidor e promotor",
  "Sensibilidades",
  "Cenários",
] as const;

export function StepCashFlowResultados({
  onVerResultados,
  planoVendas,
  custosNovos,
  contextoCusto,
  resumoPrograma,
  vgvBruto,
  identificacao,
  financiamento,
  estruturaCapital,
  hurdles,
  feesNovos,
  contextoFees,
  resultado,
  prontoParaCalcular,
  salesTableResolvida,
  tipologiasNovas,
  cenarios,
  onAdicionarCenarioConservador,
  onAdicionarCenarioOtimista,
  onDuplicarCenario,
  onAtualizarCenario,
  onRemoverCenario,
}: {
  onVerResultados: () => void;
  planoVendas: PlanoVendas;
  custosNovos: LinhaCusto[];
  contextoCusto: ContextoCusto;
  resumoPrograma: ReturnType<typeof calcResumoPrograma>;
  vgvBruto: number;
  identificacao: IdentificacaoEstruturada;
  financiamento: ParametrosFinanciamento;
  estruturaCapital: EstruturaCapitalEstado;
  hurdles: (NivelHurdle & { id: string })[];
  feesNovos: Fee[];
  contextoFees: ContextoFees;
  resultado: ReturnType<typeof calcularCashFlow> | null;
  prontoParaCalcular: boolean;
  salesTableResolvida: LinhaSalesTableResolvida[];
  tipologiasNovas: Typology[];
  cenarios: Cenario[];
  onAdicionarCenarioConservador: () => void;
  onAdicionarCenarioOtimista: () => void;
  onDuplicarCenario: (cenario: Cenario) => void;
  onAtualizarCenario: (id: string, patch: Partial<Cenario>) => void;
  onRemoverCenario: (cenario: Cenario) => void;
}) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS_RESULTADOS)[number]>("Resumo");
  const [mostrarCapexZero, setMostrarCapexZero] = useState(false);
  const [sensMatriz, setSensMatriz] = useState<MatrizSensibilidade>("aquisicao_vs_custo_construcao");
  const [sensIndicador, setSensIndicador] = useState<IndicadorSensibilidade>("margem");

  const recebimentosValidos = validarEstruturaRecebimentos(planoVendas.estruturaRecebimentos);
  const datasPreenchidas = Boolean(
    planoVendas.dataLancamentoComercial && planoVendas.dataInicioConstrucao && planoVendas.dataFimConstrucao && planoVendas.dataEscritura
  );

  const somaRecebimentos =
    planoVendas.estruturaRecebimentos.pctReserva +
    planoVendas.estruturaRecebimentos.pctCpcv +
    planoVendas.estruturaRecebimentos.pctDuranteConstrucao +
    planoVendas.estruturaRecebimentos.pctConclusao +
    planoVendas.estruturaRecebimentos.pctEscritura;

  return (
    <>
      <div className="flex gap-1 mb-5 flex-wrap">
        {SUBTABS_RESULTADOS.map((t) => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              subtab === t ? "bg-[#142B3A] text-white border-[#142B3A]" : "border-[#E3DACB] text-[#142B3A]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!prontoParaCalcular && (
        <Card title="Preenche o Plano de Vendas primeiro">
          <p className="text-sm text-[#59636A]">
            {!datasPreenchidas && "Faltam datas do plano de vendas (lançamento, início/fim de construção, escritura). "}
            {!recebimentosValidos && `A estrutura de recebimentos soma ${Math.round(somaRecebimentos * 100)}%, tem de somar 100%. `}
            {custosNovos.length === 0 && "Ainda não há linhas de custo na etapa Aquisição e Custos."}
          </p>
        </Card>
      )}

      {subtab === "Resumo" && resultado && (
        <Card
          title="Resumo"
          subtitle="Pré-visualização em tempo real, sem fees de promotor nem impostos (só disponíveis depois de guardar) — para o lucro/margem completos, ver o dashboard do projeto."
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <ResumoItem label="Freguesia / Concelho" valor={[identificacao.freguesia, identificacao.concelho].filter(Boolean).join(", ") || "—"} />
            {/* Fonte única do ABC Total: resumoPrograma.abcTotal (calculado a partir do programa de tipologias) —
                nunca a soma direta de identificacao.abcAcimaSolo/abcAbaixoSolo, que pode divergir do programado
                (ver alerta de divergência na etapa Identificação) e mostrava dois "ABC total" lado a lado. */}
            <ResumoItem label="ABC Total" valor={`${Math.round(resumoPrograma.abcTotal)} m²`} />
            <ResumoItem label="ABP" valor={`${Math.round(resumoPrograma.abpTotal)} m²`} />
            <ResumoItem label="Área vendável equivalente" valor={`${Math.round(resumoPrograma.areaVendavelEquivalenteTotal)} m²`} />
            <ResumoItem label="Número de unidades" valor={String(resumoPrograma.totalUnidades)} />
            <ResumoItem label="Preço médio por m²" valor={`€${Math.round(resumoPrograma.precoMedioPonderadoM2).toLocaleString("pt-PT")}`} />
            <ResumoItem label="GDV" valor={`€${Math.round(resultado.gdv).toLocaleString("pt-PT")}`} />
            <ResumoItem
              label="Custo total (sem fees/impostos)"
              valor={`€${Math.round(resultado.custoTotal + resultado.custosFinanceiros).toLocaleString("pt-PT")}`}
            />
            <ResumoItem label="Lucro do projeto (sem fees/impostos)" valor={`€${Math.round(resultado.lucroProjeto).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Margem (sem fees/impostos)" valor={resultado.margemProjeto !== null ? `${(resultado.margemProjeto * 100).toFixed(1)}%` : "—"} />
            <ResumoItem label="Peak debt" valor={`€${Math.round(resultado.financiamento.peakDebt).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Equity investido" valor={`€${Math.round(resultado.equity.equityContributed).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Distribuições" valor={`€${Math.round(resultado.equity.capitalDevolvidoTotal).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Lucro do equity" valor={`€${Math.round(resultado.equity.lucroEquity).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Peak equity exposure" valor={`€${Math.round(resultado.equity.peakCashExposure).toLocaleString("pt-PT")}`} />
            <ResumoItem
              label="TIR do equity (alavancada)"
              valor={(() => {
                const irr = extrairIndicador(resultado, "irr_levered");
                return irr !== null ? `${(irr * 100).toFixed(1)}%` : "Não calculável";
              })()}
            />
            <ResumoItem
              label="MOIC do equity"
              valor={(() => {
                const moic = extrairIndicador(resultado, "moic");
                return moic !== null ? `${moic.toFixed(2)}x` : "Não calculável";
              })()}
            />
          </div>
        </Card>
      )}

      {subtab === "Cash flow" && resultado && (
        <Card title="Gráfico do cash flow" subtitle="Saldo de caixa acumulado e cash flow levered mensal">
          <CashFlowChart linhas={resultado.linhas} />
        </Card>
      )}

      {subtab === "Cash flow" && resultado && (
        <Card title="Cash flow mensal" subtitle={`${resultado.linhas.length} meses`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#59636A] uppercase">
                  <th className="pb-2 pr-2">Mês</th>
                  <th className="pb-2 pr-2">Receita</th>
                  <th className="pb-2 pr-2">Custos</th>
                  <th className="pb-2 pr-2">Comissão</th>
                  <th className="pb-2 pr-2">CF unlevered</th>
                  <th className="pb-2 pr-2">Drawdown</th>
                  <th className="pb-2 pr-2">Juros+fees</th>
                  <th className="pb-2 pr-2">Amortização</th>
                  <th className="pb-2 pr-2">Saldo devedor</th>
                  <th className="pb-2 pr-2">CF levered</th>
                  <th className="pb-2 pr-2">Equity call</th>
                  <th className="pb-2 pr-2">Distribuições</th>
                  <th className="pb-2 pr-2">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l) => {
                  const negativo = (v: number) => (v < 0 ? "text-[#B96343]" : undefined);
                  return (
                    <tr key={l.mes} className="border-t border-[#E3DACB]">
                      <td className="py-1 pr-2">{l.mes}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.receitaVendas)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.comissaoComercial)}</td>
                      <td className={`py-1 pr-2 ${negativo(l.cashFlowUnlevered)}`}>{fmtEUR(l.cashFlowUnlevered)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.drawdown)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.jurosEFees)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.amortizacao)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.saldoDivida)}</td>
                      <td className={`py-1 pr-2 ${negativo(l.cashFlowLevered)}`}>{fmtEUR(l.cashFlowLevered)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.equityCall)}</td>
                      <td className="py-1 pr-2">{fmtEUR(l.distribuicoes)}</td>
                      <td className={`py-1 pr-2 ${negativo(l.saldoCaixaAcumulado)}`}>{fmtEUR(l.saldoCaixaAcumulado)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subtab === "Capex" && resultado && (
        <Card title="Capex por categoria">
          <label className="flex items-center gap-2 text-xs text-[#59636A] mb-3">
            <input type="checkbox" checked={mostrarCapexZero} onChange={(e) => setMostrarCapexZero(e.target.checked)} />
            Mostrar linhas com valor zero
          </label>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#59636A] uppercase text-xs">
                <th className="pb-2">Categoria</th>
                <th className="pb-2">Total</th>
                <th className="pb-2">% do custo total</th>
                <th className="pb-2">% do GDV</th>
                <th className="pb-2">€/unidade</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(
                custosNovos.reduce<Record<string, number>>((acc, c) => {
                  const resolvido = resolverCustos([c], contextoCusto)[0];
                  acc[c.categoria] = (acc[c.categoria] ?? 0) + resolvido.valorResolvido;
                  return acc;
                }, {})
              )
                .filter(([, valor]) => mostrarCapexZero || Math.abs(valor) > 0.005)
                .map(([categoria, valor]) => (
                <tr key={categoria} className="border-t border-[#E3DACB]">
                  <td className="py-1.5">{categoria}</td>
                  <td className="py-1.5">€{Math.round(valor).toLocaleString("pt-PT")}</td>
                  <td className="py-1.5">{resultado!.custoTotal > 0 ? `${((valor / resultado!.custoTotal) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="py-1.5">{resultado!.gdv > 0 ? `${((valor / resultado!.gdv) * 100).toFixed(1)}%` : "—"}</td>
                  <td className="py-1.5">
                    {contextoCusto.numeroUnidades > 0 ? `€${Math.round(valor / contextoCusto.numeroUnidades).toLocaleString("pt-PT")}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {subtab === "Funding" && resultado && (
        <Card title="Funding">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <ResumoItem label="Equity" valor={`€${Math.round(resultado.equity.equityContributed).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Dívida bancária" valor={`€${Math.round(resultado.financiamento.dividaTotalLevantada).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Recebimentos de clientes" valor={`€${Math.round(resultado.gdv).toLocaleString("pt-PT")}`} />
            <ResumoItem
              label="Total funding"
              valor={`€${Math.round(resultado.equity.equityContributed + resultado.financiamento.dividaTotalLevantada).toLocaleString("pt-PT")}`}
            />
            <ResumoItem label="Peak funding (equity)" valor={`€${Math.round(resultado.equity.peakCashExposure).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Capital devolvido" valor={`€${Math.round(resultado.equity.capitalDevolvidoTotal).toLocaleString("pt-PT")}`} />
          </div>
        </Card>
      )}

      {subtab === "Financiamento" && resultado && (
        <Card title="Financiamento">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <ResumoItem label="Peak debt" valor={`€${Math.round(resultado.financiamento.peakDebt).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Total drawdown" valor={`€${Math.round(resultado.financiamento.dividaTotalLevantada).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Juros totais" valor={`€${Math.round(resultado.financiamento.jurosTotais).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Fees bancários" valor={`€${Math.round(resultado.financiamento.feesBancarios).toLocaleString("pt-PT")}`} />
            <ResumoItem label="LTV" valor={resultado.financiamento.ltv !== null ? `${(resultado.financiamento.ltv * 100).toFixed(1)}%` : "—"} />
            <ResumoItem label="LTC" valor={resultado.financiamento.ltc !== null ? `${(resultado.financiamento.ltc * 100).toFixed(1)}%` : "—"} />
            <ResumoItem label="Mês da dívida máxima" valor={resultado.financiamento.mesDividaMaxima ?? "—"} />
          </div>
        </Card>
      )}

      {subtab === "Investidor e promotor" && resultado && (
        <>
          {estruturaCapital.temInvestidorExterno ? (
            (() => {
              const feesTotais = agregarFees(feesNovos, contextoFees).total;
              const { investidor, promotor } = calcularResultadosComWaterfall(
                resultado.linhas,
                hurdles,
                estruturaCapital.percentagemInvestidor,
                feesTotais
              );
              return (
                <>
                  <Card title="Resultado do investidor externo" subtitle="Devolução de capital, retorno preferencial e tiers calculados pela waterfall real (waterfall.ts) — nunca uma percentagem sobre o lucro total.">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <ResumoItem label="Equity contributed" valor={`€${Math.round(investidor.equityContributed).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="Capital devolvido" valor={`€${Math.round(investidor.capitalDevolvido).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="Distribuições totais" valor={`€${Math.round(investidor.distribuicoesTotais).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="Lucro" valor={`€${Math.round(investidor.lucro).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="MOIC" valor={`${investidor.moic.toFixed(2)}x`} />
                      <ResumoItem label="IRR" valor={investidor.irr !== null ? `${(investidor.irr * 100).toFixed(1)}%` : "Não calculável"} />
                    </div>
                  </Card>
                  <Card title="Resultado do promotor" subtitle="Co-investimento, fees e promote sempre separados — nunca somados sem discriminação.">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                      <ResumoItem label="Co-investimento contribuído" valor={`€${Math.round(promotor.coInvestimentoContribuido).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="Retorno do co-investimento" valor={`€${Math.round(promotor.retornoCoInvestimento).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="Fees" valor={`€${Math.round(promotor.fees).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="Promote" valor={`€${Math.round(promotor.promote).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="Lucro total" valor={`€${Math.round(promotor.lucroTotal).toLocaleString("pt-PT")}`} />
                      <ResumoItem label="MOIC do co-investimento" valor={`${promotor.moicCoInvestimento.toFixed(2)}x`} />
                    </div>
                  </Card>
                </>
              );
            })()
          ) : (
            <Card title="Resultado do promotor" subtitle="Sem investidor externo — todo o resultado é do promotor.">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <ResumoItem label="Equity contributed" valor={`€${Math.round(resultado.equity.equityContributed).toLocaleString("pt-PT")}`} />
                <ResumoItem label="Peak cash exposure" valor={`€${Math.round(resultado.equity.peakCashExposure).toLocaleString("pt-PT")}`} />
                <ResumoItem label="Capital + lucro devolvido" valor={`€${Math.round(resultado.equity.capitalDevolvidoTotal).toLocaleString("pt-PT")}`} />
                <ResumoItem label="Lucro do equity" valor={`€${Math.round(resultado.equity.lucroEquity).toLocaleString("pt-PT")}`} />
                <ResumoItem
                  label="MOIC"
                  valor={(() => {
                    const moic = extrairIndicador(resultado, "moic");
                    return moic !== null ? `${moic.toFixed(2)}x` : "Não calculável";
                  })()}
                />
                <ResumoItem
                  label="TIR (alavancada)"
                  valor={(() => {
                    const irr = extrairIndicador(resultado, "irr_levered");
                    return irr !== null ? `${(irr * 100).toFixed(1)}%` : "Não calculável";
                  })()}
                />
              </div>
            </Card>
          )}
        </>
      )}

      {subtab === "Sensibilidades" && prontoParaCalcular && (
        <Card
          title="Sensibilidades"
          subtitle="Cada célula recalcula o modelo completo — a célula central (0%×0%) é sempre igual ao cenário-base. Indicadores Lucro/Margem aqui são sem fees de promotor nem impostos (mesmo critério do Resumo) — para o lucro/margem completos, ver o dashboard do projeto."
        >
          <Row>
            <FieldGroup label="Matriz">
              <select className="input-dark" value={sensMatriz} onChange={(e) => setSensMatriz(e.target.value as MatrizSensibilidade)}>
                <option value="aquisicao_vs_custo_construcao">Aquisição × Custo de construção</option>
                <option value="custo_construcao_vs_preco_venda">Custo de construção × Preço de venda</option>
                <option value="aquisicao_vs_preco_venda">Aquisição × Preço de venda</option>
              </select>
            </FieldGroup>
            <FieldGroup label="Indicador">
              <select className="input-dark" value={sensIndicador} onChange={(e) => setSensIndicador(e.target.value as IndicadorSensibilidade)}>
                <option value="margem">Margem</option>
                <option value="lucro">Lucro</option>
                <option value="irr_levered">IRR levered</option>
                <option value="irr_unlevered">IRR unlevered</option>
                <option value="moic">MOIC</option>
                <option value="roe">ROE</option>
                <option value="peak_cash_exposure">Peak cash exposure</option>
                <option value="peak_debt">Peak debt</option>
                <option value="equity_contributed">Equity contributed</option>
              </select>
            </FieldGroup>
          </Row>
          <SensibilidadesMatriz
            base={{
              linhasCusto: custosNovos,
              contextoCusto,
              receitaTotalGdvBase: vgvBruto,
              planoVendas,
              parametrosFinanciamento: financiamento,
              salesTableResolvida,
              tipologias: tipologiasNovas,
              comissaoParametros: {
                percentagemComissao: planoVendas.comissaoMediacaoPct,
                taxaIva: planoVendas.comissaoTaxaIva,
                pctPagoNoSinal: planoVendas.comissaoPctPagoSinal,
                pctPagoNaEscritura: planoVendas.comissaoPctPagoEscritura,
                ivaRecuperavelPct: planoVendas.comissaoIvaRecuperavelPct,
              },
            }}
            matriz={sensMatriz}
            indicador={sensIndicador}
          />
        </Card>
      )}

      {subtab === "Cenários" && prontoParaCalcular && (
        <Card
          title="Cenários"
          subtitle="Cada cenário recalcula o modelo completo com as suas próprias variações — o cenário-base nunca pode ser apagado ou duplicado por cima. Lucro/margem aqui são sem fees de promotor nem impostos (mesmo critério do Resumo) — para os valores completos, ver o dashboard do projeto."
        >
          <div className="flex gap-2 mb-4">
            <button onClick={onAdicionarCenarioConservador} className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]">
              + Conservador
            </button>
            <button onClick={onAdicionarCenarioOtimista} className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]">
              + Otimista
            </button>
          </div>

          {cenarios.map((c) => (
            <div key={c.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
              <Row>
                <FieldGroup label="Nome">
                  <input
                    className="input-dark"
                    value={c.nome}
                    onChange={(e) => onAtualizarCenario(c.id, { nome: e.target.value })}
                    disabled={c.ehBase}
                  />
                </FieldGroup>
                <FieldGroup label="Δ Aquisição (%)">
                  <PercentInput value={c.deltaAquisicao} onChange={(v) => onAtualizarCenario(c.id, { deltaAquisicao: v })} disabled={c.ehBase} />
                </FieldGroup>
                <FieldGroup label="Δ Construção (%)">
                  <PercentInput value={c.deltaConstrucao} onChange={(v) => onAtualizarCenario(c.id, { deltaConstrucao: v })} disabled={c.ehBase} />
                </FieldGroup>
                <FieldGroup label="Δ Preço de venda (%)">
                  <PercentInput value={c.deltaPreco} onChange={(v) => onAtualizarCenario(c.id, { deltaPreco: v })} disabled={c.ehBase} />
                </FieldGroup>
              </Row>
              <div className="flex justify-end gap-3">
                <button onClick={() => onDuplicarCenario(c)} className="text-xs text-[#142B3A] underline">
                  Duplicar
                </button>
                {!c.ehBase && (
                  <button onClick={() => onRemoverCenario(c)} className="text-[#A13D2E] text-xs">
                    Remover
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#59636A] uppercase">
                  <th className="pb-2 pr-4">Cenário</th>
                  <th className="pb-2 pr-4">GDV</th>
                  <th className="pb-2 pr-4">Custo total</th>
                  <th className="pb-2 pr-4">Lucro*</th>
                  <th className="pb-2 pr-4">Margem*</th>
                  <th className="pb-2 pr-4">TIR (equity)</th>
                  <th className="pb-2 pr-4">MOIC</th>
                  <th className="pb-2 pr-4">Peak exposure</th>
                </tr>
              </thead>
              <tbody>
                {compararCenarios(
                  {
                    linhasCusto: custosNovos,
                    contextoCusto,
                    receitaTotalGdvBase: vgvBruto,
                    planoVendas,
                    parametrosFinanciamento: financiamento,
                    salesTableResolvida,
                    tipologias: tipologiasNovas,
                    comissaoParametros: {
                      percentagemComissao: planoVendas.comissaoMediacaoPct,
                      taxaIva: planoVendas.comissaoTaxaIva,
                      pctPagoNoSinal: planoVendas.comissaoPctPagoSinal,
                      pctPagoNaEscritura: planoVendas.comissaoPctPagoEscritura,
                      ivaRecuperavelPct: planoVendas.comissaoIvaRecuperavelPct,
                    },
                  },
                  cenarios
                ).map((linha) => (
                  <tr key={linha.cenario.id} className="border-t border-[#E3DACB]">
                    <td className="py-1.5 pr-4 text-[#142B3A] font-medium">{linha.cenario.nome}</td>
                    <td className="py-1.5 pr-4">€{Math.round(linha.gdv).toLocaleString("pt-PT")}</td>
                    <td className="py-1.5 pr-4">€{Math.round(linha.custoTotal).toLocaleString("pt-PT")}</td>
                    <td className="py-1.5 pr-4">€{Math.round(linha.lucro).toLocaleString("pt-PT")}</td>
                    <td className="py-1.5 pr-4">{(linha.margem * 100).toFixed(1)}%</td>
                    <td className="py-1.5 pr-4">{linha.irr !== null ? `${(linha.irr * 100).toFixed(1)}%` : "Não calculável"}</td>
                    <td className="py-1.5 pr-4">{linha.moic !== null ? `${linha.moic.toFixed(2)}x` : "Não calculável"}</td>
                    <td className="py-1.5 pr-4">€{Math.round(linha.peakExposure).toLocaleString("pt-PT")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Ver resultados">
        <p className="text-sm text-[#59636A] mb-3">O dashboard do projeto recalcula os resultados ao vivo a partir do que foi preenchido aqui — não é preciso nenhum passo de &quot;calcular&quot; separado.</p>
        <button onClick={onVerResultados} className="px-6 py-3 rounded-lg bg-[#142B3A] text-white text-sm font-bold">
          Ver dashboard do projeto
        </button>
      </Card>

      <Card title="Relatório">
        <button disabled className="px-6 py-3 rounded-lg bg-[#E3DACB] text-[#8FA6AF] text-sm font-bold cursor-not-allowed">
          Gerar relatório — Em breve
        </button>
      </Card>
    </>
  );
}

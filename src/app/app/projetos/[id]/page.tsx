import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { carregarResultadoProjeto } from "@/lib/calc/project-loader";
import type { NivelRecomendacao } from "@/lib/calc/recomendacao";
import { CashFlowChart } from "./_components/cash-flow-chart";
import { MatrizSensibilidadeView } from "./_components/matriz-sensibilidade";

function fmtEUR(v: number) {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(v) + " €";
}
function fmtPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}
function fmtIndicador(v: number | null | undefined, formatador: (v: number) => string) {
  return v !== null && v !== undefined ? formatador(v) : "Não calculável";
}
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function fmtMesAno(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes] = dataIso.split("-").map(Number);
  if (!ano || !mes) return "—";
  return `${MESES_ABREV[mes - 1]}/${String(ano).slice(2)}`;
}

const LABEL_RECOMENDACAO: Record<NivelRecomendacao, string> = {
  avancar: "Avançar",
  avancar_com_condicoes: "Avançar com condições",
  rever_premissas: "Rever premissas",
  nao_avancar: "Não avançar",
  dados_insuficientes: "Dados insuficientes",
};
const COR_RECOMENDACAO: Record<NivelRecomendacao, string> = {
  avancar: "#4E7A5C",
  avancar_com_condicoes: "#C08A3E",
  rever_premissas: "#C08A3E",
  nao_avancar: "#A13D2E",
  dados_insuficientes: "#59636A",
};

export default async function ProjetoResultadosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projetoExiste } = await supabase.from("projects").select("id").eq("id", id).single();
  if (!projetoExiste) notFound();

  const r = await carregarResultadoProjeto(supabase, id);

  if (!r.dadosSuficientes || !r.resultado || !r.underwriting) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-white border border-[#E3DACB] rounded-xl p-8 text-center">
          <h1 className="text-lg font-bold text-[#142B3A] mb-2">{r.projeto.nome}</h1>
          <p className="text-sm text-[#59636A] mb-6">
            {r.motivoInsuficiente ?? "Ainda não há dados suficientes para calcular os resultados deste projeto."}
          </p>
          <Link href={`/app/projetos/${id}/dados`} className="px-5 py-2.5 rounded-lg bg-[#142B3A] text-white text-sm font-semibold">
            Continuar a preencher
          </Link>
        </div>
      </div>
    );
  }

  const { resultado, underwriting: u } = r;
  const nivelRecomendacao = r.recomendacao?.nivel ?? "dados_insuficientes";

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#142B3A]">{r.projeto.nome}</h1>
          <p className="text-sm text-[#59636A] mt-1">
            {r.projeto.localizacao || "Sem localização"} · {r.projeto.tipoProjeto}
          </p>
        </div>
        <Link href={`/app/projetos/${id}/dados`} className="px-4 py-2.5 rounded-lg border border-[#E3DACB] text-[#142B3A] text-sm font-semibold">
          Editar premissas
        </Link>
      </div>

      <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Recomendação</div>
            <div className="text-lg font-bold" style={{ color: COR_RECOMENDACAO[nivelRecomendacao] }}>
              {LABEL_RECOMENDACAO[nivelRecomendacao]}
            </div>
          </div>
        </div>
        {r.recomendacao && r.recomendacao.fatores.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-[#59636A]">Ver fatores considerados</summary>
            <ul className="mt-2 space-y-1">
              {r.recomendacao.fatores.map((f) => (
                <li key={f.nome} className="text-xs flex items-start gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full mt-0.5 shrink-0"
                    style={{ background: f.ok === null ? "#8FA6AF" : f.ok ? "#4E7A5C" : "#A13D2E" }}
                  />
                  <span className="text-[#59636A]">{f.explicacao}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-[#59636A] mt-2">
              Política de referência, não uma régua universal — configurável por organização/projeto.
            </p>
          </details>
        )}
      </div>

      {r.alertas.length > 0 && (
        <div className="mb-5 space-y-2">
          {r.alertas.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-2 px-4 py-2.5 rounded-lg text-sm border"
              style={{
                borderColor: a.tipo === "erro" ? "#A13D2E" : a.tipo === "alerta" ? "#B96343" : "#68735E",
                background: a.tipo === "erro" ? "#FBEEEC" : a.tipo === "alerta" ? "#FDF3EC" : "#F1F2ED",
                color: a.tipo === "erro" ? "#A13D2E" : a.tipo === "alerta" ? "#8A4A2E" : "#4A5240",
              }}
            >
              <span className="font-bold uppercase text-xs mt-0.5">{a.tipo === "erro" ? "Erro" : a.tipo === "alerta" ? "Alerta" : "Sugestão"}</span>
              <span>{a.mensagem}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bloco 1 — Projeto (secção 16 do prompt 03_08) */}
      <SectionLabel>Projeto</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Kpi
          label="VGV"
          value={fmtEUR(u.grossVgv)}
          sub={`Líquido ${fmtEUR(u.netVgv)} · comissão ${u.commercialCommissionPct !== null ? fmtPct(u.commercialCommissionPct) : "—"}`}
          color="#3E6E8E"
        />
        <Kpi
          label="CAPEX total"
          value={fmtEUR(u.projectCapexBeforePromoteAndTax)}
          sub={u.capexPerAbcSqm !== null ? `${fmtEUR(u.capexPerAbcSqm)}/m² ABC` : undefined}
          color="#B96343"
        />
        <Kpi label="Ticket médio" value={u.averageTicket !== null ? fmtEUR(u.averageTicket) : "—"} sub={`${u.unitCount} unidades`} color="#3E6E8E" />
        <Kpi
          label="Duração"
          value={u.durationMonths !== null ? `${u.durationMonths} meses` : "—"}
          sub={`${fmtMesAno(r.execucao?.dataInicio ?? null)} → ${fmtMesAno(r.execucao?.dataFim ?? null)}`}
          color="#3E6E8E"
        />
      </div>

      {/* Bloco 2 — Capital */}
      <SectionLabel>Capital</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Kpi
          label="Equity alavancado"
          value={fmtEUR(u.leveredEquityInvested)}
          sub={u.projectCapexBeforePromoteAndTax > 0 ? `${fmtPct(u.leveredEquityInvested / u.projectCapexBeforePromoteAndTax)} do custo total` : undefined}
          color="#3E6E8E"
        />
        <Kpi
          label="Equity não alavancado"
          value={u.unleveredEquityInvested !== null ? fmtEUR(u.unleveredEquityInvested) : "Não calculável"}
          sub={
            u.unleveredEquityInvested !== null && u.projectCapexBeforePromoteAndTax > 0
              ? `${fmtPct(u.unleveredEquityInvested / u.projectCapexBeforePromoteAndTax)} do custo total`
              : undefined
          }
          color="#3E6E8E"
        />
        <Kpi
          label="Dívida utilizada / peak debt"
          value={`${fmtEUR(u.usedDebtTotal)} / ${fmtEUR(u.peakDebt)}`}
          sub={u.effectiveLtc !== null ? `LTC efetivo ${fmtPct(u.effectiveLtc)}` : undefined}
          color="#C08A3E"
        />
        <Kpi label="Peak equity" value={fmtEUR(u.peakEquityExposure)} sub={u.peakEquityMonth ? `Mês ${u.peakEquityMonth}` : undefined} color="#C08A3E" />
      </div>

      {/* Bloco 3 — Resultado */}
      <SectionLabel>Resultado</SectionLabel>
      <div className="grid grid-cols-5 gap-4 mb-8">
        <Kpi label="Lucro antes de promote e impostos" value={fmtEUR(u.profitBeforePromoteAndTax)} color="#4E7A5C" />
        <Kpi label="Promote" value={fmtEUR(u.promoteFee)} color="#B96343" />
        <Kpi label="Lucro após promote" value={fmtEUR(u.profitAfterPromote)} color="#4E7A5C" />
        <Kpi
          label="Impostos estimados"
          value={fmtEUR(u.estimatedTaxes)}
          sub={u.profitAfterPromote !== 0 ? `taxa efetiva ${fmtPct(u.estimatedTaxes / Math.abs(u.profitAfterPromote))}` : undefined}
          color="#B96343"
        />
        <Kpi label="Lucro líquido" value={fmtEUR(u.netProfit)} color="#4E7A5C" />
      </div>

      {/* Bloco 4 — Retorno */}
      <SectionLabel>Retorno</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-3">
        <Kpi
          label="ROI alavancado"
          value={fmtIndicador(u.leveredRoi, fmtPct)}
          sub={u.unleveredRoi !== null ? `Não alavancado: ${fmtPct(u.unleveredRoi)}` : undefined}
          color="#4E7A5C"
        />
        <Kpi
          label="TIR alavancada"
          value={fmtIndicador(u.leveredIrr, fmtPct)}
          sub={u.unleveredIrr !== null ? `Não alavancada: ${fmtPct(u.unleveredIrr)}` : undefined}
          color="#4E7A5C"
        />
        <Kpi label="MOIC" value={fmtIndicador(u.moic, (v) => v.toFixed(2) + "x")} color="#4E7A5C" />
        <Kpi
          label="Retorno total"
          value={fmtEUR(u.totalReturn)}
          sub={`Capital ${fmtEUR(u.capitalReturned)} · Lucro ${fmtEUR(u.profitDistributed)}`}
          color="#4E7A5C"
        />
      </div>
      <p className="text-xs text-[#59636A] mb-8">
        Payback: {u.paybackMonth ?? "Não recupera no prazo do projeto"}. TIR alavancada usa exclusivamente os fluxos datados do investidor (capital calls
        negativos, distribuições positivas); TIR não alavancada usa os fluxos operacionais sem financiamento.
      </p>

      {/* Bloco 5 — Risco */}
      <SectionLabel>Risco</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-3">
        <Kpi
          label="Alertas críticos"
          value={String(r.alertas.filter((a) => a.tipo === "erro").length)}
          sub={`${r.alertas.length} alertas no total`}
          color={r.alertas.some((a) => a.tipo === "erro") ? "#A13D2E" : "#4E7A5C"}
        />
        <Kpi label="Peak equity" value={fmtEUR(u.peakEquityExposure)} color="#C08A3E" />
        <Kpi label="Peak debt" value={fmtEUR(u.peakDebt)} sub={u.effectiveLtc !== null ? `LTC ${fmtPct(u.effectiveLtc)}` : undefined} color="#C08A3E" />
        <Kpi
          label="Qualidade dos dados"
          value={u.qualidade.nivelConfianca === "alta" ? "Alta" : u.qualidade.nivelConfianca === "media" ? "Média" : "Baixa"}
          sub={u.qualidade.todasReconciliacoesOk ? "Reconciliações OK" : "Reconciliação fora da tolerância"}
          color={u.qualidade.todasReconciliacoesOk ? "#4E7A5C" : "#A13D2E"}
        />
      </div>
      <p className="text-xs text-[#59636A] mb-3">
        Campos ainda sem motor dedicado nesta versão: {u.qualidade.camposEmFalta.length > 0 ? u.qualidade.camposEmFalta.join("; ") : "nenhum"}.
      </p>

      {r.sensibilidades && (
        <>
          <SectionLabel>Sensibilidade</SectionLabel>
          <p className="text-xs text-[#59636A] -mt-3 mb-3">
            Cada célula corre a função central completa (development fee, financiamento, promote, impostos, equity e retorno) — a célula central
            (0%×0%) é exatamente o cenário-base acima. Nunca altera as premissas guardadas do projeto.
          </p>
          <MatrizSensibilidadeView titulo="Aquisição × Custo de construção" resultado={r.sensibilidades.aquisicaoVsCustoConstrucao} />
          <MatrizSensibilidadeView titulo="Custo de construção × Preço de venda" resultado={r.sensibilidades.custoConstrucaoVsPrecoVenda} />
          <MatrizSensibilidadeView titulo="Aquisição × Preço de venda" resultado={r.sensibilidades.aquisicaoVsPrecoVenda} />
        </>
      )}

      {resultado.equity.fluxosInvestidor.length > 0 && (
        <details className="mb-8 border border-[#E3DACB] rounded-lg px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[#142B3A]">
            Ver fluxos usados no cálculo de TIR e MOIC alavancados ({resultado.equity.fluxosInvestidor.length})
          </summary>
          <table className="w-full text-xs mt-3">
            <thead>
              <tr className="text-left text-[#59636A] border-b border-[#E3DACB]">
                <th className="py-1 pr-4">Data</th>
                <th className="py-1 pr-4">Tipo</th>
                <th className="py-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {resultado.equity.fluxosInvestidor.map((f, i) => (
                <tr key={i} className="border-b border-[#F0EBE0]">
                  <td className="py-1 pr-4">{f.data}</td>
                  <td className="py-1 pr-4">{f.valor < 0 ? "Capital call" : "Distribuição"}</td>
                  <td className={`py-1 text-right ${f.valor < 0 ? "text-[#B96343]" : "text-[#4E7A5C]"}`}>{fmtEUR(f.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <SectionLabel>Áreas e programa</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <Kpi label="Área do lote" value={r.projeto.areaLote !== null ? `${Math.round(r.projeto.areaLote)} m²` : "—"} color="#3E6E8E" />
        <Kpi label="ABC Total" value={`${Math.round(r.abcTotal ?? 0)} m²`} color="#3E6E8E" />
        <Kpi
          label="Eficiência"
          value={r.eficiencia !== null ? fmtPct(r.eficiencia) : "—"}
          sub={`${r.resumoPrograma?.totalUnidades ?? 0} unidades`}
          color="#3E6E8E"
        />
        <Kpi label="Área vendável equivalente" value={`${Math.round(r.resumoPrograma?.areaVendavelEquivalenteTotal ?? 0)} m²`} color="#3E6E8E" />
      </div>

      {r.execucao && (
        <>
          <SectionLabel>Execução</SectionLabel>
          <p className="text-xs text-[#59636A] -mt-3 mb-3">
            Gerado automaticamente a partir da Aquisição, Custos, Plano de Vendas e Financiamento — para mudar uma data, edita-a na etapa de origem.
          </p>
          <div className="grid grid-cols-4 gap-4 mb-5">
            <Kpi label="Início do projeto" value={fmtMesAno(r.execucao.dataInicio)} color="#3E6E8E" />
            <Kpi label="Lançamento comercial" value={fmtMesAno(r.execucao.dataLancamentoComercial)} color="#3E6E8E" />
            <Kpi label="Início da construção" value={fmtMesAno(r.execucao.dataInicioConstrucao)} color="#3E6E8E" />
            <Kpi
              label="Fim da construção"
              value={fmtMesAno(r.execucao.dataFimConstrucao)}
              sub={r.execucao.duracaoConstrucaoMeses !== null ? `${r.execucao.duracaoConstrucaoMeses} meses de obra` : undefined}
              color="#3E6E8E"
            />
          </div>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <Kpi label="Primeira venda" value={fmtMesAno(r.execucao.dataPrimeiraVenda)} color="#3E6E8E" />
            <Kpi label="Última venda" value={fmtMesAno(r.execucao.dataUltimaVenda)} color="#3E6E8E" />
            <Kpi label="Escrituras (data prevista)" value={fmtMesAno(r.execucao.dataEscritura)} color="#3E6E8E" />
            <Kpi
              label="Fim do horizonte modelado"
              value={fmtMesAno(r.execucao.dataFim)}
              sub={`${r.execucao.duracaoTotalMeses} meses no total`}
              color="#3E6E8E"
            />
          </div>
        </>
      )}

      {r.temInvestidorExterno && r.investidorPromotor && (
        <>
          <SectionLabel>Investidor e promotor</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white border border-[#E3DACB] rounded-xl p-5">
              <p className="text-xs font-bold uppercase text-[#59636A] mb-3">Investidor externo</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Kpi label="Equity contributed" value={fmtEUR(r.investidorPromotor.investidor.equityContributed)} color="#3E6E8E" />
                <Kpi label="MOIC" value={r.investidorPromotor.investidor.moic.toFixed(2) + "x"} color="#4E7A5C" />
                <Kpi label="IRR" value={fmtIndicador(r.investidorPromotor.investidor.irr, fmtPct)} color="#4E7A5C" />
                <Kpi label="Lucro" value={fmtEUR(r.investidorPromotor.investidor.lucro)} color="#4E7A5C" />
              </div>
            </div>
            <div className="bg-white border border-[#E3DACB] rounded-xl p-5">
              <p className="text-xs font-bold uppercase text-[#59636A] mb-3">Promotor</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Kpi label="Co-investimento" value={fmtEUR(r.investidorPromotor.promotor.coInvestimentoContribuido)} color="#3E6E8E" />
                <Kpi label="Fees" value={fmtEUR(r.investidorPromotor.promotor.fees)} color="#B96343" />
                <Kpi label="Promote" value={fmtEUR(r.investidorPromotor.promotor.promote)} color="#4E7A5C" />
                <Kpi label="Lucro total" value={fmtEUR(r.investidorPromotor.promotor.lucroTotal)} color="#4E7A5C" />
              </div>
            </div>
          </div>
        </>
      )}

      {(r.estruturaSobreVgv || r.metricasPorM2) && (
        <details className="mb-8 border border-[#E3DACB] rounded-lg px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[#142B3A]">Estrutura sobre VGV e métricas por m² (detalhe)</summary>

          {r.estruturaSobreVgv && (
            <div className="mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[#59636A] uppercase">
                      <th className="pb-2 pr-4">Categoria</th>
                      <th className="pb-2 pr-4">€</th>
                      <th className="pb-2 pr-4">% VGV</th>
                      <th className="pb-2 pr-4">€/ABC</th>
                      <th className="pb-2 pr-4">€/ABP</th>
                      <th className="pb-2 pr-4">€/unidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.estruturaSobreVgv.linhas.map((l) => (
                      <tr key={l.categoria} className="border-t border-[#E3DACB]">
                        <td className="py-1.5 pr-4 text-[#142B3A] font-medium">{l.categoria}</td>
                        <td className="py-1.5 pr-4">{fmtEUR(l.euros)}</td>
                        <td className="py-1.5 pr-4">{l.pctVgv !== null ? fmtPct(l.pctVgv) : "—"}</td>
                        <td className="py-1.5 pr-4">{l.eurPorAbc !== null ? fmtEUR(l.eurPorAbc) : "—"}</td>
                        <td className="py-1.5 pr-4">{l.eurPorAbp !== null ? fmtEUR(l.eurPorAbp) : "—"}</td>
                        <td className="py-1.5 pr-4">{l.eurPorUnidade !== null ? fmtEUR(l.eurPorUnidade) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 mt-3 text-xs">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{
                    background:
                      r.estruturaSobreVgv.semaforoAquisicaoVgv === "verde"
                        ? "#4E7A5C"
                        : r.estruturaSobreVgv.semaforoAquisicaoVgv === "amarelo"
                          ? "#C08A3E"
                          : "#A13D2E",
                  }}
                />
                <span className="text-[#59636A]">
                  Rácio Aquisição/VGV: <strong className="text-[#142B3A]">{fmtPct(r.estruturaSobreVgv.racioAquisicaoVgv)}</strong> — régua de
                  referência Landwise, não uma regra universal.
                </span>
              </div>
            </div>
          )}

          {r.metricasPorM2 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#59636A] uppercase">
                    <th className="pb-2 pr-4">Categoria</th>
                    <th className="pb-2 pr-4">€</th>
                    <th className="pb-2 pr-4">€/ABC</th>
                    <th className="pb-2 pr-4">€/ABP</th>
                  </tr>
                </thead>
                <tbody>
                  {r.metricasPorM2.linhas.map((l) => (
                    <tr key={l.categoria} className="border-t border-[#E3DACB]">
                      <td className="py-1.5 pr-4 text-[#142B3A] font-medium">{l.categoria}</td>
                      <td className="py-1.5 pr-4">{fmtEUR(l.euros)}</td>
                      <td className="py-1.5 pr-4">{l.eurPorAbc !== null ? fmtEUR(l.eurPorAbc) : "—"}</td>
                      <td className="py-1.5 pr-4">{l.eurPorAbp !== null ? fmtEUR(l.eurPorAbp) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}

      <SectionLabel>Cash flow mensal</SectionLabel>
      <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-5">
        <CashFlowChart linhas={resultado.linhas} />
      </div>
      <details className="mb-8">
        <summary className="cursor-pointer text-sm font-medium text-[#142B3A] mb-3">Ver tabela técnica ({resultado.linhas.length} meses)</summary>
        <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#59636A] uppercase">
                <th className="pb-2 pr-4">Mês</th>
                <th className="pb-2 pr-4">Receita</th>
                <th className="pb-2 pr-4">CF unlevered</th>
                <th className="pb-2 pr-4">CF levered</th>
                <th className="pb-2 pr-4">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((l) => (
                <tr key={l.mes} className="border-t border-[#E3DACB]">
                  <td className="py-1.5 pr-4">{l.mes}</td>
                  <td className="py-1.5 pr-4">{fmtEUR(l.receitaVendas)}</td>
                  <td className="py-1.5 pr-4">{fmtEUR(l.cashFlowUnlevered)}</td>
                  <td className="py-1.5 pr-4">{fmtEUR(l.cashFlowLevered)}</td>
                  <td className="py-1.5 pr-4 font-semibold text-[#142B3A]">{fmtEUR(l.saldoCaixaAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-wide text-[#68735E] mb-3">{children}</div>;
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-[#E3DACB] rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1.5">{label}</div>
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-[#59636A] mt-0.5">{sub}</div>}
    </div>
  );
}

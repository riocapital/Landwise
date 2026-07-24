import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { carregarResultadoProjeto } from "@/lib/calc/project-loader";
import { extrairIndicador } from "@/lib/calc/sensibilidades";

function fmtEUR(v: number) {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(v) + " €";
}
function fmtPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}
function fmtIndicador(v: number | null, formatador: (v: number) => string) {
  return v !== null ? formatador(v) : "Não calculável";
}

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

  if (!r.dadosSuficientes || !r.resultado) {
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

  const { resultado } = r;
  const irr = extrairIndicador(resultado, "irr_levered");
  const moic = extrairIndicador(resultado, "moic");

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#142B3A]">{r.projeto.nome}</h1>
          <p className="text-sm text-[#59636A] mt-1">
            {r.projeto.localizacao || "Sem localização"} · {r.projeto.tipoProjeto}
          </p>
        </div>
        <Link
          href={`/app/projetos/${id}/dados`}
          className="px-4 py-2.5 rounded-lg border border-[#E3DACB] text-[#142B3A] text-sm font-semibold"
        >
          Editar premissas
        </Link>
      </div>

      <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Recomendação</div>
          <div className="text-lg font-bold text-[#142B3A]">
            {resultado.lucroLevered > 0 ? "Avançar com condições" : "Não avançar sem rever premissas"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Margem</div>
          <div className="text-lg font-bold" style={{ color: resultado.margem > 0 ? "#4E7A5C" : "#A13D2E" }}>
            {fmtPct(resultado.margem)}
          </div>
        </div>
      </div>

      <SectionLabel>Indicadores de retorno</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <Kpi label="VGV Bruto" value={fmtEUR(resultado.gdv)} color="#3E6E8E" />
        <Kpi label="Custo total" value={fmtEUR(resultado.custoTotal)} color="#B96343" />
        <Kpi label="Lucro (levered)" value={fmtEUR(resultado.lucroLevered)} color="#4E7A5C" />
        <Kpi label="Margem" value={fmtPct(resultado.margem)} color="#4E7A5C" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Kpi label="IRR (levered)" value={fmtIndicador(irr, fmtPct)} color="#4E7A5C" />
        <Kpi label="MOIC" value={fmtIndicador(moic, (v) => v.toFixed(2) + "x")} color="#4E7A5C" />
        <Kpi label="Lucro unlevered" value={fmtEUR(resultado.lucroUnlevered)} color="#4E7A5C" />
      </div>

      <SectionLabel>Áreas e programa</SectionLabel>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Kpi label="ABC Total" value={`${Math.round(r.abcTotal ?? 0)} m²`} color="#3E6E8E" />
        <Kpi
          label="Eficiência"
          value={r.eficiencia !== null ? fmtPct(r.eficiencia) : "—"}
          sub={`${r.resumoPrograma?.totalUnidades ?? 0} unidades`}
          color="#3E6E8E"
        />
        <Kpi label="Área vendável equivalente" value={`${Math.round(r.resumoPrograma?.areaVendavelEquivalenteTotal ?? 0)} m²`} color="#3E6E8E" />
      </div>

      <SectionLabel>Financiamento e exposição de capital</SectionLabel>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Kpi
          label="Peak cash exposure"
          value={fmtEUR(resultado.equity.peakCashExposure)}
          sub={resultado.equity.mesPico ? `Mês ${resultado.equity.mesPico}` : undefined}
          color="#C08A3E"
        />
        <Kpi
          label="Peak debt"
          value={fmtEUR(resultado.financiamento.peakDebt)}
          sub={resultado.financiamento.ltv !== null ? `LTV ${fmtPct(resultado.financiamento.ltv)}` : undefined}
          color="#C08A3E"
        />
        <Kpi
          label="Recuperação integral do capital"
          value={resultado.equity.dataRecuperacaoIntegral ?? "Não recupera no prazo do projeto"}
          color="#C08A3E"
        />
      </div>

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

      <SectionLabel>Cash flow mensal</SectionLabel>
      <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-8 overflow-x-auto">
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

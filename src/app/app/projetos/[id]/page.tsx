import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ProjectResults } from "@/lib/calc/viabilidade";

function fmtEUR(v: number) {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(v) + " €";
}
function fmtPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

export default async function ProjetoResultadosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projeto } = await supabase.from("projects").select("*").eq("id", id).single();
  if (!projeto) notFound();

  if (projeto.status !== "calculado" || !projeto.results || Object.keys(projeto.results).length === 0) {
    redirect(`/app/projetos/${id}/dados`);
  }

  const r = projeto.results as ProjectResults;

  const confiancaColor =
    r.nivelConfianca === "Alto" ? "#4E7A5C" : r.nivelConfianca === "Médio" ? "#B8863F" : "#A13D2E";

  // Waterfall: receita (positivo) -> custos (negativos) -> lucro (resultado)
  const waterfall = [
    { label: "VGV líquido", valor: r.vgvLiquido, tipo: "receita" as const },
    { label: "Terreno", valor: -r.custoTerreno, tipo: "custo" as const },
    { label: "Construção", valor: -r.custoConstrucao, tipo: "custo" as const },
    { label: "Custos indiretos", valor: -(r.custosAquisicao + r.softCosts + r.marketing + r.contingencia), tipo: "custo" as const },
    { label: "Financiamento (juros)", valor: -r.juros, tipo: "custo" as const },
    { label: "Lucro líquido", valor: r.lucroLiquido, tipo: "resultado" as const },
  ];
  const maxAbs = Math.max(...waterfall.map((w) => Math.abs(w.valor)));

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {projeto.is_demo && (
        <div className="bg-[#B96343]/10 border border-[#B96343]/30 rounded-lg px-4 py-2.5 mb-6 text-sm text-[#B96343] font-medium">
          Projeto demonstrativo — dados ilustrativos, não correspondem a um ativo real.
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#142B3A]">{projeto.nome}</h1>
          <p className="text-sm text-[#59636A] mt-1">
            {projeto.localizacao || "Sem localização"} · {projeto.tipo_projeto}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/app/projetos/${id}/dados`}
            className="px-4 py-2.5 rounded-lg border border-[#E3DACB] text-[#142B3A] text-sm font-semibold"
          >
            Editar premissas
          </Link>
        </div>
      </div>

      {/* 1. Recomendação, confiança e estado */}
      <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Recomendação</div>
          <div className="text-lg font-bold text-[#142B3A]">
            {r.lucroLiquido > 0 ? "Avançar com condições" : "Não avançar sem rever premissas"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Nível de confiança</div>
          <div className="text-lg font-bold" style={{ color: confiancaColor }}>
            {r.nivelConfianca}
          </div>
        </div>
      </div>

      {/* 2. Receita, investimento, lucro, margem, TIR, equity multiple */}
      <SectionLabel>Indicadores de retorno</SectionLabel>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <Kpi label="VGV (receita)" value={fmtEUR(r.vgvBruto)} color="#3E6E8E" />
        <Kpi label="Investimento (CAPEX)" value={fmtEUR(r.capexTotal)} color="#B96343" />
        <Kpi label="Lucro líquido" value={fmtEUR(r.lucroLiquido)} color="#4E7A5C" />
        <Kpi label="Margem" value={fmtPct(r.margem)} color="#4E7A5C" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Kpi label="TIR" value={fmtPct(r.tir)} color="#4E7A5C" />
        <Kpi label="Equity multiple" value={r.equityMultiple.toFixed(2) + "x"} color="#4E7A5C" />
        <Kpi label="ROI" value={fmtPct(r.roi)} color="#4E7A5C" />
      </div>

      {/* 3. Preço de aquisição, venda/m², custo/m² */}
      <SectionLabel>Preços de referência</SectionLabel>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Kpi
          label="Custo do terreno"
          value={fmtEUR(r.custoTerreno)}
          sub={`${fmtPct(r.terrenoSobreVgv)} do VGV`}
          color="#B96343"
        />
        <Kpi label="Área de venda total" value={`${r.areaVendaTotal.toFixed(0)} m²`} sub={`${r.unidadesTotal} unidades`} color="#3E6E8E" />
        <Kpi label="Custo de construção" value={fmtEUR(r.custoConstrucao)} color="#B96343" />
      </div>

      {/* 4. Cronograma e pico de capital */}
      <SectionLabel>Calendário e exposição de capital</SectionLabel>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Kpi label="Pico de capital investido" value={fmtEUR(Math.abs(r.picoCapital))} sub={`Mês ${r.mesPico}`} color="#C08A3E" />
        <Kpi label="Payback" value={r.mesPayback ? `Mês ${r.mesPayback}` : "Não recupera no prazo"} color="#C08A3E" />
        <Kpi label="Equity investido" value={fmtEUR(r.equity)} color="#B96343" />
      </div>

      {/* 5. Decomposição do resultado (waterfall) */}
      <SectionLabel>Decomposição do resultado</SectionLabel>
      <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-8">
        <div className="flex items-end gap-3 h-48">
          {waterfall.map((w) => {
            const h = Math.max(4, (Math.abs(w.valor) / maxAbs) * 160);
            const color = w.tipo === "receita" ? "#3E6E8E" : w.tipo === "resultado" ? "#4E7A5C" : "#B96343";
            return (
              <div key={w.label} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="text-xs font-semibold text-[#142B3A] mb-1">{fmtEUR(w.valor)}</div>
                <div style={{ height: h, background: color }} className="w-full rounded-t" />
                <div className="text-[0.68rem] text-[#59636A] mt-2 text-center">{w.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Riscos e próximos passos */}
      <SectionLabel>Riscos e próximos passos</SectionLabel>
      <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-8">
        <ul className="space-y-2 text-sm">
          {r.nivelConfianca !== "Alto" && (
            <li className="flex items-start gap-2">
              <span className="text-[#A13D2E] font-bold">⚠</span>
              <span className="text-[#59636A]">
                Nível de confiança {r.nivelConfianca.toLowerCase()} — há dados essenciais estimados, não confirmados.
              </span>
            </li>
          )}
          {r.mesPayback === null && (
            <li className="flex items-start gap-2">
              <span className="text-[#A13D2E] font-bold">⚠</span>
              <span className="text-[#59636A]">A receita está concentrada perto da entrega — o payback só ocorre no final do projeto.</span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="text-[#C08A3E] font-bold">–</span>
            <span className="text-[#59636A]">Validar o enquadramento urbanístico e o potencial construtivo assumido junto da Câmara.</span>
          </li>
        </ul>
      </div>

      <details className="bg-white border border-[#E3DACB] rounded-xl p-6">
        <summary className="cursor-pointer text-sm font-semibold text-[#142B3A]">Ver premissas e cálculos</summary>
        <pre className="text-xs text-[#59636A] mt-4 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(projeto.inputs, null, 2)}
        </pre>
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

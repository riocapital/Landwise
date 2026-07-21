import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function VisaoGeralPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projetos } = await supabase
    .from("projects")
    .select("id, nome, localizacao, tipo_projeto, status, tir, margem, is_demo, updated_at")
    .order("updated_at", { ascending: false })
    .limit(6);

  const total = projetos?.length ?? 0;
  const calculados = projetos?.filter((p) => p.status === "calculado").length ?? 0;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#142B3A]">Visão geral</h1>
          <p className="text-sm text-[#59636A] mt-1">Os seus projetos, num relance.</p>
        </div>
        <Link
          href="/app/projetos/novo"
          className="px-5 py-2.5 rounded-lg bg-[#142B3A] text-white text-sm font-semibold hover:bg-[#0d1e29]"
        >
          + Novo projeto
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-[#E3DACB] rounded-lg p-5">
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Projetos</div>
          <div className="text-2xl font-bold text-[#142B3A]">{total}</div>
        </div>
        <div className="bg-white border border-[#E3DACB] rounded-lg p-5">
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Calculados</div>
          <div className="text-2xl font-bold text-[#142B3A]">{calculados}</div>
        </div>
        <div className="bg-white border border-[#E3DACB] rounded-lg p-5">
          <div className="text-xs uppercase tracking-wide text-[#59636A] mb-1">Por calcular</div>
          <div className="text-2xl font-bold text-[#142B3A]">{total - calculados}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-[#142B3A] uppercase tracking-wide">Projetos recentes</h2>
        <Link href="/app/projetos" className="text-sm text-[#B96343] hover:underline">
          Ver todos
        </Link>
      </div>

      {!projetos || projetos.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E3DACB] rounded-lg p-10 text-center">
          <p className="text-sm text-[#59636A] mb-4">Ainda não tem projetos.</p>
          <Link href="/app/projetos/novo" className="text-sm font-semibold text-[#B96343] hover:underline">
            Criar o primeiro projeto →
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-[#E3DACB] rounded-lg divide-y divide-[#E3DACB]">
          {projetos.map((p) => (
            <Link
              key={p.id}
              href={p.status === "calculado" ? `/app/projetos/${p.id}` : `/app/projetos/${p.id}/dados`}
              className="flex items-center justify-between px-5 py-4 hover:bg-[#F4F0E7]/50"
            >
              <div>
                <div className="text-sm font-semibold text-[#142B3A]">
                  {p.nome} {p.is_demo && <span className="ml-2 text-xs font-normal text-[#B96343]">demonstrativo</span>}
                </div>
                <div className="text-xs text-[#59636A] mt-0.5">
                  {p.localizacao || "Sem localização"} · {p.tipo_projeto}
                </div>
              </div>
              <div className="text-right">
                {p.status === "calculado" ? (
                  <div className="text-sm font-bold text-[#4E7A5C]">TIR {(p.tir * 100).toFixed(1)}%</div>
                ) : (
                  <div className="text-xs font-medium text-[#C08A3E]">Por calcular</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

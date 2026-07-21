"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Projeto = {
  id: string;
  nome: string;
  localizacao: string | null;
  tipo_projeto: string;
  status: string;
  tir: number | null;
  margem: number | null;
  is_demo: boolean;
  updated_at: string;
};

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-[#A8A29B]/15 text-[#59636A]" },
  calculado: { label: "Concluído", color: "bg-[#4E7A5C]/15 text-[#4E7A5C]" },
};

export default function ProjetosPage() {
  const supabase = createClient();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("id, nome, localizacao, tipo_projeto, status, tir, margem, is_demo, updated_at")
      .order("updated_at", { ascending: false });
    setProjetos(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // Padrão-padrão de "carregar dados ao montar": seguro, apesar do aviso do lint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function duplicar(p: Projeto) {
    const { data: userData } = await supabase.auth.getUser();
    const { data: original } = await supabase.from("projects").select("*").eq("id", p.id).single();
    if (!original || !userData.user) return;
    await supabase.from("projects").insert({
      user_id: userData.user.id,
      nome: `${original.nome} (cópia)`,
      tipo_projeto: original.tipo_projeto,
      localizacao: original.localizacao,
      status: original.status,
      is_demo: false,
      inputs: original.inputs,
      results: original.results,
      tir: original.tir,
      roi: original.roi,
      margem: original.margem,
    });
    carregar();
  }

  async function eliminar(p: Projeto) {
    if (!confirm(`Eliminar "${p.nome}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("projects").delete().eq("id", p.id);
    carregar();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#142B3A]">Projetos</h1>
        <Link
          href="/app/projetos/novo"
          className="px-5 py-2.5 rounded-lg bg-[#142B3A] text-white text-sm font-semibold hover:bg-[#0d1e29]"
        >
          + Novo projeto
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-[#59636A]">A carregar…</p>
      ) : projetos.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E3DACB] rounded-lg p-10 text-center">
          <p className="text-sm text-[#59636A] mb-4">Ainda não tem projetos.</p>
          <Link href="/app/projetos/novo" className="text-sm font-semibold text-[#B96343] hover:underline">
            Criar o primeiro projeto →
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-[#E3DACB] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E3DACB] text-left text-xs uppercase tracking-wide text-[#59636A]">
                <th className="px-5 py-3 font-semibold">Nome</th>
                <th className="px-5 py-3 font-semibold">Localização</th>
                <th className="px-5 py-3 font-semibold">Tipo</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">TIR</th>
                <th className="px-5 py-3 font-semibold">Margem</th>
                <th className="px-5 py-3 font-semibold">Atualizado</th>
                <th className="px-5 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {projetos.map((p) => {
                const estado = ESTADO_LABEL[p.status] ?? ESTADO_LABEL.rascunho;
                return (
                  <tr key={p.id} className="border-b border-[#E3DACB] last:border-0 hover:bg-[#F4F0E7]/40">
                    <td className="px-5 py-3.5 font-medium text-[#142B3A]">
                      <Link href={p.status === "calculado" ? `/app/projetos/${p.id}` : `/app/projetos/${p.id}/dados`}>
                        {p.nome}
                      </Link>
                      {p.is_demo && <span className="ml-2 text-xs font-normal text-[#B96343]">demonstrativo</span>}
                    </td>
                    <td className="px-5 py-3.5 text-[#59636A]">{p.localizacao || "—"}</td>
                    <td className="px-5 py-3.5 text-[#59636A]">{p.tipo_projeto}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${estado.color}`}>{estado.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-[#142B3A] font-semibold">
                      {p.tir != null ? `${(p.tir * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[#142B3A]">
                      {p.margem != null ? `${(p.margem * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[#59636A] text-xs">
                      {new Date(p.updated_at).toLocaleDateString("pt-PT")}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => duplicar(p)} className="text-xs text-[#59636A] hover:text-[#142B3A] mr-3">
                        Duplicar
                      </button>
                      <button onClick={() => eliminar(p)} className="text-xs text-[#A13D2E] hover:underline">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

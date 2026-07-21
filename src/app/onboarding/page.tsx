"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { criarPayloadProjetoDemo } from "@/lib/demo-project";
import { PrimaryButton } from "@/components/ui";

const TIPOS_EMPRESA = ["Mediação imobiliária", "Promoção imobiliária", "Consultoria", "Outro"];
const OBJETIVOS = [
  { id: "terreno", label: "Analisar um terreno" },
  { id: "predio", label: "Analisar um prédio aprovado" },
  { id: "remodelacao", label: "Analisar uma remodelação" },
  { id: "demo", label: "Explorar um projeto demonstrativo" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [empresa, setEmpresa] = useState("");
  const [funcao, setFuncao] = useState("");
  const [tipoEmpresa, setTipoEmpresa] = useState(TIPOS_EMPRESA[0]);
  const [ativosMes, setAtivosMes] = useState("1-5");
  const [regiao, setRegiao] = useState("Lisboa");
  const [objetivo, setObjetivo] = useState("terreno");

  async function finalizar(abrirDemo: boolean) {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const papel = tipoEmpresa === "Mediação imobiliária" ? "mediador" : tipoEmpresa === "Promoção imobiliária" ? "promotor" : "outro";
    await supabase.from("profiles").update({ empresa, papel }).eq("id", user.id);

    // Todos os utilizadores recebem o projeto demonstrativo, para explorarem sem depender de dados próprios
    const demoPayload = criarPayloadProjetoDemo(user.id);
    const { data: demoProject } = await supabase
      .from("projects")
      .insert(demoPayload)
      .select()
      .single();

    if (abrirDemo) {
      router.push(`/app/projetos/${demoProject?.id}`);
      return;
    }

    const tipoMap: Record<string, string> = {
      terreno: "Terreno para construir",
      predio: "Prédio aprovado",
      remodelacao: "Apartamento para remodelar",
    };
    const { data: novoProjeto } = await supabase
      .from("projects")
      .insert({ user_id: user.id, tipo_projeto: tipoMap[objetivo] ?? "Terreno para construir" })
      .select()
      .single();

    router.push(`/app/projetos/${novoProjeto?.id}/dados`);
  }

  return (
    <div className="min-h-screen bg-[#F4F0E7] flex items-center justify-center px-6">
      <div className="w-full max-w-lg bg-[#FCFBF8] border border-[#E3DACB] rounded-xl p-8 shadow-sm">
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-[#B96343]" : "bg-[#E3DACB]"}`} />
          ))}
        </div>

        {step === 1 && (
          <div>
            <h1 className="text-xl font-bold text-[#142B3A] mb-1">O seu perfil</h1>
            <p className="text-sm text-[#59636A] mb-6">Ajuda-nos a adaptar a plataforma à sua forma de trabalhar.</p>
            <label className="block text-sm font-medium text-[#59636A] mb-1.5">Nome da empresa</label>
            <input
              className="w-full mb-4 px-3.5 py-2.5 rounded-lg border border-[#E3DACB] text-sm"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
            />
            <label className="block text-sm font-medium text-[#59636A] mb-1.5">Função</label>
            <input
              className="w-full mb-4 px-3.5 py-2.5 rounded-lg border border-[#E3DACB] text-sm"
              value={funcao}
              onChange={(e) => setFuncao(e.target.value)}
              placeholder="Ex.: Diretor de investimento"
            />
            <label className="block text-sm font-medium text-[#59636A] mb-1.5">Tipo de empresa</label>
            <select
              className="w-full mb-4 px-3.5 py-2.5 rounded-lg border border-[#E3DACB] text-sm"
              value={tipoEmpresa}
              onChange={(e) => setTipoEmpresa(e.target.value)}
            >
              {TIPOS_EMPRESA.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <label className="block text-sm font-medium text-[#59636A] mb-1.5">Ativos analisados por mês</label>
            <select
              className="w-full mb-4 px-3.5 py-2.5 rounded-lg border border-[#E3DACB] text-sm"
              value={ativosMes}
              onChange={(e) => setAtivosMes(e.target.value)}
            >
              <option>1-5</option>
              <option>6-15</option>
              <option>16-30</option>
              <option>Mais de 30</option>
            </select>
            <label className="block text-sm font-medium text-[#59636A] mb-1.5">Região principal de atuação</label>
            <select
              className="w-full mb-6 px-3.5 py-2.5 rounded-lg border border-[#E3DACB] text-sm"
              value={regiao}
              onChange={(e) => setRegiao(e.target.value)}
            >
              <option>Lisboa</option>
              <option>Porto</option>
              <option>Outra</option>
            </select>
            <PrimaryButton onClick={() => setStep(2)}>Continuar</PrimaryButton>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="text-xl font-bold text-[#142B3A] mb-1">O que quer fazer primeiro?</h1>
            <p className="text-sm text-[#59636A] mb-6">Pode sempre criar mais projetos depois.</p>
            <div className="space-y-2 mb-6">
              {OBJETIVOS.map((o) => (
                <label
                  key={o.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer text-sm ${
                    objetivo === o.id ? "border-[#B96343] bg-[#B96343]/5" : "border-[#E3DACB]"
                  }`}
                >
                  <input
                    type="radio"
                    name="objetivo"
                    checked={objetivo === o.id}
                    onChange={() => setObjetivo(o.id)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-lg border border-[#E3DACB] text-sm font-medium">
                Voltar
              </button>
              <div className="flex-1">
                <PrimaryButton onClick={() => setStep(3)}>Continuar</PrimaryButton>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 className="text-xl font-bold text-[#142B3A] mb-1">Tudo pronto</h1>
            <p className="text-sm text-[#59636A] mb-6">
              {objetivo === "demo"
                ? "Vamos abrir o projeto demonstrativo para explorar a plataforma."
                : "Vamos criar o seu primeiro projeto — pode preencher os dados a seguir."}
            </p>
            <div className="space-y-3">
              <PrimaryButton disabled={saving} onClick={() => finalizar(objetivo === "demo")}>
                {saving ? "A preparar…" : objetivo === "demo" ? "Abrir projeto demonstrativo" : "Criar o meu primeiro projeto"}
              </PrimaryButton>
              {objetivo !== "demo" && (
                <button
                  disabled={saving}
                  onClick={() => finalizar(true)}
                  className="w-full py-2.5 rounded-lg border border-[#E3DACB] text-sm font-medium text-[#142B3A]"
                >
                  Prefiro só explorar o projeto demonstrativo
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

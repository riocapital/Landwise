"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_INPUTS,
  calcularViabilidade,
  type ProjectInputs,
  type Tipologia,
  type LinhaVendas,
} from "@/lib/calc/viabilidade";

const STEPS = ["Identificação", "Programa e vendas", "Custos e financiamento", "Calendário", "Revisão"];

export default function WizardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [nome, setNome] = useState("Novo projeto");
  const [tipoProjeto, setTipoProjeto] = useState("Terreno para construir");
  const [inputs, setInputs] = useState<ProjectInputs>(DEFAULT_INPUTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [calculando, setCalculando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").eq("id", id).single();
    if (data) {
      setNome(data.nome);
      setTipoProjeto(data.tipo_projeto);
      if (data.inputs && Object.keys(data.inputs).length > 0) {
        setInputs({ ...DEFAULT_INPUTS, ...data.inputs });
      }
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    // Padrão-padrão de "carregar dados ao montar": seguro, apesar do aviso do lint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const guardar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setSaving(true);
      await supabase
        .from("projects")
        .update({ nome, tipo_projeto: tipoProjeto, localizacao: inputs.localizacao, inputs })
        .eq("id", id);
      setSavedAt(new Date());
      if (!silencioso) setSaving(false);
    },
    [id, nome, tipoProjeto, inputs, supabase]
  );

  // Autosave: 1.5s depois da última alteração
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => guardar(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, tipoProjeto, inputs, loading]);

  async function avancar() {
    await guardar();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function calcular() {
    setCalculando(true);
    const results = calcularViabilidade(inputs);
    await supabase
      .from("projects")
      .update({
        nome,
        tipo_projeto: tipoProjeto,
        localizacao: inputs.localizacao,
        inputs,
        results,
        status: "calculado",
        tir: results.tir,
        roi: results.roi,
        margem: results.margem,
      })
      .eq("id", id);
    router.push(`/app/projetos/${id}`);
  }

  function updateInput<K extends keyof ProjectInputs>(key: K, value: ProjectInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <div className="p-8 text-sm text-[#8FA6AF]">A carregar…</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-1">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="text-lg font-bold text-[#142B3A] bg-transparent border-b border-transparent hover:border-[#E3DACB] focus:border-[#B96343] focus:outline-none"
        />
        <span className="text-xs text-[#59636A]">
          {saving ? "A guardar…" : savedAt ? `Guardado às ${savedAt.toLocaleTimeString("pt-PT")}` : ""}
        </span>
      </div>
      <p className="text-sm text-[#59636A] mb-6">Preencha o que souber. O que não souber, o motor assume um valor de referência — sempre editável.</p>

      <div className="flex border-b border-[#E3DACB] mb-7">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`text-sm font-semibold pb-3 mr-7 border-b-2 ${
              i === step ? "text-[#B96343] border-[#B96343]" : "text-[#59636A] border-transparent"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <StepIdentificacao
          nome={nome}
          setNome={setNome}
          tipoProjeto={tipoProjeto}
          setTipoProjeto={setTipoProjeto}
          inputs={inputs}
          updateInput={updateInput}
        />
      )}
      {step === 1 && <StepPrograma inputs={inputs} updateInput={updateInput} />}
      {step === 2 && <StepCustosFinanciamento inputs={inputs} updateInput={updateInput} />}
      {step === 3 && <StepCalendario inputs={inputs} updateInput={updateInput} />}
      {step === 4 && <StepRevisao inputs={inputs} calculando={calculando} onCalcular={calcular} />}

      <div className="flex mt-8">
        {step > 0 && (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="px-6 py-2.5 rounded-lg border border-[#E3DACB] text-[#142B3A] text-sm font-semibold mr-3"
          >
            Voltar
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button onClick={avancar} className="px-6 py-2.5 rounded-lg bg-[#142B3A] text-white text-sm font-semibold">
            Guardar e continuar
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Etapa 1 — Identificação
// ============================================================
function StepIdentificacao({
  tipoProjeto,
  setTipoProjeto,
  inputs,
  updateInput,
}: {
  nome: string;
  setNome: (v: string) => void;
  tipoProjeto: string;
  setTipoProjeto: (v: string) => void;
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
}) {
  return (
    <Card title="Identificação do ativo">
      <Row>
        <Field label="Tipo de projeto">
          <select className="input-dark" value={tipoProjeto} onChange={(e) => setTipoProjeto(e.target.value)}>
            <option>Terreno para construir</option>
            <option>Prédio aprovado</option>
            <option>Apartamento para remodelar</option>
          </select>
        </Field>
        <Field label="Localização">
          <input
            className="input-dark"
            value={inputs.localizacao}
            onChange={(e) => updateInput("localizacao", e.target.value)}
            placeholder="Ex.: Benfica, Lisboa"
          />
        </Field>
      </Row>
      <Row>
        <Field label="Área do lote (m²)">
          <input
            type="number"
            className="input-dark"
            value={inputs.areaLote ?? ""}
            onChange={(e) => updateInput("areaLote", e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label="Custo de aquisição do terreno (€)">
          <input
            type="number"
            className="input-dark"
            value={inputs.custoTerreno || ""}
            onChange={(e) => updateInput("custoTerreno", Number(e.target.value) || 0)}
          />
        </Field>
      </Row>
    </Card>
  );
}

// ============================================================
// Etapa 2 — Programa e vendas (tipologias + mapa de vendas)
// ============================================================
function StepPrograma({
  inputs,
  updateInput,
}: {
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
}) {
  function updateTipologia(i: number, patch: Partial<Tipologia>) {
    const novas = [...inputs.tipologias];
    novas[i] = { ...novas[i], ...patch };
    updateInput("tipologias", novas);
  }
  function addTipologia() {
    updateInput("tipologias", [
      ...inputs.tipologias,
      { nome: `T${inputs.tipologias.length}`, gpa: 80, varanda: 10, terraco: 0, precoBaseM2: 3800 },
    ]);
  }
  function removeTipologia(i: number) {
    updateInput(
      "tipologias",
      inputs.tipologias.filter((_, idx) => idx !== i)
    );
  }

  function updateLinha(i: number, patch: Partial<LinhaVendas>) {
    const novas = [...inputs.mapaVendas];
    novas[i] = { ...novas[i], ...patch };
    updateInput("mapaVendas", novas);
  }
  function addLinha() {
    updateInput("mapaVendas", [
      ...inputs.mapaVendas,
      { bloco: "Bloco A", piso: 0, tipologia: inputs.tipologias[0]?.nome ?? "", quantidade: 1, premioPiso: 0 },
    ]);
  }
  function removeLinha(i: number) {
    updateInput(
      "mapaVendas",
      inputs.mapaVendas.filter((_, idx) => idx !== i)
    );
  }

  const totalUnidades = inputs.mapaVendas.reduce((s, l) => s + l.quantidade, 0);

  return (
    <>
      <Card title="Tipologias" subtitle="Defina cada tipologia uma vez — o mapa de vendas usa-as automaticamente.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[#59636A] uppercase text-left">
              <th className="pb-2">Tipologia</th>
              <th className="pb-2">GPA (m²)</th>
              <th className="pb-2">Varanda (m²)</th>
              <th className="pb-2">Terraço (m²)</th>
              <th className="pb-2">Preço base (€/m²)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inputs.tipologias.map((t, i) => (
              <tr key={i}>
                <td className="pr-2 py-1">
                  <input className="input-dark" value={t.nome} onChange={(e) => updateTipologia(i, { nome: e.target.value })} />
                </td>
                <td className="pr-2 py-1">
                  <input
                    type="number"
                    className="input-dark"
                    value={t.gpa}
                    onChange={(e) => updateTipologia(i, { gpa: Number(e.target.value) })}
                  />
                </td>
                <td className="pr-2 py-1">
                  <input
                    type="number"
                    className="input-dark"
                    value={t.varanda}
                    onChange={(e) => updateTipologia(i, { varanda: Number(e.target.value) })}
                  />
                </td>
                <td className="pr-2 py-1">
                  <input
                    type="number"
                    className="input-dark"
                    value={t.terraco}
                    onChange={(e) => updateTipologia(i, { terraco: Number(e.target.value) })}
                  />
                </td>
                <td className="pr-2 py-1">
                  <input
                    type="number"
                    className="input-dark"
                    value={t.precoBaseM2}
                    onChange={(e) => updateTipologia(i, { precoBaseM2: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <button onClick={() => removeTipologia(i)} className="text-[#A13D2E] text-xs">
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addTipologia} className="text-[#B96343] text-sm font-semibold mt-3">
          + Adicionar tipologia
        </button>
      </Card>

      <Card title="Mapa de vendas" subtitle="Cada linha é um grupo de unidades iguais — bloco, piso, tipologia e quantidade.">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[#59636A] uppercase text-left">
              <th className="pb-2">Bloco</th>
              <th className="pb-2">Piso</th>
              <th className="pb-2">Tipologia</th>
              <th className="pb-2">Quantidade</th>
              <th className="pb-2">Prémio piso (%)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inputs.mapaVendas.map((l, i) => (
              <tr key={i}>
                <td className="pr-2 py-1">
                  <input className="input-dark" value={l.bloco} onChange={(e) => updateLinha(i, { bloco: e.target.value })} />
                </td>
                <td className="pr-2 py-1">
                  <input
                    type="number"
                    className="input-dark"
                    value={l.piso}
                    onChange={(e) => updateLinha(i, { piso: Number(e.target.value) })}
                  />
                </td>
                <td className="pr-2 py-1">
                  <select className="input-dark" value={l.tipologia} onChange={(e) => updateLinha(i, { tipologia: e.target.value })}>
                    {inputs.tipologias.map((t) => (
                      <option key={t.nome} value={t.nome}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="pr-2 py-1">
                  <input
                    type="number"
                    className="input-dark"
                    value={l.quantidade}
                    onChange={(e) => updateLinha(i, { quantidade: Number(e.target.value) })}
                  />
                </td>
                <td className="pr-2 py-1">
                  <input
                    type="number"
                    className="input-dark"
                    value={l.premioPiso * 100}
                    onChange={(e) => updateLinha(i, { premioPiso: Number(e.target.value) / 100 })}
                  />
                </td>
                <td>
                  <button onClick={() => removeLinha(i)} className="text-[#A13D2E] text-xs">
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addLinha} className="text-[#B96343] text-sm font-semibold mt-3">
          + Adicionar grupo de unidades
        </button>
        <p className="text-xs text-[#59636A] mt-4">Total de unidades: {totalUnidades}</p>
      </Card>
    </>
  );
}

// ============================================================
// Etapa 3 — Custos e financiamento
// ============================================================
function StepCustosFinanciamento({
  inputs,
  updateInput,
}: {
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
}) {
  return (
    <>
      <Card title="Custos">
        <Row>
          <Field label="Custo de construção (€/m²) — fallback se o mapa de vendas não bastar">
            <input
              type="number"
              className="input-dark"
              value={inputs.custoConstrucaoM2 ?? ""}
              onChange={(e) => updateInput("custoConstrucaoM2", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="IVA da construção">
            <select
              className="input-dark"
              value={inputs.ivaConstrucao}
              onChange={(e) => updateInput("ivaConstrucao", Number(e.target.value) as 0.06 | 0.23)}
            >
              <option value={0.23}>23%</option>
              <option value={0.06}>6% — reabilitação urbana</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Custos de aquisição (% sobre terreno — IMT, IS, notário)">
            <PercentInput value={inputs.custosAquisicaoPct} onChange={(v) => updateInput("custosAquisicaoPct", v)} />
          </Field>
          <Field label="Soft costs (% sobre construção)">
            <PercentInput value={inputs.softCostsPct} onChange={(v) => updateInput("softCostsPct", v)} />
          </Field>
        </Row>
        <Row>
          <Field label="Contingência (% sobre construção)">
            <PercentInput value={inputs.contingenciaPct} onChange={(v) => updateInput("contingenciaPct", v)} />
          </Field>
          <Field label="Marketing (% sobre CAPEX de obra)">
            <PercentInput value={inputs.marketingPct} onChange={(v) => updateInput("marketingPct", v)} />
          </Field>
        </Row>
      </Card>

      <Card title="Estrutura de capital e financiamento">
        <Row>
          <Field label="% Capital próprio">
            <PercentInput value={inputs.pctCapitalProprio} onChange={(v) => updateInput("pctCapitalProprio", v)} />
          </Field>
          <Field label="% Dívida bancária">
            <PercentInput value={inputs.pctDivida} onChange={(v) => updateInput("pctDivida", v)} />
          </Field>
          <Field label="% Capital de investidores">
            <PercentInput value={inputs.pctInvestidores} onChange={(v) => updateInput("pctInvestidores", v)} />
          </Field>
        </Row>
        <Row>
          <Field label="Recorre a banco?">
            <select
              className="input-dark"
              value={inputs.recorreBanco ? "sim" : "nao"}
              onChange={(e) => updateInput("recorreBanco", e.target.value === "sim")}
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </Field>
          <Field label="LTV (% financiado sobre CAPEX)">
            <PercentInput value={inputs.ltv} onChange={(v) => updateInput("ltv", v)} />
          </Field>
          <Field label="Taxa de juro anual (%)">
            <PercentInput value={inputs.taxaJuroAnual} onChange={(v) => updateInput("taxaJuroAnual", v)} />
          </Field>
        </Row>
      </Card>
    </>
  );
}

// ============================================================
// Etapa 4 — Calendário e comercialização
// ============================================================
function StepCalendario({
  inputs,
  updateInput,
}: {
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
}) {
  return (
    <Card title="Calendário e comercialização">
      <Row>
        <Field label="Duração total do projeto (meses)">
          <input
            type="number"
            className="input-dark"
            value={inputs.duracaoTotalMeses}
            onChange={(e) => updateInput("duracaoTotalMeses", Number(e.target.value))}
          />
        </Field>
        <Field label="Duração da obra (meses)">
          <input
            type="number"
            className="input-dark"
            value={inputs.duracaoObraMeses}
            onChange={(e) => updateInput("duracaoObraMeses", Number(e.target.value))}
          />
        </Field>
        <Field label="Mês de início da obra">
          <input
            type="number"
            className="input-dark"
            value={inputs.mesInicioObra}
            onChange={(e) => updateInput("mesInicioObra", Number(e.target.value))}
          />
        </Field>
      </Row>
      <Row>
        <Field label="Sinal de venda (%)">
          <PercentInput value={inputs.sinalVendaPct} onChange={(v) => updateInput("sinalVendaPct", v)} />
        </Field>
        <Field label="Comissão de mediador (% s/IVA)">
          <PercentInput value={inputs.comissaoMediadorPct} onChange={(v) => updateInput("comissaoMediadorPct", v)} />
        </Field>
      </Row>
    </Card>
  );
}

// ============================================================
// Etapa 5 — Revisão
// ============================================================
function StepRevisao({
  inputs,
  calculando,
  onCalcular,
}: {
  inputs: ProjectInputs;
  calculando: boolean;
  onCalcular: () => void;
}) {
  const faltam: string[] = [];
  if (!inputs.localizacao) faltam.push("Localização");
  if (!inputs.custoTerreno) faltam.push("Custo de aquisição do terreno");
  if (inputs.mapaVendas.length === 0) faltam.push("Mapa de vendas (nenhuma unidade definida)");

  return (
    <Card title="Revisão antes de calcular">
      {faltam.length > 0 ? (
        <div className="bg-[#D6A65D]/10 border border-[#D6A65D]/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-[#B8863F] font-semibold mb-1">Dados em falta — o cálculo prossegue, mas o nível de confiança será mais baixo:</p>
          <ul className="text-sm text-[#59636A] list-disc list-inside">
            {faltam.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-[#4E7A5C]/10 border border-[#4E7A5C]/30 rounded-lg px-4 py-3 mb-4">
          <p className="text-sm text-[#4E7A5C] font-semibold">Todos os dados essenciais foram preenchidos.</p>
        </div>
      )}
      <button
        onClick={onCalcular}
        disabled={calculando}
        className="px-6 py-3 rounded-lg bg-[#142B3A] text-white text-sm font-bold disabled:opacity-60"
      >
        {calculando ? "A calcular…" : "Calcular viabilidade"}
      </button>
    </Card>
  );
}

// ============================================================
// Auxiliares visuais
// ============================================================
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E3DACB] rounded-xl p-6 mb-5">
      <h3 className="text-[#142B3A] font-bold text-[1.02rem] mb-1">{title}</h3>
      {subtitle && <p className="text-[#59636A] text-sm mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-4 mb-4">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-xs text-[#59636A] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      className="input-dark"
      value={Math.round(value * 1000) / 10}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
    />
  );
}

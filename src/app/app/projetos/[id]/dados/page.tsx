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
import { calcResumoPrograma, calcGcaProgramado, calcEficiencia, calcDivergenciaAbp, type Typology } from "@/lib/calc/areas";
import {
  listarTipologiasProjeto,
  criarTipologia,
  atualizarTipologia,
  apagarTipologia,
  guardarPrecoSugerido,
} from "@/lib/supabase/project-typologies";
import type { SugestaoPreco, SujeitoComparacao } from "@/lib/calc/comparaveis";
import { resolverCustos, agregarCustos, type LinhaCusto, type GrupoCusto, type ContextoCusto } from "@/lib/calc/custos";
import { listarCustosProjeto, criarCusto, atualizarCusto, apagarCusto } from "@/lib/supabase/project-costs";
import { calcDataFinal } from "@/lib/calc/calendario";

const STEPS = ["Identificação", "Programa e vendas", "Aquisição e custos", "Financiamento e mais", "Calendário", "Revisão"];

// --- Fase 2: localização e áreas estruturadas (colunas novas em `projects`) ---
type IdentificacaoEstruturada = {
  codigoPostal: string;
  rua: string;
  localidade: string;
  freguesia: string;
  concelho: string;
  distrito: string;
  latitude: number | null;
  longitude: number | null;
  localizacaoOrigem: "manual" | "codigo_postal" | "geocodificacao";
  abcAcimaSolo: number | null;
  abcAbaixoSolo: number | null;
  areaDependenteEstimada: number | null;
  abpEstimada: number | null;
  temGaragem: boolean;
  temElevador: boolean;
  temJardimExterior: boolean;
  necessitaDemolicao: boolean;
  imovelOcupado: boolean;
  temLicenciamentoAprovado: boolean;
};

const IDENTIFICACAO_VAZIA: IdentificacaoEstruturada = {
  codigoPostal: "",
  rua: "",
  localidade: "",
  freguesia: "",
  concelho: "",
  distrito: "",
  latitude: null,
  longitude: null,
  localizacaoOrigem: "manual",
  abcAcimaSolo: null,
  abcAbaixoSolo: null,
  areaDependenteEstimada: null,
  abpEstimada: null,
  temGaragem: false,
  temElevador: false,
  temJardimExterior: false,
  necessitaDemolicao: false,
  imovelOcupado: false,
  temLicenciamentoAprovado: false,
};

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

  // Fase 2: localização/áreas estruturadas + tipologias no motor novo (areas.ts)
  const [identificacao, setIdentificacao] = useState<IdentificacaoEstruturada>(IDENTIFICACAO_VAZIA);
  const [tipologiasNovas, setTipologiasNovas] = useState<Typology[]>([]);
  const [custosNovos, setCustosNovos] = useState<LinhaCusto[]>([]);
  const [aLoadearCp, setALoadearCp] = useState(false);
  const [opcoesCp, setOpcoesCp] = useState<
    { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }[]
  >([]);
  const [sugestoes, setSugestoes] = useState<
    Record<string, { loading: boolean; resultado?: SugestaoPreco; erro?: boolean }>
  >({});

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").eq("id", id).single();
    if (data) {
      setNome(data.nome);
      setTipoProjeto(data.tipo_projeto);
      if (data.inputs && Object.keys(data.inputs).length > 0) {
        setInputs({ ...DEFAULT_INPUTS, ...data.inputs });
      }
      setIdentificacao({
        codigoPostal: data.codigo_postal ?? "",
        rua: data.rua ?? "",
        localidade: data.localidade ?? "",
        freguesia: data.freguesia ?? "",
        concelho: data.concelho ?? "",
        distrito: data.distrito ?? "",
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        localizacaoOrigem: data.localizacao_origem ?? "manual",
        abcAcimaSolo: data.abc_acima_solo ?? null,
        abcAbaixoSolo: data.abc_abaixo_solo ?? null,
        areaDependenteEstimada: data.area_dependente_estimada ?? null,
        abpEstimada: data.abp_estimada ?? null,
        temGaragem: data.tem_garagem ?? false,
        temElevador: data.tem_elevador ?? false,
        temJardimExterior: data.tem_jardim_exterior ?? false,
        necessitaDemolicao: data.necessita_demolicao ?? false,
        imovelOcupado: data.imovel_ocupado ?? false,
        temLicenciamentoAprovado: data.tem_licenciamento_aprovado ?? false,
      });
    }
    const tipologias = await listarTipologiasProjeto(supabase, id);
    setTipologiasNovas(tipologias);
    const custos = await listarCustosProjeto(supabase, id);
    setCustosNovos(custos);
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
      // Localização derivada, para não quebrar ecrãs que ainda leem o texto
      // livre antigo (dashboard, pré-análise) enquanto a fonte da verdade
      // passa a ser os campos estruturados.
      const localizacaoDerivada =
        identificacao.freguesia || identificacao.concelho
          ? [identificacao.freguesia, identificacao.concelho].filter(Boolean).join(", ")
          : inputs.localizacao;

      await supabase
        .from("projects")
        .update({
          nome,
          tipo_projeto: tipoProjeto,
          localizacao: localizacaoDerivada,
          inputs: { ...inputs, localizacao: localizacaoDerivada },
          codigo_postal: identificacao.codigoPostal || null,
          rua: identificacao.rua || null,
          localidade: identificacao.localidade || null,
          freguesia: identificacao.freguesia || null,
          concelho: identificacao.concelho || null,
          distrito: identificacao.distrito || null,
          latitude: identificacao.latitude,
          longitude: identificacao.longitude,
          localizacao_origem: identificacao.localizacaoOrigem,
          area_lote: inputs.areaLote,
          abc_acima_solo: identificacao.abcAcimaSolo,
          abc_abaixo_solo: identificacao.abcAbaixoSolo,
          area_dependente_estimada: identificacao.areaDependenteEstimada,
          abp_estimada: identificacao.abpEstimada,
          tem_garagem: identificacao.temGaragem,
          tem_elevador: identificacao.temElevador,
          tem_jardim_exterior: identificacao.temJardimExterior,
          necessita_demolicao: identificacao.necessitaDemolicao,
          imovel_ocupado: identificacao.imovelOcupado,
          tem_licenciamento_aprovado: identificacao.temLicenciamentoAprovado,
        })
        .eq("id", id);

      // Tipologias do motor novo: cada uma já tem id real na BD (criada ao
      // clicar "+ Adicionar"), por isso aqui é sempre update, nunca insert.
      await Promise.all(tipologiasNovas.map((t) => atualizarTipologia(supabase, t.id, t)));
      await Promise.all(custosNovos.map((c) => atualizarCusto(supabase, c.id, c)));

      setSavedAt(new Date());
      if (!silencioso) setSaving(false);
    },
    [id, nome, tipoProjeto, inputs, identificacao, tipologiasNovas, custosNovos, supabase]
  );

  // Autosave: 1.5s depois da última alteração
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => guardar(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, tipoProjeto, inputs, identificacao, tipologiasNovas, custosNovos, loading]);

  function updateIdentificacao<K extends keyof IdentificacaoEstruturada>(key: K, value: IdentificacaoEstruturada[K]) {
    setIdentificacao((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCodigoPostalBlur() {
    const cp = identificacao.codigoPostal.trim();
    if (!/^\d{4}-\d{3}$/.test(cp)) return;
    setALoadearCp(true);
    setOpcoesCp([]);
    try {
      const resp = await fetch(`/api/localizacao/codigo-postal?cp=${encodeURIComponent(cp)}`);
      const data = await resp.json();
      if (data.encontrado && data.opcoes?.length > 0) {
        if (data.opcoes.length === 1) {
          aplicarOpcaoCp(data.opcoes[0]);
        } else {
          setOpcoesCp(data.opcoes);
        }
      }
      // Se não encontrar, não bloqueia nada — os campos continuam livres para preenchimento manual.
    } finally {
      setALoadearCp(false);
    }
  }

  function aplicarOpcaoCp(opcao: {
    rua: string | null;
    localidade: string | null;
    freguesia: string | null;
    concelho: string | null;
    distrito: string | null;
    latitude: number | null;
    longitude: number | null;
  }) {
    setIdentificacao((prev) => ({
      ...prev,
      rua: opcao.rua ?? prev.rua,
      localidade: opcao.localidade ?? prev.localidade,
      freguesia: opcao.freguesia ?? prev.freguesia,
      concelho: opcao.concelho ?? prev.concelho,
      distrito: opcao.distrito ?? prev.distrito,
      latitude: opcao.latitude ?? prev.latitude,
      longitude: opcao.longitude ?? prev.longitude,
      localizacaoOrigem: "codigo_postal",
    }));
    setOpcoesCp([]);
  }

  async function adicionarTipologiaNova() {
    const nova = await criarTipologia(supabase, id, tipologiasNovas.length);
    if (nova) setTipologiasNovas((prev) => [...prev, nova]);
  }

  function atualizarTipologiaNovaLocal(tipId: string, patch: Partial<Typology>) {
    setTipologiasNovas((prev) => prev.map((t) => (t.id === tipId ? { ...t, ...patch } : t)));
  }

  async function removerTipologiaNova(tipId: string) {
    await apagarTipologia(supabase, tipId);
    setTipologiasNovas((prev) => prev.filter((t) => t.id !== tipId));
  }

  async function adicionarCustoNovo(grupo: GrupoCusto, nome: string) {
    const novo = await criarCusto(supabase, id, grupo, nome, custosNovos.length);
    if (novo) setCustosNovos((prev) => [...prev, novo]);
  }

  function atualizarCustoNovoLocal(custoId: string, patch: Partial<LinhaCusto>) {
    setCustosNovos((prev) => prev.map((c) => (c.id === custoId ? { ...c, ...patch } : c)));
  }

  async function removerCustoNovo(custoId: string) {
    await apagarCusto(supabase, custoId);
    setCustosNovos((prev) => prev.filter((c) => c.id !== custoId));
  }

  async function pedirSugestaoLandwise(tip: Typology) {
    setSugestoes((prev) => ({ ...prev, [tip.id]: { loading: true } }));
    try {
      const sujeito: SujeitoComparacao = {
        zone: null,
        parish: identificacao.freguesia || null,
        municipality: identificacao.concelho || null,
        propertyType: "Apartamento",
        typology: tip.nome,
        condition: null,
        isNewConstruction: null,
        areaReferencia: tip.abpUnidade,
      };
      const resp = await fetch("/api/comparaveis/sugestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sujeito),
      });
      const resultado = await resp.json();
      if (resp.ok) {
        setSugestoes((prev) => ({ ...prev, [tip.id]: { loading: false, resultado } }));
        if (resultado.precoSugeridoM2) {
          await guardarPrecoSugerido(supabase, tip.id, resultado.precoSugeridoM2);
        }
      } else {
        setSugestoes((prev) => ({ ...prev, [tip.id]: { loading: false, erro: true } }));
      }
    } catch {
      setSugestoes((prev) => ({ ...prev, [tip.id]: { loading: false, erro: true } }));
    }
  }

  function aplicarSugestao(tipId: string, precoM2: number) {
    atualizarTipologiaNovaLocal(tipId, { precoBaseM2: precoM2 });
  }

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
          identificacao={identificacao}
          updateIdentificacao={updateIdentificacao}
          aLoadearCp={aLoadearCp}
          opcoesCp={opcoesCp}
          onCodigoPostalBlur={handleCodigoPostalBlur}
          onEscolherOpcaoCp={aplicarOpcaoCp}
          tipologiasNovas={tipologiasNovas}
        />
      )}
      {step === 1 && (
        <StepPrograma
          inputs={inputs}
          updateInput={updateInput}
          tipologiasNovas={tipologiasNovas}
          identificacao={identificacao}
          onAdicionarTipologiaNova={adicionarTipologiaNova}
          onAtualizarTipologiaNova={atualizarTipologiaNovaLocal}
          onRemoverTipologiaNova={removerTipologiaNova}
          sugestoes={sugestoes}
          onPedirSugestao={pedirSugestaoLandwise}
          onAplicarSugestao={aplicarSugestao}
        />
      )}
      {step === 2 && (
        <StepAquisicaoCustos
          custosNovos={custosNovos}
          identificacao={identificacao}
          tipologiasNovas={tipologiasNovas}
          inputs={inputs}
          onAdicionarCusto={adicionarCustoNovo}
          onAtualizarCusto={atualizarCustoNovoLocal}
          onRemoverCusto={removerCustoNovo}
        />
      )}
      {step === 3 && <StepCustosFinanciamento inputs={inputs} updateInput={updateInput} />}
      {step === 4 && <StepCalendario inputs={inputs} updateInput={updateInput} />}
      {step === 5 && <StepRevisao inputs={inputs} calculando={calculando} onCalcular={calcular} />}

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
  identificacao,
  updateIdentificacao,
  aLoadearCp,
  opcoesCp,
  onCodigoPostalBlur,
  onEscolherOpcaoCp,
  tipologiasNovas,
}: {
  nome: string;
  setNome: (v: string) => void;
  tipoProjeto: string;
  setTipoProjeto: (v: string) => void;
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
  identificacao: IdentificacaoEstruturada;
  updateIdentificacao: <K extends keyof IdentificacaoEstruturada>(k: K, v: IdentificacaoEstruturada[K]) => void;
  aLoadearCp: boolean;
  opcoesCp: { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }[];
  onCodigoPostalBlur: () => void;
  onEscolherOpcaoCp: (opcao: { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }) => void;
  tipologiasNovas: Typology[];
}) {
  const gcaProgramado = calcGcaProgramado(identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo, tipologiasNovas);
  const abpProgramada = tipologiasNovas.reduce((s, t) => s + t.quantidade * t.abpUnidade, 0);
  const eficiencia = calcEficiencia(abpProgramada, gcaProgramado);
  const divergencia =
    identificacao.abpEstimada && tipologiasNovas.length > 0
      ? calcDivergenciaAbp(identificacao.abpEstimada, tipologiasNovas)
      : null;

  return (
    <>
      <Card title="Identificação do ativo">
        <Row>
          <Field label="Tipo de projeto">
            <select className="input-dark" value={tipoProjeto} onChange={(e) => setTipoProjeto(e.target.value)}>
              <option>Terreno para construir</option>
              <option>Prédio para reabilitação</option>
              <option>Prédio aprovado</option>
              <option>Apartamento para remodelar</option>
            </select>
          </Field>
          <Field label="Área do lote (m²)">
            <input
              type="number"
              className="input-dark"
              value={inputs.areaLote ?? ""}
              onChange={(e) => updateInput("areaLote", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Row>
        <Row>
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

      <Card
        title="Localização"
        subtitle="Introduza o código postal — a rua, freguesia, concelho e distrito são sugeridos automaticamente, mas continuam editáveis."
      >
        <Row>
          <Field label="Código postal">
            <input
              className="input-dark"
              placeholder="0000-000"
              value={identificacao.codigoPostal}
              onChange={(e) => updateIdentificacao("codigoPostal", e.target.value)}
              onBlur={onCodigoPostalBlur}
            />
          </Field>
          <Field label="Rua">
            <input className="input-dark" value={identificacao.rua} onChange={(e) => updateIdentificacao("rua", e.target.value)} />
          </Field>
        </Row>
        {aLoadearCp && <p className="text-xs text-[#8FA6AF] mb-3">A procurar o código postal…</p>}
        {opcoesCp.length > 1 && (
          <div className="mb-4">
            <p className="text-xs text-[#59636A] mb-2">Este código postal tem várias moradas — escolha uma:</p>
            {opcoesCp.map((o, i) => (
              <button
                key={i}
                onClick={() => onEscolherOpcaoCp(o)}
                className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-[#E3DACB] hover:border-[#B96343] mb-1.5"
              >
                {o.rua || "Rua não identificada"} — {o.freguesia}, {o.concelho}
              </button>
            ))}
          </div>
        )}
        <Row>
          <Field label="Freguesia">
            <input
              className="input-dark"
              value={identificacao.freguesia}
              onChange={(e) => updateIdentificacao("freguesia", e.target.value)}
            />
          </Field>
          <Field label="Concelho">
            <input
              className="input-dark"
              value={identificacao.concelho}
              onChange={(e) => updateIdentificacao("concelho", e.target.value)}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Distrito">
            <input
              className="input-dark"
              value={identificacao.distrito}
              onChange={(e) => updateIdentificacao("distrito", e.target.value)}
            />
          </Field>
          <Field label="Localidade">
            <input
              className="input-dark"
              value={identificacao.localidade}
              onChange={(e) => updateIdentificacao("localidade", e.target.value)}
            />
          </Field>
        </Row>
      </Card>

      <Card
        title="Áreas do projeto"
        subtitle="GCA e eficiência são calculados automaticamente a partir destes valores e do programa de tipologias."
      >
        <Row>
          <Field label="ABC acima do solo (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abcAcimaSolo ?? ""}
              onChange={(e) => updateIdentificacao("abcAcimaSolo", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="ABC abaixo do solo (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abcAbaixoSolo ?? ""}
              onChange={(e) => updateIdentificacao("abcAbaixoSolo", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Área dependente estimada (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.areaDependenteEstimada ?? ""}
              onChange={(e) => updateIdentificacao("areaDependenteEstimada", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="ABP estimada (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abpEstimada ?? ""}
              onChange={(e) => updateIdentificacao("abpEstimada", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
        </Row>
        <div className="flex gap-6 mt-2 text-sm">
          <div>
            <span className="text-xs text-[#59636A] block">GCA programado</span>
            <span className="font-semibold text-[#142B3A]">{gcaProgramado ? `${Math.round(gcaProgramado)} m²` : "—"}</span>
          </div>
          <div>
            <span className="text-xs text-[#59636A] block">Eficiência</span>
            <span className="font-semibold text-[#142B3A]">{eficiencia !== null ? `${Math.round(eficiencia * 100)}%` : "—"}</span>
          </div>
        </div>
        {divergencia && Math.abs(divergencia.diferencaAbsoluta) > 1 && (
          <p className="text-xs text-[#B96343] mt-3">
            Existe uma diferença entre a ABP estimada e a ABP calculada pelo programa ({Math.round(divergencia.abpCalculada)} m²,{" "}
            {divergencia.diferencaPercentual !== null ? `${Math.round(divergencia.diferencaPercentual * 100)}%` : ""} de diferença).
            Ajuste a ABP estimada ou reveja as tipologias na etapa seguinte.
          </p>
        )}
      </Card>

      <Card title="Características">
        <div className="grid grid-cols-2 gap-x-4">
          <CheckboxIdent label="Possui garagem" checked={identificacao.temGaragem} onChange={(v) => updateIdentificacao("temGaragem", v)} />
          <CheckboxIdent label="Possui elevador" checked={identificacao.temElevador} onChange={(v) => updateIdentificacao("temElevador", v)} />
          <CheckboxIdent
            label="Possui jardim ou áreas exteriores"
            checked={identificacao.temJardimExterior}
            onChange={(v) => updateIdentificacao("temJardimExterior", v)}
          />
          <CheckboxIdent
            label="Necessita demolição"
            checked={identificacao.necessitaDemolicao}
            onChange={(v) => updateIdentificacao("necessitaDemolicao", v)}
          />
          <CheckboxIdent label="Imóvel ocupado" checked={identificacao.imovelOcupado} onChange={(v) => updateIdentificacao("imovelOcupado", v)} />
          <CheckboxIdent
            label="Possui licenciamento aprovado"
            checked={identificacao.temLicenciamentoAprovado}
            onChange={(v) => updateIdentificacao("temLicenciamentoAprovado", v)}
          />
        </div>
      </Card>
    </>
  );
}

function CheckboxIdent({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#142B3A] mb-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ============================================================
// Etapa 2 — Programa e vendas (tipologias + mapa de vendas)
// ============================================================
function StepPrograma({
  inputs,
  updateInput,
  tipologiasNovas,
  identificacao,
  onAdicionarTipologiaNova,
  onAtualizarTipologiaNova,
  onRemoverTipologiaNova,
  sugestoes,
  onPedirSugestao,
  onAplicarSugestao,
}: {
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
  tipologiasNovas: Typology[];
  identificacao: IdentificacaoEstruturada;
  onAdicionarTipologiaNova: () => void;
  onAtualizarTipologiaNova: (id: string, patch: Partial<Typology>) => void;
  onRemoverTipologiaNova: (id: string) => void;
  sugestoes: Record<string, { loading: boolean; resultado?: SugestaoPreco; erro?: boolean }>;
  onPedirSugestao: (t: Typology) => void;
  onAplicarSugestao: (id: string, precoM2: number) => void;
}) {
  const resumo = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const semLocalizacao = !identificacao.freguesia && !identificacao.concelho;
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

      <Card
        title="Tipologias — motor novo (Fase 2)"
        subtitle="Áreas dependentes e área vendável equivalente calculadas por src/lib/calc/areas.ts. Ainda não alimenta o resultado financeiro abaixo — só o motor antigo (tipologias/mapa de vendas acima) faz isso, por agora."
      >
        {semLocalizacao && (
          <p className="text-xs text-[#B96343] mb-3">
            Preencha a freguesia/concelho na Identificação para poder pedir a Sugestão Landwise por comparáveis.
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[#59636A] uppercase text-left">
              <th className="pb-2">Tipologia</th>
              <th className="pb-2">Qtd</th>
              <th className="pb-2">ABP (m²)</th>
              <th className="pb-2">Varanda m² / %</th>
              <th className="pb-2">Terraço m² / %</th>
              <th className="pb-2">Preço base (€/m²)</th>
              <th className="pb-2">Área vendável</th>
              <th className="pb-2">Receita</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tipologiasNovas.map((t) => {
              const sugestao = sugestoes[t.id];
              return (
                <tr key={t.id} className="align-top">
                  <td className="pr-2 py-1">
                    <input
                      className="input-dark"
                      value={t.nome}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { nome: e.target.value })}
                    />
                  </td>
                  <td className="pr-2 py-1">
                    <input
                      type="number"
                      className="input-dark"
                      value={t.quantidade}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { quantidade: Number(e.target.value) })}
                    />
                  </td>
                  <td className="pr-2 py-1">
                    <input
                      type="number"
                      className="input-dark"
                      value={t.abpUnidade}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { abpUnidade: Number(e.target.value) })}
                    />
                  </td>
                  <td className="pr-2 py-1 flex gap-1">
                    <input
                      type="number"
                      className="input-dark w-20"
                      value={t.varandaM2}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { varandaM2: Number(e.target.value) })}
                    />
                    <PercentInput
                      value={t.varandaPctValorizacao}
                      onChange={(v) => onAtualizarTipologiaNova(t.id, { varandaPctValorizacao: v })}
                    />
                  </td>
                  <td className="pr-2 py-1 flex gap-1">
                    <input
                      type="number"
                      className="input-dark w-20"
                      value={t.terracoM2}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { terracoM2: Number(e.target.value) })}
                    />
                    <PercentInput
                      value={t.terracoPctValorizacao}
                      onChange={(v) => onAtualizarTipologiaNova(t.id, { terracoPctValorizacao: v })}
                    />
                  </td>
                  <td className="pr-2 py-1">
                    <input
                      type="number"
                      className="input-dark"
                      value={t.precoBaseM2}
                      onChange={(e) => onAtualizarTipologiaNova(t.id, { precoBaseM2: Number(e.target.value) })}
                    />
                    <button
                      onClick={() => onPedirSugestao(t)}
                      disabled={semLocalizacao || sugestao?.loading}
                      className="text-xs text-[#B96343] font-semibold mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sugestao?.loading ? "A calcular…" : "★ Pedir Sugestão Landwise"}
                    </button>
                    {sugestao?.erro && <p className="text-xs text-[#A13D2E] mt-1">Não foi possível calcular a sugestão.</p>}
                    {sugestao?.resultado && (
                      <div className="text-xs text-[#59636A] mt-1">
                        {sugestao.resultado.nivelConfianca === "Amostra insuficiente" || !sugestao.resultado.precoSugeridoM2 ? (
                          <span>Amostra insuficiente de comparáveis nesta zona.</span>
                        ) : (
                          <>
                            <p>
                              ★ €{sugestao.resultado.precoSugeridoM2.toLocaleString("pt-PT")}/m² — {sugestao.resultado.numeroComparaveis}{" "}
                              comparáveis, confiança {sugestao.resultado.nivelConfianca.toLowerCase()}
                            </p>
                            <button
                              onClick={() => onAplicarSugestao(t.id, sugestao.resultado!.precoSugeridoM2!)}
                              className="text-[#142B3A] font-semibold underline"
                            >
                              Aplicar sugestão
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="pr-2 py-1 text-[#59636A]">{Math.round(t.abpUnidade + t.varandaM2 * t.varandaPctValorizacao + t.terracoM2 * t.terracoPctValorizacao)} m²</td>
                  <td className="pr-2 py-1 text-[#59636A]">
                    €{Math.round((t.abpUnidade + t.varandaM2 * t.varandaPctValorizacao + t.terracoM2 * t.terracoPctValorizacao) * t.precoBaseM2 * t.quantidade).toLocaleString("pt-PT")}
                  </td>
                  <td>
                    <button onClick={() => onRemoverTipologiaNova(t.id)} className="text-[#A13D2E] text-xs">
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={onAdicionarTipologiaNova} className="text-[#B96343] text-sm font-semibold mt-3">
          + Adicionar tipologia
        </button>

        {tipologiasNovas.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-[#E3DACB] text-sm">
            <div>
              <span className="text-xs text-[#59636A] block">Total de unidades</span>
              <span className="font-semibold text-[#142B3A]">{resumo.totalUnidades}</span>
            </div>
            <div>
              <span className="text-xs text-[#59636A] block">Área vendável equivalente</span>
              <span className="font-semibold text-[#142B3A]">{Math.round(resumo.areaVendavelEquivalenteTotal)} m²</span>
            </div>
            <div>
              <span className="text-xs text-[#59636A] block">Receita total (GDV)</span>
              <span className="font-semibold text-[#142B3A]">€{Math.round(resumo.receitaTotal).toLocaleString("pt-PT")}</span>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// ============================================================
// Etapa 3 — Custos e financiamento
// ============================================================
// ============================================================
// Etapa nova — Aquisição e Custos (liga project_costs ao motor custos.ts)
// ============================================================
const GRUPOS_CUSTO: { grupo: GrupoCusto; titulo: string; sugestoes: string[] }[] = [
  { grupo: "aquisicao", titulo: "Aquisição", sugestoes: ["Sinal", "Due diligence técnica", "Due diligence legal", "Comissão de aquisição", "Notário", "Registos"] },
  { grupo: "hard_cost", titulo: "Hard costs", sugestoes: ["Obra acima do solo", "Obra abaixo do solo", "Jardinagem e exteriores", "Demolição", "Infraestruturas", "Contingência"] },
  { grupo: "soft_cost", titulo: "Soft costs", sugestoes: ["Arquitetura", "Engenharia", "Especialidades", "Licenciamento", "Fiscalização de obra", "Seguros"] },
  { grupo: "outro", titulo: "Outros custos", sugestoes: ["Branding", "Marketing", "Comercialização", "Outro"] },
];

const TIPOS_CALCULO_CUSTO: { value: LinhaCusto["tipoCalculo"]; label: string }[] = [
  { value: "valor_fixo", label: "Valor fixo (€)" },
  { value: "percentagem_aquisicao", label: "% da aquisição" },
  { value: "percentagem_hard_costs", label: "% dos hard costs" },
  { value: "percentagem_capex", label: "% do capex" },
  { value: "percentagem_custo_total", label: "% do custo total" },
  { value: "eur_m2_abc", label: "€/m² de ABC" },
  { value: "eur_m2_gca", label: "€/m² de GCA" },
  { value: "eur_unidade", label: "€/unidade" },
];

const PERFIS_DESEMBOLSO: { value: LinhaCusto["perfilDesembolso"]; label: string }[] = [
  { value: "unico_inicio", label: "Único no início" },
  { value: "unico_fim", label: "Único no fim" },
  { value: "linear", label: "Linear" },
  { value: "curva_s", label: "Curva S" },
  { value: "front_loaded", label: "Front-loaded" },
  { value: "back_loaded", label: "Back-loaded" },
];

function StepAquisicaoCustos({
  custosNovos,
  identificacao,
  tipologiasNovas,
  inputs,
  onAdicionarCusto,
  onAtualizarCusto,
  onRemoverCusto,
}: {
  custosNovos: LinhaCusto[];
  identificacao: IdentificacaoEstruturada;
  tipologiasNovas: Typology[];
  inputs: ProjectInputs;
  onAdicionarCusto: (grupo: GrupoCusto, nome: string) => void;
  onAtualizarCusto: (id: string, patch: Partial<LinhaCusto>) => void;
  onRemoverCusto: (id: string) => void;
}) {
  const contexto: ContextoCusto = {
    valorAquisicao: inputs.custoTerreno || 0,
    abcTotal: (identificacao.abcAcimaSolo ?? 0) + (identificacao.abcAbaixoSolo ?? 0),
    gcaTotal: calcGcaProgramado(identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo, tipologiasNovas),
    numeroUnidades: tipologiasNovas.reduce((s, t) => s + t.quantidade, 0),
  };

  const resolvidas = resolverCustos(custosNovos, contexto);
  const resumo = agregarCustos(resolvidas);

  function handleData(custo: LinhaCusto, dataInicial: string, duracaoMeses: number) {
    const dataFinal = dataInicial && duracaoMeses > 0 ? calcDataFinal(dataInicial, duracaoMeses) : null;
    onAtualizarCusto(custo.id, { dataInicial: dataInicial || null, duracaoMeses: duracaoMeses || null, dataFinal });
  }

  return (
    <>
      {GRUPOS_CUSTO.map(({ grupo, titulo, sugestoes }) => {
        const linhasDoGrupo = custosNovos.filter((c) => c.grupo === grupo);
        const subtotal =
          grupo === "aquisicao"
            ? resumo.totalAquisicao
            : grupo === "hard_cost"
              ? resumo.totalHardCosts
              : grupo === "soft_cost"
                ? resumo.totalSoftCosts
                : resumo.totalOutros;

        return (
          <Card key={grupo} title={titulo} subtitle={`Subtotal: €${Math.round(subtotal).toLocaleString("pt-PT")}`}>
            {linhasDoGrupo.length === 0 && <p className="text-xs text-[#8FA6AF] mb-3">Ainda sem linhas neste grupo.</p>}
            {linhasDoGrupo.map((c) => (
              <div key={c.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
                <Row>
                  <Field label="Nome">
                    <input className="input-dark" value={c.nome} onChange={(e) => onAtualizarCusto(c.id, { nome: e.target.value })} />
                  </Field>
                  <Field label="Tipo de cálculo">
                    <select
                      className="input-dark"
                      value={c.tipoCalculo}
                      onChange={(e) => onAtualizarCusto(c.id, { tipoCalculo: e.target.value as LinhaCusto["tipoCalculo"] })}
                    >
                      {TIPOS_CALCULO_CUSTO.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={c.tipoCalculo.startsWith("percentagem") ? "Percentagem" : "Valor"}>
                    {c.tipoCalculo.startsWith("percentagem") ? (
                      <PercentInput value={c.valorInput} onChange={(v) => onAtualizarCusto(c.id, { valorInput: v })} />
                    ) : (
                      <input
                        type="number"
                        className="input-dark"
                        value={c.valorInput}
                        onChange={(e) => onAtualizarCusto(c.id, { valorInput: Number(e.target.value) })}
                      />
                    )}
                  </Field>
                </Row>
                <Row>
                  <Field label="Taxa de IVA">
                    <select
                      className="input-dark"
                      value={c.taxaIva ?? ""}
                      onChange={(e) => onAtualizarCusto(c.id, { taxaIva: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Sem IVA</option>
                      <option value={0.06}>6%</option>
                      <option value={0.13}>13%</option>
                      <option value={0.23}>23%</option>
                    </select>
                  </Field>
                  <Field label="% de IVA recuperável">
                    <PercentInput value={c.ivaRecuperavelPct} onChange={(v) => onAtualizarCusto(c.id, { ivaRecuperavelPct: v })} />
                  </Field>
                  <Field label="Perfil de desembolso">
                    <select
                      className="input-dark"
                      value={c.perfilDesembolso}
                      onChange={(e) => onAtualizarCusto(c.id, { perfilDesembolso: e.target.value as LinhaCusto["perfilDesembolso"] })}
                    >
                      {PERFIS_DESEMBOLSO.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Row>
                <Row>
                  <Field label="Data inicial">
                    <input
                      type="date"
                      className="input-dark"
                      value={c.dataInicial ?? ""}
                      onChange={(e) => handleData(c, e.target.value, c.duracaoMeses ?? 1)}
                    />
                  </Field>
                  <Field label="Duração (meses)">
                    <input
                      type="number"
                      className="input-dark"
                      value={c.duracaoMeses ?? ""}
                      onChange={(e) => handleData(c, c.dataInicial ?? "", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Data final (calculada)">
                    <input type="date" className="input-dark" value={c.dataFinal ?? ""} disabled />
                  </Field>
                </Row>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-[#59636A]">
                    Valor resolvido: €{Math.round(resolvidas.find((r) => r.id === c.id)?.valorResolvido ?? 0).toLocaleString("pt-PT")}
                  </span>
                  <button onClick={() => onRemoverCusto(c.id)} className="text-[#A13D2E] text-xs">
                    Remover
                  </button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 mt-2">
              {sugestoes.map((s) => (
                <button
                  key={s}
                  onClick={() => onAdicionarCusto(grupo, s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]"
                >
                  + {s}
                </button>
              ))}
              <button
                onClick={() => onAdicionarCusto(grupo, "Nova linha")}
                className="text-xs px-2.5 py-1 rounded-full border border-dashed border-[#B96343] text-[#B96343]"
              >
                + Linha personalizada
              </button>
            </div>
          </Card>
        );
      })}

      <Card title="Resumo de custos e IVA">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-xs text-[#59636A] block">Custo total</span>
            <span className="font-semibold text-[#142B3A]">€{Math.round(resumo.custoTotal).toLocaleString("pt-PT")}</span>
          </div>
          <div>
            <span className="text-xs text-[#59636A] block">IVA suportado</span>
            <span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaSuportadoTotal).toLocaleString("pt-PT")}</span>
          </div>
          <div>
            <span className="text-xs text-[#59636A] block">IVA recuperável</span>
            <span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaRecuperavelTotal).toLocaleString("pt-PT")}</span>
          </div>
          <div>
            <span className="text-xs text-[#59636A] block">IVA não recuperável</span>
            <span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaNaoRecuperavelTotal).toLocaleString("pt-PT")}</span>
          </div>
        </div>
      </Card>
    </>
  );
}

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

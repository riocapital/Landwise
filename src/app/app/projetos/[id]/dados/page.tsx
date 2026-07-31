"use client";

import { useEffect, useState, useCallback, use } from "react";
import { normalizarTipoProjeto } from "@/lib/project-types";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_INPUTS,
  type ProjectInputs,
} from "@/lib/calc/viabilidade";
import { calcResumoPrograma, calcAbcTotalProgramado, type Typology } from "@/lib/calc/areas";
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
import { garantirCustosPadrao, garantirTipologiasPadrao } from "@/lib/supabase/project-defaults";
import { resolverMesInicioCashSweep, type ParametrosFinanciamento } from "@/lib/calc/financiamento";
import { carregarFinanciamento, guardarFinanciamento, FINANCIAMENTO_VAZIO } from "@/lib/supabase/project-financing";
import { obterModeloPreset, type ModeloCapital } from "@/lib/calc/estrutura-capital";
import type { NivelHurdle } from "@/lib/calc/waterfall";
import { type Fee, type TipoFee, type ContextoFees } from "@/lib/calc/fees";
import {
  carregarEstruturaCapital,
  guardarEstruturaCapital,
  listarHurdles,
  criarHurdle,
  atualizarHurdle,
  apagarHurdle,
  listarFees,
  criarFee,
  atualizarFee,
  apagarFee,
  type EstruturaCapitalEstado,
  ESTRUTURA_CAPITAL_VAZIA,
} from "@/lib/supabase/project-capital";
import { criarLeadConsultoria, type NovoLeadConsultoria } from "@/lib/supabase/consulting-leads";
import {
  gerarUnidadesDeTipologia,
  calcularSincronizacao,
  resolverSalesTable,
  calcVgvBruto,
  type UnidadeVenda,
} from "@/lib/calc/sales-table";
import { listarUnidades, criarUnidades, atualizarUnidade, apagarUnidades } from "@/lib/supabase/project-units";
import { calcularDatasEfetivas } from "@/lib/calc/sales-curve";
import { calcularAjustesParaSalesTable, type RegraEvolucaoPreco } from "@/lib/calc/price-escalation";
import {
  listarRegrasPreco,
  criarRegraPreco,
  atualizarRegraPreco,
  apagarRegraPreco,
} from "@/lib/supabase/project-price-rules";
import {
  criarCenarioConservador,
  criarCenarioOtimista,
  duplicarCenario,
  podeApagarCenario,
  type Cenario,
} from "@/lib/calc/cenarios";
import { listarCenarios, criarCenario, atualizarCenario, apagarCenario } from "@/lib/supabase/project-scenarios";
import { carregarImpostos, guardarImpostos, type ImpostosEstado, IMPOSTOS_VAZIO } from "@/lib/supabase/project-taxes";
import { type Atividade } from "@/lib/calc/calendario";
import {
  listarAtividades,
  atualizarAtividade,
} from "@/lib/supabase/project-timeline";
import { validarEstruturaRecebimentos, type PlanoVendas } from "@/lib/calc/vendas";
import { carregarPlanoVendas, guardarPlanoVendas, PLANO_VENDAS_VAZIO } from "@/lib/supabase/project-sales";
import { calcularCashFlow, calcularReservaMinimaCustos } from "@/lib/calc/cashflow";
import { gerarRecebimentosMensais, gerarRecebimentosDaSalesTable } from "@/lib/calc/vendas";
import { gerarComissaoMensal } from "@/lib/calc/sales-commission";
import { adicionarMesesData, diferencaMesesDatas, obterDatasConstrucaoDosCustos } from "./_components/helpers";
import { StepImpostos } from "./_components/step-impostos";
import { StepCalendario } from "./_components/step-calendario";
import { StepEstruturaCapital } from "./_components/step-estrutura-capital";
import { StepAquisicaoCustos } from "./_components/step-aquisicao-custos";
import { StepFinanciamento } from "./_components/step-financiamento";
import { StepIdentificacao } from "./_components/step-identificacao";
import { StepPrograma } from "./_components/step-programa";
import { StepCashFlowResultados } from "./_components/step-cash-flow-resultados";

const STEPS = [
  "Identificação",
  "Programa e vendas",
  "Aquisição e custos",
  "Financiamento",
  "Estrutura de capital e fees",
  "Impostos",
  "Calendário",
  "Cash flow e resultados",
];

// --- Fase 2: localização e áreas estruturadas (colunas novas em `projects`) ---
export type IdentificacaoEstruturada = {
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
  numEstacionamentos: number;
  temElevador: boolean;
  numElevadores: number;
  temJardimExterior: boolean;
  imovelOcupado: boolean;
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
  numEstacionamentos: 0,
  temElevador: false,
  numElevadores: 0,
  temJardimExterior: false,
  imovelOcupado: false,
};

export default function WizardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [nome, setNome] = useState("Novo projeto");
  const [tipoProjeto, setTipoProjeto] = useState("Terreno para Construção");
  const [inputs, setInputs] = useState<ProjectInputs>(DEFAULT_INPUTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fase 2: localização/áreas estruturadas + tipologias no motor novo (areas.ts)
  const [identificacao, setIdentificacao] = useState<IdentificacaoEstruturada>(IDENTIFICACAO_VAZIA);
  const [tipologiasNovas, setTipologiasNovas] = useState<Typology[]>([]);
  const [unidades, setUnidades] = useState<UnidadeVenda[]>([]);
  const [regrasPreco, setRegrasPreco] = useState<RegraEvolucaoPreco[]>([]);
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [custosNovos, setCustosNovos] = useState<LinhaCusto[]>([]);
  const [financiamento, setFinanciamento] = useState<ParametrosFinanciamento>(FINANCIAMENTO_VAZIO);
  const [estruturaCapital, setEstruturaCapital] = useState<EstruturaCapitalEstado>(ESTRUTURA_CAPITAL_VAZIA);
  const [hurdles, setHurdles] = useState<(NivelHurdle & { id: string })[]>([]);
  const [feesNovos, setFeesNovos] = useState<Fee[]>([]);
  const [impostos, setImpostos] = useState<ImpostosEstado>(IMPOSTOS_VAZIO);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [planoVendas, setPlanoVendas] = useState<PlanoVendas>(PLANO_VENDAS_VAZIO);
  const [aLoadearCp, setALoadearCp] = useState(false);
  const [opcoesCp, setOpcoesCp] = useState<
    { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }[]
  >([]);
  const [erroCp, setErroCp] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<
    Record<string, { loading: boolean; resultado?: SugestaoPreco; erro?: boolean }>
  >({});

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").eq("id", id).single();
    let inputsCarregados: ProjectInputs = DEFAULT_INPUTS;
    if (data) {
      setNome(data.nome);
      setTipoProjeto(normalizarTipoProjeto(data.tipo_projeto));
      if (data.inputs && Object.keys(data.inputs).length > 0) {
        inputsCarregados = { ...DEFAULT_INPUTS, ...data.inputs };
        setInputs(inputsCarregados);
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
        numEstacionamentos: data.num_estacionamentos ?? 0,
        temElevador: data.tem_elevador ?? false,
        numElevadores: data.num_elevadores ?? 0,
        temJardimExterior: data.tem_jardim_exterior ?? false,
        imovelOcupado: data.imovel_ocupado ?? false,
      });
    }
    const tipologiasLidas = await listarTipologiasProjeto(supabase, id);
    const tipologias = await garantirTipologiasPadrao(supabase, id, tipologiasLidas);
    setTipologiasNovas(tipologias);
    const unidadesCarregadas = await listarUnidades(supabase, id);
    setUnidades(unidadesCarregadas);
    const regrasPrecoCarregadas = await listarRegrasPreco(supabase, id);
    setRegrasPreco(regrasPrecoCarregadas);
    const cenariosCarregados = await listarCenarios(supabase, id);
    setCenarios(cenariosCarregados);
    const custosLidos = await listarCustosProjeto(supabase, id);
    const custosPadrao = await garantirCustosPadrao(supabase, id, custosLidos);
    const custos = await reconciliarCustosAquisicaoCarregados(supabase, custosPadrao, inputsCarregados);
    setCustosNovos(custos);
    const parametrosFinanciamento = await carregarFinanciamento(supabase, id);
    setFinanciamento(parametrosFinanciamento);
    const estruturaCapitalCarregada = await carregarEstruturaCapital(supabase, id);
    setEstruturaCapital(estruturaCapitalCarregada);
    const hurdlesCarregados = await listarHurdles(supabase, id);
    setHurdles(hurdlesCarregados);
    const feesCarregados = await listarFees(supabase, id);
    setFeesNovos(feesCarregados);
    const impostosCarregados = await carregarImpostos(supabase, id);
    setImpostos(impostosCarregados);
    const atividadesCarregadas = await listarAtividades(supabase, id);
    setAtividades(atividadesCarregadas);
    const planoVendasCarregado = await carregarPlanoVendas(supabase, id);
    const datasConstrucao = obterDatasConstrucaoDosCustos(custos);
    const planoVendasFinal = {
      ...planoVendasCarregado,
      dataInicioConstrucao: datasConstrucao.inicio || planoVendasCarregado.dataInicioConstrucao,
      dataFimConstrucao: datasConstrucao.fim || planoVendasCarregado.dataFimConstrucao,
    };
    setPlanoVendas(planoVendasFinal);
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

      const { error: erroIdentificacao } = await supabase
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
          num_estacionamentos: identificacao.temGaragem ? identificacao.numEstacionamentos : 0,
          tem_elevador: identificacao.temElevador,
          num_elevadores: identificacao.temElevador ? identificacao.numElevadores : 0,
          tem_jardim_exterior: identificacao.temJardimExterior,
          imovel_ocupado: identificacao.imovelOcupado,
        })
        .eq("id", id);

      // Tipologias do motor novo: cada uma já tem id real na BD (criada ao
      // clicar "+ Adicionar"), por isso aqui é sempre update, nunca insert.
      // Cada chamada devolve a mensagem de erro (ou null) em vez de a
      // ignorar silenciosamente — sem isto, "Guardado às HH:MM:SS" podia
      // aparecer mesmo quando a gravação falhou (ex. erro de rede, RLS).
      const resultados = await Promise.all([
        Promise.all(tipologiasNovas.map((t) => atualizarTipologia(supabase, t.id, t))),
        Promise.all(unidades.map((u) => atualizarUnidade(supabase, u.id, u))),
        Promise.all(regrasPreco.map((r) => atualizarRegraPreco(supabase, r.id, r))),
        Promise.all(cenarios.filter((c) => !c.ehBase).map((c) => atualizarCenario(supabase, c.id, c))),
        Promise.all(custosNovos.map((c) => atualizarCusto(supabase, c.id, c))),
        guardarFinanciamento(supabase, id, financiamento),
        guardarEstruturaCapital(supabase, id, estruturaCapital),
        Promise.all(hurdles.map((h) => atualizarHurdle(supabase, h.id, h))),
        Promise.all(feesNovos.map((f) => atualizarFee(supabase, f.id, f))),
        guardarImpostos(supabase, id, impostos),
        Promise.all(atividades.map((a) => atualizarAtividade(supabase, a.id, a))),
        guardarPlanoVendas(supabase, id, planoVendas),
      ]);

      const erros = [erroIdentificacao?.message ?? null, ...resultados.flat()].filter((e): e is string => e !== null);

      if (erros.length > 0) {
        setSaveError(erros[0]);
      } else {
        setSaveError(null);
        setSavedAt(new Date());
      }
      if (!silencioso) setSaving(false);
    },
    [
      id,
      nome,
      tipoProjeto,
      inputs,
      identificacao,
      tipologiasNovas,
      unidades,
      regrasPreco,
      cenarios,
      custosNovos,
      financiamento,
      estruturaCapital,
      hurdles,
      feesNovos,
      impostos,
      atividades,
      planoVendas,
      supabase,
    ]
  );

  // Autosave: 1.5s depois da última alteração
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => guardar(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nome,
    tipoProjeto,
    inputs,
    identificacao,
    tipologiasNovas,
    unidades,
    regrasPreco,
    cenarios,
    custosNovos,
    financiamento,
    estruturaCapital,
    hurdles,
    feesNovos,
    impostos,
    atividades,
    planoVendas,
    loading,
  ]);

  function updateIdentificacao<K extends keyof IdentificacaoEstruturada>(key: K, value: IdentificacaoEstruturada[K]) {
    setIdentificacao((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCodigoPostalBlur() {
    const cp = identificacao.codigoPostal.trim();
    setErroCp(null);
    if (!/^\d{4}-\d{3}$/.test(cp)) {
      if (cp) setErroCp("Introduza o código postal completo no formato 0000-000.");
      return;
    }
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
      } else {
        setErroCp("Não conseguimos identificar este código postal. Preencha os dados de localização manualmente.");
      }
    } catch {
      setErroCp("O serviço de código postal está temporariamente indisponível. Preencha manualmente ou tente novamente.");
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
    setUnidades((prev) => prev.filter((u) => u.tipologiaId !== tipId));
  }

  /**
   * Sincroniza as unidades da Sales Table com a quantidade atual da
   * tipologia. Nunca apaga sozinho uma unidade vendida ou personalizada —
   * quando há candidatas a remover, pede confirmação primeiro (secção 14).
   */
  async function sincronizarUnidades(tipologia: Typology) {
    const existentes = unidades.filter((u) => u.tipologiaId === tipologia.id);
    const r = calcularSincronizacao(existentes, tipologia.quantidade);

    if (r.paraCriar > 0) {
      const novas = gerarUnidadesDeTipologia(tipologia, r.paraCriar, existentes.length);
      const criadas = await criarUnidades(supabase, id, novas);
      setUnidades((prev) => [...prev, ...criadas]);
      return;
    }

    if (r.candidatasARemover.length > 0) {
      const confirmar = window.confirm(
        `A quantidade de "${tipologia.nome}" desceu para ${tipologia.quantidade}. Isto remove ${r.candidatasARemover.length} unidade(s) ainda disponível(is) e não personalizada(s). Unidades vendidas ou editadas manualmente nunca são apagadas. Continuar?`
      );
      if (!confirmar) return;
      const ids = r.candidatasARemover.map((u) => u.id);
      await apagarUnidades(supabase, ids);
      setUnidades((prev) => prev.filter((u) => !ids.includes(u.id)));
    }

    if (r.bloqueadasParaRemover.length > 0 && r.candidatasARemover.length === 0 && r.paraCriar === 0) {
      window.alert(
        `Não é possível reduzir mais "${tipologia.nome}": as ${r.bloqueadasParaRemover.length} unidades restantes já estão vendidas ou foram personalizadas.`
      );
    }
  }

  function atualizarUnidadeLocal(unidadeId: string, patch: Partial<UnidadeVenda>) {
    setUnidades((prev) => prev.map((u) => (u.id === unidadeId ? { ...u, ...patch, personalizada: true } : u)));
  }



  async function adicionarRegraPreco() {
    const nova = await criarRegraPreco(supabase, id, regrasPreco.length);
    if (nova) setRegrasPreco((prev) => [...prev, nova]);
  }

  function atualizarRegraPrecoLocal(regraId: string, patch: Partial<RegraEvolucaoPreco>) {
    setRegrasPreco((prev) => prev.map((r) => (r.id === regraId ? { ...r, ...patch } : r)));
  }

  async function removerRegraPreco(regraId: string) {
    await apagarRegraPreco(supabase, regraId);
    setRegrasPreco((prev) => prev.filter((r) => r.id !== regraId));
  }

  /**
   * Aplica as regras de evolução de preços a todas as unidades elegíveis
   * (disponíveis, sem override manual, sem preço bloqueado) — nunca às
   * unidades já vendidas ou personalizadas.
   */
  function aplicarEvolucaoPrecos(dataLancamentoComercial: string) {
    if (!dataLancamentoComercial) {
      window.alert("Preenche primeiro a data de lançamento comercial no Plano de Vendas.");
      return;
    }
    const datasEfetivas = calcularDatasEfetivas(
      unidades.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
      tipologiasNovas.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
      dataLancamentoComercial
    );
    const unidadesParaAjuste = unidades.map((u) => ({
      id: u.id,
      tipologiaId: u.tipologiaId,
      dataVendaEfetiva: datasEfetivas.get(u.id) ?? null,
      disponivel: u.estadoComercial === "disponivel",
      precoBloqueado: u.precoBloqueado,
      overrideManualValor: u.overrideManualValor,
    }));
    const ajustes = calcularAjustesParaSalesTable(unidadesParaAjuste, regrasPreco, dataLancamentoComercial);
    setUnidades((prev) => prev.map((u) => (ajustes.has(u.id) ? { ...u, ajusteFaseComercialPct: ajustes.get(u.id)! } : u)));
  }

  async function adicionarCenarioConservador() {
    const novo = await criarCenario(supabase, id, criarCenarioConservador(null));
    if (novo) setCenarios((prev) => [...prev, novo]);
  }

  async function adicionarCenarioOtimista() {
    const novo = await criarCenario(supabase, id, criarCenarioOtimista(null));
    if (novo) setCenarios((prev) => [...prev, novo]);
  }

  async function duplicarCenarioHandler(original: Cenario) {
    const copia = duplicarCenario(original, `${original.nome} (cópia)`, null);
    const novo = await criarCenario(supabase, id, copia);
    if (novo) setCenarios((prev) => [...prev, novo]);
  }

  function atualizarCenarioLocal(cenarioId: string, patch: Partial<Cenario>) {
    setCenarios((prev) => prev.map((c) => (c.id === cenarioId ? { ...c, ...patch } : c)));
  }

  async function removerCenario(cenario: Cenario) {
    if (!podeApagarCenario(cenario)) {
      window.alert("O cenário-base nunca pode ser apagado.");
      return;
    }
    const apagou = await apagarCenario(supabase, cenario);
    if (apagou) setCenarios((prev) => prev.filter((c) => c.id !== cenario.id));
  }

  async function adicionarCustoNovo(grupo: GrupoCusto, nome: string) {
    const novo = await criarCusto(supabase, id, grupo, nome, custosNovos.length);
    if (!novo) return;
    const baseAutomatica = BASE_AUTOMATICA_POR_NOME[nome];
    if (baseAutomatica) {
      await atualizarCusto(supabase, novo.id, { tipoCalculo: baseAutomatica });
      setCustosNovos((prev) => [...prev, { ...novo, tipoCalculo: baseAutomatica }]);
    } else {
      setCustosNovos((prev) => [...prev, novo]);
    }
  }

  // Usa a forma funcional de setCustosNovos (prev => ...) de propósito: várias
  // chamadas a esta função disparam-se em sequência síncrona no mesmo evento
  // (ex.: sincronizarAquisicao atualiza "Sinal da aquisição" e depois "Escritura
  // da aquisição"). Com `custosNovos` capturado do closure do render, a segunda
  // chamada partia sempre do mesmo array desatualizado da primeira — a última
  // chamada "ganhava" e a atualização anterior era descartada silenciosamente
  // (achado P1.6 da auditoria: o sinal ficava preso num valor antigo enquanto a
  // escritura recalculava corretamente). A forma funcional garante que cada
  // chamada parte sempre do estado mais recente, mesmo dentro do mesmo tick.
  function atualizarCustoNovoLocal(custoId: string, patch: Partial<LinhaCusto>) {
    setCustosNovos((prev) => {
      const atualizados = prev.map((c) => (c.id === custoId ? { ...c, ...patch } : c));
      const { inicio, fim } = obterDatasConstrucaoDosCustos(atualizados);
      const duracao = inicio && fim ? Math.max(1, diferencaMesesDatas(inicio, fim) + 1) : null;
      const comFiscalizacaoSincronizada = atualizados.map((c) =>
        c.nome === "Fiscalização de obra" && inicio && fim
          ? {
              ...c,
              tipoCalculo: "valor_mensal" as const,
              dataInicial: inicio,
              dataFinal: fim,
              duracaoMeses: duracao,
              perfilDesembolso: "linear" as const,
            }
          : c
      );
      if (inicio || fim) {
        setPlanoVendas((prevPlano) => ({
          ...prevPlano,
          dataInicioConstrucao: inicio || prevPlano.dataInicioConstrucao,
          dataFimConstrucao: fim || prevPlano.dataFimConstrucao,
        }));
      }
      return comFiscalizacaoSincronizada;
    });
  }

  async function removerCustoNovo(custoId: string) {
    await apagarCusto(supabase, custoId);
    setCustosNovos((prev) => prev.filter((c) => c.id !== custoId));
  }

  function handleToggleFinanciamento(novoComFinanciamento: boolean) {
    if (!novoComFinanciamento && financiamento.comFinanciamento) {
      const temValoresBancarios =
        financiamento.euribor > 0 || financiamento.spread > 0 || (financiamento.limiteCredito ?? 0) > 0;
      if (temValoresBancarios) {
        const confirmar = window.confirm(
          "Este projeto tinha financiamento configurado. Ao desativar, todos os campos bancários (euribor, spread, limite, fees) vão ser zerados e desativados. Continuar?"
        );
        if (!confirmar) return;
      }
    }
    setFinanciamento((prev) => ({ ...prev, comFinanciamento: novoComFinanciamento }));
  }

  function updateFinanciamento<K extends keyof ParametrosFinanciamento>(key: K, value: ParametrosFinanciamento[K]) {
    setFinanciamento((prev) => ({ ...prev, [key]: value }));
  }

  async function aplicarModeloCapital(modelo: ModeloCapital) {
    const preset = obterModeloPreset(modelo);
    setEstruturaCapital((prev) => ({
      ...prev,
      modelo,
      temInvestidorExterno: preset.temInvestidorExterno,
      percentagemInvestidor: preset.percentagemInvestidor,
    }));
    // Substitui os hurdles atuais pelos do preset (apaga os antigos, cria os novos)
    await Promise.all(hurdles.map((h) => apagarHurdle(supabase, h.id)));
    const novos = await Promise.all(preset.hurdles.map((_, i) => criarHurdle(supabase, id, i)));
    const novosValidos = novos.filter((h): h is NivelHurdle & { id: string } => h !== null);
    await Promise.all(novosValidos.map((h, i) => atualizarHurdle(supabase, h.id, preset.hurdles[i])));
    setHurdles(novosValidos.map((h, i) => ({ ...h, ...preset.hurdles[i] })));
  }

  function updateEstruturaCapital<K extends keyof EstruturaCapitalEstado>(key: K, value: EstruturaCapitalEstado[K]) {
    setEstruturaCapital((prev) => ({ ...prev, [key]: value }));
  }

  async function adicionarHurdle() {
    const novo = await criarHurdle(supabase, id, hurdles.length);
    if (novo) setHurdles((prev) => [...prev, novo]);
  }

  function atualizarHurdleLocal(hurdleId: string, patch: Partial<NivelHurdle>) {
    setHurdles((prev) => prev.map((h) => (h.id === hurdleId ? { ...h, ...patch } : h)));
  }

  async function removerHurdle(hurdleId: string) {
    await apagarHurdle(supabase, hurdleId);
    setHurdles((prev) => prev.filter((h) => h.id !== hurdleId));
  }

  async function adicionarFee(tipo: TipoFee, nome: string) {
    const novo = await criarFee(supabase, id, tipo, nome, feesNovos.length);
    if (novo) setFeesNovos((prev) => [...prev, novo]);
  }

  function atualizarFeeLocal(feeId: string, patch: Partial<Fee>) {
    setFeesNovos((prev) => prev.map((f) => (f.id === feeId ? { ...f, ...patch } : f)));
  }

  async function removerFee(feeId: string) {
    await apagarFee(supabase, feeId);
    setFeesNovos((prev) => prev.filter((f) => f.id !== feeId));
  }

  function updateImpostos<K extends keyof ImpostosEstado>(key: K, value: ImpostosEstado[K]) {
    setImpostos((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSolicitarConsultoria(
    dadosFormulario: {
      name: string;
      company: string;
      email: string;
      phone: string;
      message: string;
      preferenciaContacto: "email" | "telefone";
    },
    impostoEstimado: number
  ): Promise<{ ok: boolean; erro?: string }> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { ok: false, erro: "Sessão não encontrada. Inicia sessão novamente." };

    const lead: NovoLeadConsultoria = {
      userId: userData.user.id,
      projectId: id,
      name: dadosFormulario.name,
      company: dadosFormulario.company || null,
      email: dadosFormulario.email,
      phone: dadosFormulario.phone || null,
      message: dadosFormulario.message || null,
      preferenciaContacto: dadosFormulario.preferenciaContacto,
      projectSummary: {
        projeto: nome,
        localizacao: [identificacao.freguesia, identificacao.concelho].filter(Boolean).join(", ") || null,
        valorAquisicao: inputs.custoTerreno || 0,
        gdv: vgvBrutoAtual,
        custoTotal: resumoCustosAtual.custoTotal,
        impostoEstimado,
      },
    };
    return criarLeadConsultoria(supabase, lead);
  }

  function updatePlanoVendas<K extends keyof PlanoVendas>(key: K, value: PlanoVendas[K]) {
    const proximo = { ...planoVendas, [key]: value };
    setPlanoVendas(proximo);
    if (key === "dataInicioConstrucao" || key === "dataFimConstrucao") {
      const inicio = proximo.dataInicioConstrucao;
      const fim = proximo.dataFimConstrucao;
      const duracao = inicio && fim ? Math.max(1, diferencaMesesDatas(inicio, fim) + 1) : null;
      setCustosNovos((prev) =>
        prev.map((c) =>
          c.nome === "Fiscalização de obra"
            ? {
                ...c,
                tipoCalculo: "valor_mensal",
                dataInicial: inicio || null,
                dataFinal: fim || null,
                duracaoMeses: duracao,
                perfilDesembolso: "linear",
              }
            : c
        )
      );
    }
  }

  function updateEstruturaRecebimentos<K extends keyof PlanoVendas["estruturaRecebimentos"]>(
    key: K,
    value: PlanoVendas["estruturaRecebimentos"][K]
  ) {
    setPlanoVendas((prev) => ({ ...prev, estruturaRecebimentos: { ...prev.estruturaRecebimentos, [key]: value } }));
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

  function verResultados() {
    router.push(`/app/projetos/${id}`);
  }

  function updateInput<K extends keyof ProjectInputs>(key: K, value: ProjectInputs[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <div className="p-8 text-sm text-[#59636A]">A carregar…</div>;

  const resumoProgramaAtual = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const contextoCustoAtual: ContextoCusto = {
    valorAquisicao: inputs.custoTerreno || 0,
    abcAcimaSolo: identificacao.abcAcimaSolo ?? 0,
    abcAbaixoSolo: identificacao.abcAbaixoSolo ?? 0,
    abdTotal: resumoProgramaAtual.areaDependenteTotal,
    numeroUnidades: tipologiasNovas.reduce((s, t) => s + t.quantidade, 0),
  };
  const resumoCustosAtual = agregarCustos(resolverCustos(custosNovos, contextoCustoAtual));
  const abcTotalAtual = calcAbcTotalProgramado(identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo, tipologiasNovas);
  const salesTableResolvida = resolverSalesTable(unidades, tipologiasNovas);
  const vgvBrutoAtual = calcVgvBruto(salesTableResolvida);
  const contextoFeesAtual: ContextoFees = {
    valorAquisicao: contextoCustoAtual.valorAquisicao,
    hardCostsTotal: resumoCustosAtual.totalHardCosts,
    capexTotal: resumoCustosAtual.custoTotal,
    custoTotal: resumoCustosAtual.custoTotal,
    abcTotal: abcTotalAtual,
    numeroUnidades: contextoCustoAtual.numeroUnidades,
  };
  const reservaMinimaAtual = calcularReservaMinimaCustos(
    custosNovos,
    contextoCustoAtual,
    financiamento.saldoMinimoMesesReserva ?? 6
  );
  const financiamentoEfetivo: ParametrosFinanciamento = {
    ...financiamento,
    saldoMinimoCaixa: reservaMinimaAtual.valor,
    cashSweepMesesCustosFuturos: financiamento.saldoMinimoMesesReserva ?? financiamento.cashSweepMesesCustosFuturos,
  };

  // Cash flow calculado uma única vez aqui — partilhado pela etapa final
  // (Cash flow e resultados) e pelo Calendário (para mostrar drawdowns e
  // liquidação sem recalcular o mesmo motor de maneira diferente, secção
  // 19 do plano).
  const recebimentosValidosAtual = validarEstruturaRecebimentos(planoVendas.estruturaRecebimentos);
  const datasPreenchidasAtual = Boolean(
    planoVendas.dataLancamentoComercial && planoVendas.dataInicioConstrucao && planoVendas.dataFimConstrucao && planoVendas.dataEscritura
  );
  const prontoParaCalcularAtual = recebimentosValidosAtual && datasPreenchidasAtual && custosNovos.length > 0;

  let resultadoAtual: ReturnType<typeof calcularCashFlow> | null = null;
  if (prontoParaCalcularAtual) {
    const { linhas: recebimentosCalculados } =
      salesTableResolvida.length > 0
        ? gerarRecebimentosDaSalesTable(salesTableResolvida, tipologiasNovas, planoVendas)
        : gerarRecebimentosMensais(vgvBrutoAtual, planoVendas);

    let comissaoPorMesCalculada: Map<string, number> | undefined;
    if (salesTableResolvida.length > 0) {
      const { linhas: linhasComissaoCalculadas } = gerarComissaoMensal(
        salesTableResolvida,
        tipologiasNovas,
        planoVendas.dataLancamentoComercial,
        planoVendas.dataEscritura,
        {
          percentagemComissao: planoVendas.comissaoMediacaoPct,
          taxaIva: planoVendas.comissaoTaxaIva,
          pctPagoNoSinal: planoVendas.comissaoPctPagoSinal,
          pctPagoNaEscritura: planoVendas.comissaoPctPagoEscritura,
          ivaRecuperavelPct: planoVendas.comissaoIvaRecuperavelPct,
        }
      );
      comissaoPorMesCalculada = new Map(linhasComissaoCalculadas.map((l) => [l.mes, l.total]));
    }

    // Cash sweep (secção 24): resolve em que mês o gatilho é atingido a
    // partir dos dados reais da Sales Table e dos recebimentos —
    // financiamento.ts não conhece a Sales Table, só recebe o mês já
    // resolvido.
    let mesInicioCashSweepCalculado: string | null = null;
    if (financiamento.cashSweepAtivo) {
      const totalUnidadesAtual = unidades.length;
      const vgvTotalAtual = vgvBrutoAtual;
      const datasEfetivasAtual =
        salesTableResolvida.length > 0
          ? calcularDatasEfetivas(
              unidades.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
              tipologiasNovas.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
              planoVendas.dataLancamentoComercial
            )
          : new Map<string, string>();
      const mesesUnicos = [...new Set(recebimentosCalculados.map((l) => l.mes))].sort();
      let vgvAcumulado = 0;
      const eventosCashSweep = mesesUnicos.map((mes) => {
        vgvAcumulado += recebimentosCalculados.filter((l) => l.mes === mes).reduce((s, l) => s + l.total, 0);
        const unidadesVendidasAteMes = [...datasEfetivasAtual.values()].filter((d) => d <= mes).length;
        return {
          mes,
          temEscritura: planoVendas.dataEscritura ? mes >= planoVendas.dataEscritura.slice(0, 7) : false,
          pctVendidoAcumulado: totalUnidadesAtual > 0 ? unidadesVendidasAteMes / totalUnidadesAtual : 0,
          pctVgvRecebidoAcumulado: vgvTotalAtual > 0 ? vgvAcumulado / vgvTotalAtual : 0,
        };
      });
      mesInicioCashSweepCalculado = resolverMesInicioCashSweep(financiamentoEfetivo, eventosCashSweep);
    }

    resultadoAtual = calcularCashFlow({
      linhasCusto: custosNovos,
      contextoCusto: contextoCustoAtual,
      recebimentos: recebimentosCalculados,
      comissaoPorMes: comissaoPorMesCalculada,
      parametrosFinanciamento: financiamentoEfetivo,
      mesInicioCashSweep: mesInicioCashSweepCalculado,
      saldoMinimoCaixa: financiamentoEfetivo.saldoMinimoCaixa,
    });
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-1">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="text-lg font-bold text-[#142B3A] bg-transparent border-b border-transparent hover:border-[#E3DACB] focus:border-[#B96343] focus:outline-none"
        />
        <span className={`text-xs ${saveError ? "text-[#A13D2E] font-semibold" : "text-[#59636A]"}`}>
          {saving
            ? "A guardar…"
            : saveError
              ? "Falha ao guardar — tenta novamente"
              : savedAt
                ? `Guardado às ${savedAt.toLocaleTimeString("pt-PT")}`
                : ""}
        </span>
      </div>
      {saveError && (
        <p className="text-xs text-[#A13D2E] -mt-1 mb-4 bg-[#FBEAE6] border border-[#A13D2E]/30 rounded-lg px-3 py-2">
          As últimas alterações não foram guardadas: {saveError}. Os dados no ecrã continuam corretos — tenta guardar de novo antes de sair desta página.
        </p>
      )}
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
          erroCp={erroCp}
          opcoesCp={opcoesCp}
          onCodigoPostalBlur={handleCodigoPostalBlur}
          onEscolherOpcaoCp={aplicarOpcaoCp}
          tipologiasNovas={tipologiasNovas}
        />
      )}
      {step === 1 && (
        <StepPrograma
          tipologiasNovas={tipologiasNovas}
          identificacao={identificacao}
          onAdicionarTipologiaNova={adicionarTipologiaNova}
          onAtualizarTipologiaNova={atualizarTipologiaNovaLocal}
          onRemoverTipologiaNova={removerTipologiaNova}
          sugestoes={sugestoes}
          onPedirSugestao={pedirSugestaoLandwise}
          onAplicarSugestao={aplicarSugestao}
          unidades={unidades}
          onSincronizarUnidades={sincronizarUnidades}
          onAtualizarUnidade={atualizarUnidadeLocal}
          planoVendas={planoVendas}
          updatePlanoVendas={updatePlanoVendas}
          updateEstruturaRecebimentos={updateEstruturaRecebimentos}
          regrasPreco={regrasPreco}
          onAdicionarRegraPreco={adicionarRegraPreco}
          onAtualizarRegraPreco={atualizarRegraPrecoLocal}
          onRemoverRegraPreco={removerRegraPreco}
          onAplicarEvolucaoPrecos={() => aplicarEvolucaoPrecos(planoVendas.dataLancamentoComercial)}
        />
      )}
      {step === 2 && (
        <StepAquisicaoCustos
          custosNovos={custosNovos}
          identificacao={identificacao}
          tipologiasNovas={tipologiasNovas}
          inputs={inputs}
          updateInput={updateInput}
          onAdicionarCusto={adicionarCustoNovo}
          onAtualizarCusto={atualizarCustoNovoLocal}
          onRemoverCusto={removerCustoNovo}
        />
      )}
      {step === 3 && (
        <StepFinanciamento
          financiamento={financiamento}
          onToggleComFinanciamento={handleToggleFinanciamento}
          updateFinanciamento={updateFinanciamento}
          reservaMinima={reservaMinimaAtual}
        />
      )}
      {step === 4 && (
        <StepEstruturaCapital
          estruturaCapital={estruturaCapital}
          hurdles={hurdles}
          feesNovos={feesNovos}
          onAplicarModelo={aplicarModeloCapital}
          updateEstruturaCapital={updateEstruturaCapital}
          onAdicionarHurdle={adicionarHurdle}
          onAtualizarHurdle={atualizarHurdleLocal}
          onRemoverHurdle={removerHurdle}
          onAdicionarFee={adicionarFee}
          onAtualizarFee={atualizarFeeLocal}
          onRemoverFee={removerFee}
          contextoFees={contextoFeesAtual}
        />
      )}
      {step === 5 && (
        <StepImpostos
          impostos={impostos}
          updateImpostos={updateImpostos}
          resultado={resultadoAtual}
          onSolicitarConsultoria={handleSolicitarConsultoria}
        />
      )}
      {step === 6 && (
        <StepCalendario
          custosNovos={custosNovos}
          planoVendas={planoVendas}
          unidades={unidades}
          tipologiasNovas={tipologiasNovas}
          resultado={resultadoAtual}
        />
      )}
      {step === 7 && (
        <StepCashFlowResultados
          onVerResultados={verResultados}
          planoVendas={planoVendas}
          custosNovos={custosNovos}
          contextoCusto={contextoCustoAtual}
          resumoPrograma={resumoProgramaAtual}
          vgvBruto={vgvBrutoAtual}
          identificacao={identificacao}
          financiamento={financiamento}
          estruturaCapital={estruturaCapital}
          hurdles={hurdles}
          feesNovos={feesNovos}
          contextoFees={contextoFeesAtual}
          resultado={resultadoAtual}
          prontoParaCalcular={prontoParaCalcularAtual}
          salesTableResolvida={salesTableResolvida}
          tipologiasNovas={tipologiasNovas}
          cenarios={cenarios}
          onAdicionarCenarioConservador={adicionarCenarioConservador}
          onAdicionarCenarioOtimista={adicionarCenarioOtimista}
          onDuplicarCenario={duplicarCenarioHandler}
          onAtualizarCenario={atualizarCenarioLocal}
          onRemoverCenario={removerCenario}
        />
      )}

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
// ============================================================
// Etapa 2 — Programa e vendas (tipologias + mapa de vendas)
// ============================================================
// ============================================================
// Etapa 3 — Custos e financiamento
// ============================================================
// ============================================================
// Etapa nova — Aquisição e Custos (liga project_costs ao motor custos.ts)
// ============================================================
/** Base automática por nome (secção 21 do plano) — nunca obriga o utilizador a escolher manualmente para as 3 linhas de construção principais. */
const BASE_AUTOMATICA_POR_NOME: Record<string, LinhaCusto["tipoCalculo"]> = {
  "Construção acima do solo": "eur_m2_abc_acima",
  "Construção abaixo do solo": "eur_m2_abc_abaixo",
  "Construção dependente": "eur_m2_abd",
};

/**
 * Liga os inputs de aquisição legados às linhas mensais do motor quando o
 * projeto é aberto. Só preenche linhas vazias/datas ausentes: nunca substitui
 * valores que o utilizador já personalizou.
 */
async function reconciliarCustosAquisicaoCarregados(
  supabase: ReturnType<typeof createClient>,
  custos: LinhaCusto[],
  inputs: ProjectInputs
): Promise<LinhaCusto[]> {
  const resultado = custos.map((c) => ({ ...c }));
  const porNome = new Map(resultado.map((c) => [c.nome, c]));
  const reforcos = resultado.filter((c) => c.grupo === "aquisicao" && c.nome.startsWith("Reforço da aquisição"));
  const somaReforcos = reforcos.reduce((soma, c) => soma + c.valorInput, 0);
  const sinal = Math.max(0, (inputs.custoTerreno || 0) * (inputs.sinalAquisicaoPct || 0));
  const dataEscritura = inputs.dataEscrituraAquisicao || adicionarMesesData(inputs.dataSinalAquisicao, inputs.duracaoAteEscrituraMeses);
  const residual = Math.max(0, (inputs.custoTerreno || 0) - sinal - somaReforcos);

  const aplicar = async (nome: string, patch: Partial<LinhaCusto>) => {
    const linha = porNome.get(nome);
    if (!linha || Object.keys(patch).length === 0) return;
    Object.assign(linha, patch);
    await atualizarCusto(supabase, linha.id, patch);
  };

  const linhaSinal = porNome.get("Sinal da aquisição");
  if (linhaSinal) {
    await aplicar("Sinal da aquisição", {
      ...(linhaSinal.valorInput === 0 && sinal > 0 ? { valorInput: sinal } : {}),
      ...(!linhaSinal.dataInicial && inputs.dataSinalAquisicao
        ? { dataInicial: inputs.dataSinalAquisicao, dataFinal: inputs.dataSinalAquisicao, duracaoMeses: 1, perfilDesembolso: "unico_inicio" as const }
        : {}),
    });
  }

  const linhaEscritura = porNome.get("Escritura da aquisição");
  if (linhaEscritura) {
    await aplicar("Escritura da aquisição", {
      ...(linhaEscritura.valorInput === 0 && residual > 0 ? { valorInput: residual } : {}),
      ...(!linhaEscritura.dataInicial && dataEscritura
        ? { dataInicial: dataEscritura, dataFinal: dataEscritura, duracaoMeses: 1, perfilDesembolso: "unico_inicio" as const }
        : {}),
    });
  }

  if (dataEscritura) {
    for (const nome of ["Notário", "Registos", "IMT", "Imposto do selo", "Comissão de aquisição", "Outros custos de aquisição"]) {
      const linha = porNome.get(nome);
      if (linha && !linha.dataInicial) {
        await aplicar(nome, { dataInicial: dataEscritura, dataFinal: dataEscritura, duracaoMeses: 1, perfilDesembolso: "unico_inicio" });
      }
    }
  }

  return resultado;
}



// Auxiliares visuais (Card, Row, FieldGroup, NumeroInput, PercentInput,
// CheckboxIdent, ResumoItem, SensibilidadesMatriz) vivem em ./_components/ui.tsx

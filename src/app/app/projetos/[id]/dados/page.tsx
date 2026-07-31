"use client";

import { useEffect, useState, useCallback, use, Fragment } from "react";
import { TIPOS_PROJETO, normalizarTipoProjeto } from "@/lib/project-types";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_INPUTS,
  type ProjectInputs,
} from "@/lib/calc/viabilidade";
import { calcResumoPrograma, calcAbcTotalProgramado, calcEficiencia, calcDivergenciaAbp, type Typology } from "@/lib/calc/areas";
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
import { garantirCustosPadrao, garantirTipologiasPadrao, CUSTOS_PADRAO } from "@/lib/supabase/project-defaults";
import { calcDataFinal } from "@/lib/calc/calendario";
import { taxaAnual, taxaMensal, resolverMesInicioCashSweep, type ParametrosFinanciamento } from "@/lib/calc/financiamento";
import { carregarFinanciamento, guardarFinanciamento, FINANCIAMENTO_VAZIO } from "@/lib/supabase/project-financing";
import { obterModeloPreset, type ModeloCapital } from "@/lib/calc/estrutura-capital";
import type { NivelHurdle } from "@/lib/calc/waterfall";
import { agregarFees, type Fee, type TipoFee, type ContextoFees } from "@/lib/calc/fees";
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
import { calcularResultadosComWaterfall } from "@/lib/calc/estrutura-capital";
import { criarLeadConsultoria, type NovoLeadConsultoria } from "@/lib/supabase/consulting-leads";
import {
  gerarUnidadesDeTipologia,
  calcularSincronizacao,
  resolverSalesTable,
  calcVgvBruto,
  calcDataEscrituraDefeito,
  validarEscrituraUnidade,
  calcValorEscrituraUnidade,
  type UnidadeVenda,
  type LinhaSalesTableResolvida,
} from "@/lib/calc/sales-table";
import { listarUnidades, criarUnidades, atualizarUnidade, apagarUnidades } from "@/lib/supabase/project-units";
import { gerarAgendaAbsorcao, calcResumoAbsorcao, calcularDatasEfetivas } from "@/lib/calc/sales-curve";
import { calcularAjustesParaSalesTable, type RegraEvolucaoPreco, type TipoGatilhoPreco } from "@/lib/calc/price-escalation";
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
  compararCenarios,
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
import { calcularImt, FONTE_TABELAS_IMT, type TipoImovelImt } from "@/lib/calc/imt";
import { gerarRecebimentosMensais, gerarRecebimentosDaSalesTable } from "@/lib/calc/vendas";
import { gerarComissaoMensal } from "@/lib/calc/sales-commission";
import {
  extrairIndicador,
  type MatrizSensibilidade,
  type IndicadorSensibilidade,
} from "@/lib/calc/sensibilidades";
import { Card, Row, FieldGroup, NumeroInput, PercentInput, CheckboxIdent, ResumoItem, SensibilidadesMatriz } from "./_components/ui";
import { salesTableDaTipologia, fmtEUR, adicionarMesesData, diferencaMesesDatas, obterDatasConstrucaoDosCustos } from "./_components/helpers";
import { CashFlowChart } from "./_components/cash-flow-chart";
import { StepImpostos } from "./_components/step-impostos";
import { StepCalendario } from "./_components/step-calendario";
import { StepEstruturaCapital } from "./_components/step-estrutura-capital";

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

  function atualizarCustoNovoLocal(custoId: string, patch: Partial<LinhaCusto>) {
    const atualizados = custosNovos.map((c) => (c.id === custoId ? { ...c, ...patch } : c));
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
    setCustosNovos(comFiscalizacaoSincronizada);
    if (inicio || fim) {
      setPlanoVendas((prev) => ({
        ...prev,
        dataInicioConstrucao: inicio || prev.dataInicioConstrucao,
        dataFimConstrucao: fim || prev.dataFimConstrucao,
      }));
    }
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
function StepIdentificacao({
  nome,
  setNome,
  tipoProjeto,
  setTipoProjeto,
  inputs,
  updateInput,
  identificacao,
  updateIdentificacao,
  aLoadearCp,
  erroCp,
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
  erroCp: string | null;
  opcoesCp: { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }[];
  onCodigoPostalBlur: () => void;
  onEscolherOpcaoCp: (opcao: { rua: string | null; localidade: string | null; freguesia: string | null; concelho: string | null; distrito: string | null; latitude: number | null; longitude: number | null }) => void;
  tipologiasNovas: Typology[];
}) {
  const abcTotalProgramado = calcAbcTotalProgramado(identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo, tipologiasNovas);
  const abpProgramada = tipologiasNovas.reduce((s, t) => s + t.quantidade * t.abpUnidade, 0);
  const eficiencia = calcEficiencia(abpProgramada, abcTotalProgramado);
  const divergencia =
    identificacao.abpEstimada && tipologiasNovas.length > 0
      ? calcDivergenciaAbp(identificacao.abpEstimada, tipologiasNovas)
      : null;

  return (
    <>
      <Card title="Identificação do ativo">
        <Row>
          <FieldGroup label="Nome do projeto">
            <input className="input-dark" value={nome} onChange={(e) => setNome(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Tipo de projeto">
            <select className="input-dark" value={tipoProjeto} onChange={(e) => setTipoProjeto(e.target.value)}>
              {TIPOS_PROJETO.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>
          </FieldGroup>
          <FieldGroup label="Área do lote (m²)">
            <input
              type="number"
              className="input-dark"
              value={inputs.areaLote ?? ""}
              onChange={(e) => updateInput("areaLote", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
        </Row>
      </Card>

      <Card
        title="Localização"
        subtitle="Introduza o código postal — a rua, freguesia, concelho e distrito são sugeridos automaticamente, mas continuam editáveis."
      >
        <Row>
          <FieldGroup label="Código postal">
            <input
              className="input-dark"
              placeholder="0000-000"
              value={identificacao.codigoPostal}
              onChange={(e) => updateIdentificacao("codigoPostal", e.target.value)}
              onBlur={onCodigoPostalBlur}
            />
          </FieldGroup>
          <FieldGroup label="Rua">
            <input className="input-dark" value={identificacao.rua} onChange={(e) => updateIdentificacao("rua", e.target.value)} />
          </FieldGroup>
        </Row>
        {aLoadearCp && <p className="text-xs text-[#8FA6AF] mb-3">A procurar o código postal…</p>}
        {erroCp && <p className="text-xs text-[#A13D2E] mb-3">{erroCp}</p>}
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
          <FieldGroup label="Freguesia">
            <input
              className="input-dark"
              value={identificacao.freguesia}
              onChange={(e) => updateIdentificacao("freguesia", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Concelho">
            <input
              className="input-dark"
              value={identificacao.concelho}
              onChange={(e) => updateIdentificacao("concelho", e.target.value)}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Distrito">
            <input
              className="input-dark"
              value={identificacao.distrito}
              onChange={(e) => updateIdentificacao("distrito", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Localidade">
            <input
              className="input-dark"
              value={identificacao.localidade}
              onChange={(e) => updateIdentificacao("localidade", e.target.value)}
            />
          </FieldGroup>
        </Row>
      </Card>

      <Card
        title="Áreas do projeto"
        subtitle="ABC Total e eficiência são calculados automaticamente a partir destes valores e do programa de tipologias."
      >
        <Row>
          <FieldGroup label="ABC acima do solo (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abcAcimaSolo ?? ""}
              onChange={(e) => updateIdentificacao("abcAcimaSolo", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
          <FieldGroup label="ABC abaixo do solo (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abcAbaixoSolo ?? ""}
              onChange={(e) => updateIdentificacao("abcAbaixoSolo", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Área dependente estimada (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.areaDependenteEstimada ?? ""}
              onChange={(e) => updateIdentificacao("areaDependenteEstimada", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
          <FieldGroup label="ABP estimada (m²)">
            <input
              type="number"
              className="input-dark"
              value={identificacao.abpEstimada ?? ""}
              onChange={(e) => updateIdentificacao("abpEstimada", e.target.value ? Number(e.target.value) : null)}
            />
          </FieldGroup>
        </Row>
        <div className="flex gap-6 mt-2 text-sm">
          <div>
            <span className="text-xs text-[#59636A] block">ABC Total programado</span>
            <span className="font-semibold text-[#142B3A]">{abcTotalProgramado ? `${Math.round(abcTotalProgramado)} m²` : "—"}</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div>
            <FieldGroup label="Número de garagens/estacionamentos">
              <input
                type="number"
                min={0}
                className="input-dark mb-3"
                value={identificacao.numEstacionamentos}
                onChange={(e) => {
                  const n = Math.max(0, Number(e.target.value) || 0);
                  updateIdentificacao("numEstacionamentos", n);
                  updateIdentificacao("temGaragem", n > 0);
                }}
              />
            </FieldGroup>
          </div>
          <div>
            <FieldGroup label="Número de elevadores">
              <input
                type="number"
                min={0}
                className="input-dark mb-3"
                value={identificacao.numElevadores}
                onChange={(e) => {
                  const n = Math.max(0, Number(e.target.value) || 0);
                  updateIdentificacao("numElevadores", n);
                  updateIdentificacao("temElevador", n > 0);
                }}
              />
            </FieldGroup>
          </div>
          <CheckboxIdent
            label="Possui jardim ou áreas exteriores"
            checked={identificacao.temJardimExterior}
            onChange={(v) => updateIdentificacao("temJardimExterior", v)}
          />
          <CheckboxIdent label="Imóvel ocupado" checked={identificacao.imovelOcupado} onChange={(v) => updateIdentificacao("imovelOcupado", v)} />
        </div>
        <p className="text-xs text-[#8FA6AF] mt-2">
          Demolição é configurada como custo opcional. O enquadramento do licenciamento decorre do tipo de projeto.
        </p>
      </Card>
    </>
  );
}

// ============================================================
// Etapa 2 — Programa e vendas (tipologias + mapa de vendas)
// ============================================================
function StepPrograma({
  tipologiasNovas,
  identificacao,
  onAdicionarTipologiaNova,
  onAtualizarTipologiaNova,
  onRemoverTipologiaNova,
  sugestoes,
  onPedirSugestao,
  onAplicarSugestao,
  unidades,
  onSincronizarUnidades,
  onAtualizarUnidade,
  planoVendas,
  updatePlanoVendas,
  updateEstruturaRecebimentos,
  regrasPreco,
  onAdicionarRegraPreco,
  onAtualizarRegraPreco,
  onRemoverRegraPreco,
  onAplicarEvolucaoPrecos,
}: {
  tipologiasNovas: Typology[];
  identificacao: IdentificacaoEstruturada;
  onAdicionarTipologiaNova: () => void;
  onAtualizarTipologiaNova: (id: string, patch: Partial<Typology>) => void;
  onRemoverTipologiaNova: (id: string) => void;
  sugestoes: Record<string, { loading: boolean; resultado?: SugestaoPreco; erro?: boolean }>;
  onPedirSugestao: (t: Typology) => void;
  onAplicarSugestao: (id: string, precoM2: number) => void;
  unidades: UnidadeVenda[];
  onSincronizarUnidades: (t: Typology) => void;
  onAtualizarUnidade: (id: string, patch: Partial<UnidadeVenda>) => void;
  planoVendas: PlanoVendas;
  updatePlanoVendas: <K extends keyof PlanoVendas>(key: K, value: PlanoVendas[K]) => void;
  updateEstruturaRecebimentos: <K extends keyof PlanoVendas["estruturaRecebimentos"]>(key: K, value: PlanoVendas["estruturaRecebimentos"][K]) => void;
  regrasPreco: RegraEvolucaoPreco[];
  onAdicionarRegraPreco: () => void;
  onAtualizarRegraPreco: (id: string, patch: Partial<RegraEvolucaoPreco>) => void;
  onRemoverRegraPreco: (id: string) => void;
  onAplicarEvolucaoPrecos: () => void;
}) {
  const resumo = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const semLocalizacao = !identificacao.freguesia && !identificacao.concelho;
  // Sinal/reforços/escritura por unidade ficam num painel expansível, não em
  // colunas sempre visíveis — antes disso mostravam o mesmo texto repetido
  // linha após linha ("Fim de obra + prazo por defeito") sem acrescentar
  // nada a olhar para a tabela principal (feedback direto do utilizador).
  const [unidadeExpandidaId, setUnidadeExpandidaId] = useState<string | null>(null);
  const datasEfetivas = planoVendas.dataLancamentoComercial
    ? calcularDatasEfetivas(
        unidades.map((u) => ({ id: u.id, tipologiaId: u.tipologiaId, ordem: u.ordem, dataVenda: u.dataVenda, estadoComercial: u.estadoComercial })),
        tipologiasNovas.map((t) => ({ id: t.id, quantidade: t.quantidade, mesesParaPrimeiraVenda: t.mesesParaPrimeiraVenda, unidadesPorMes: t.unidadesPorMes })),
        planoVendas.dataLancamentoComercial
      )
    : new Map<string, string>();
  const comissaoSplitValido = Math.abs(planoVendas.comissaoPctPagoSinal + planoVendas.comissaoPctPagoEscritura - 1) < 0.001;
  const somaRecebimentos =
    planoVendas.estruturaRecebimentos.pctReserva +
    planoVendas.estruturaRecebimentos.pctCpcv +
    planoVendas.estruturaRecebimentos.pctDuranteConstrucao +
    planoVendas.estruturaRecebimentos.pctConclusao +
    planoVendas.estruturaRecebimentos.pctEscritura;
  const recebimentosValidos = validarEstruturaRecebimentos(planoVendas.estruturaRecebimentos);

  return (
    <>
      <Card
        title="Plano e velocidade de vendas"
        subtitle="A data de lançamento governa a curva, as datas projetadas da Sales Table, os sinais do CPCV, as comissões e o cash flow."
      >
        <Row>
          <FieldGroup label="Data de lançamento comercial">
            <input
              type="date"
              className="input-dark"
              value={planoVendas.dataLancamentoComercial}
              onChange={(e) => updatePlanoVendas("dataLancamentoComercial", e.target.value)}
            />
          </FieldGroup>
          <FieldGroup label="Comissão comercial (%)">
            <PercentInput value={planoVendas.comissaoMediacaoPct} onChange={(v) => updatePlanoVendas("comissaoMediacaoPct", v)} />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="IVA da comissão">
            <select
              className="input-dark"
              value={planoVendas.comissaoTaxaIva}
              onChange={(e) => updatePlanoVendas("comissaoTaxaIva", Number(e.target.value))}
            >
              <option value={0}>Sem IVA</option>
              <option value={0.06}>6%</option>
              <option value={0.23}>23%</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Comissão paga no sinal (%)">
            <PercentInput value={planoVendas.comissaoPctPagoSinal} onChange={(v) => updatePlanoVendas("comissaoPctPagoSinal", v)} />
          </FieldGroup>
          <FieldGroup label="Comissão paga na escritura (%)">
            <PercentInput value={planoVendas.comissaoPctPagoEscritura} onChange={(v) => updatePlanoVendas("comissaoPctPagoEscritura", v)} />
          </FieldGroup>
          <FieldGroup label="IVA recuperável da comissão (%)">
            <PercentInput value={planoVendas.comissaoIvaRecuperavelPct} onChange={(v) => updatePlanoVendas("comissaoIvaRecuperavelPct", v)} />
          </FieldGroup>
        </Row>
        {!comissaoSplitValido && (
          <p className="text-xs text-[#A13D2E] mt-2">A comissão paga no sinal e na escritura deve somar 100%.</p>
        )}
        <p className="text-xs text-[#59636A] mt-2">
          A comissão incide sobre o preço total da unidade. O sinal do CPCV entra no mês da venda; o saldo entra na escritura.
        </p>

        <div className="mt-5 pt-4 border-t border-[#E3DACB]">
          <p className="text-xs font-semibold text-[#142B3A] mb-3">Calendário e recebimentos comerciais</p>
          <Row>
            <FieldGroup label="Data prevista das escrituras">
              <input
                type="date"
                className="input-dark"
                value={planoVendas.dataEscritura}
                onChange={(e) => updatePlanoVendas("dataEscritura", e.target.value)}
              />
            </FieldGroup>
            <FieldGroup label="Cancelamentos estimados (%)">
              <PercentInput value={planoVendas.cancelamentosEstimadosPct} onChange={(v) => updatePlanoVendas("cancelamentosEstimadosPct", v)} />
            </FieldGroup>
            <FieldGroup label="Início da construção (derivado dos hard costs)">
              <input className="input-dark" value={planoVendas.dataInicioConstrucao || "—"} disabled />
            </FieldGroup>
            <FieldGroup label="Fim da construção (derivado dos hard costs)">
              <input className="input-dark" value={planoVendas.dataFimConstrucao || "—"} disabled />
            </FieldGroup>
          </Row>
          <Row>
            <FieldGroup label="Escritura de cada unidade: meses após fim de obra (sugestão por defeito)">
              <input
                type="number"
                min={0}
                className="input-dark"
                value={planoVendas.duracaoEscrituraAposObraMeses}
                onChange={(e) => updatePlanoVendas("duracaoEscrituraAposObraMeses", Math.max(0, Number(e.target.value) || 0))}
              />
            </FieldGroup>
          </Row>
          <p className="text-xs text-[#59636A] -mt-2 mb-2">
            Usado só para sugerir a data de escritura de cada unidade na Sales Table — sempre sobreponível linha a linha.
          </p>
          <p className="text-xs font-semibold text-[#142B3A] mt-3 mb-2">
            Estrutura de recebimentos — {Math.round(somaRecebimentos * 100)}%
            {!recebimentosValidos && <span className="text-[#A13D2E]"> (tem de somar 100%)</span>}
          </p>
          <Row>
            <FieldGroup label="Reserva (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctReserva} onChange={(v) => updateEstruturaRecebimentos("pctReserva", v)} />
            </FieldGroup>
            <FieldGroup label="CPCV / sinal (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctCpcv} onChange={(v) => updateEstruturaRecebimentos("pctCpcv", v)} />
            </FieldGroup>
            <FieldGroup label="Durante a construção (%)">
              <PercentInput
                value={planoVendas.estruturaRecebimentos.pctDuranteConstrucao}
                onChange={(v) => updateEstruturaRecebimentos("pctDuranteConstrucao", v)}
              />
            </FieldGroup>
            <FieldGroup label="Na conclusão (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctConclusao} onChange={(v) => updateEstruturaRecebimentos("pctConclusao", v)} />
            </FieldGroup>
            <FieldGroup label="Na escritura (%)">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctEscritura} onChange={(v) => updateEstruturaRecebimentos("pctEscritura", v)} />
            </FieldGroup>
          </Row>
        </div>
      </Card>

      <Card
        title="Programa de tipologias"
        subtitle="Cada alteração de quantidade sincroniza automaticamente a Sales Table abaixo — que é a única fonte do VGV."
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
                  <td className="flex gap-2">
                    <button onClick={() => onSincronizarUnidades(t)} className="text-[#B96343] text-xs font-semibold">
                      Sincronizar Sales Table
                    </button>
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
              <span className="text-xs text-[#59636A] block">Receita estimada (antes de gerar a Sales Table)</span>
              <span className="font-semibold text-[#142B3A]">€{Math.round(resumo.receitaTotal).toLocaleString("pt-PT")}</span>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Curva de vendas por tipologia"
        subtitle="Informa só meses e velocidade — o Landwise projeta a data de cada unidade, nunca fraciona uma unidade nem excede o stock."
      >
        {!planoVendas.dataLancamentoComercial && (
          <p className="text-xs text-[#B96343] mb-3">
            Preenche a data de lançamento comercial no bloco acima para ver a projeção de datas.
          </p>
        )}
        {tipologiasNovas.map((t) => {
          const agenda = planoVendas.dataLancamentoComercial
            ? gerarAgendaAbsorcao(t.quantidade, t.mesesParaPrimeiraVenda, t.unidadesPorMes, planoVendas.dataLancamentoComercial)
            : [];
          const resumoAbsorcao = calcResumoAbsorcao(agenda, t.quantidade);
          return (
            <div key={t.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
              <p className="text-xs font-semibold text-[#142B3A] mb-2">{t.nome}</p>
              <Row>
                <FieldGroup label="Meses após o lançamento para a primeira venda">
                  <input
                    type="number"
                    className="input-dark"
                    value={t.mesesParaPrimeiraVenda}
                    onChange={(e) => onAtualizarTipologiaNova(t.id, { mesesParaPrimeiraVenda: Number(e.target.value) })}
                  />
                </FieldGroup>
                <FieldGroup label="Unidades vendidas por mês">
                  <input
                    type="number"
                    step="0.1"
                    className="input-dark"
                    value={t.unidadesPorMes}
                    onChange={(e) => onAtualizarTipologiaNova(t.id, { unidadesPorMes: Number(e.target.value) })}
                  />
                </FieldGroup>
              </Row>
              {resumoAbsorcao.length > 0 && (
                <div className="mt-2 text-xs text-[#59636A]">
                  <p>
                    Última venda projetada: <strong className="text-[#142B3A]">{resumoAbsorcao[resumoAbsorcao.length - 1].mes}</strong> ·
                    Duração da absorção: <strong className="text-[#142B3A]">{resumoAbsorcao.length} meses</strong>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card
        title="Evolução de preços"
        subtitle="Desconto no lançamento, aumentos por tempo ou por % vendido — geral ou por tipologia. Nunca altera unidades já vendidas, bloqueadas ou com override manual."
      >
        {regrasPreco.map((r) => (
          <div key={r.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
            <Row>
              <FieldGroup label="Âmbito">
                <select
                  className="input-dark"
                  value={r.escopo.tipo === "tipologia" ? r.escopo.tipologiaId : "geral"}
                  onChange={(e) =>
                    onAtualizarRegraPreco(r.id, {
                      escopo: e.target.value === "geral" ? { tipo: "geral" } : { tipo: "tipologia", tipologiaId: e.target.value },
                    })
                  }
                >
                  <option value="geral">Geral (todas as tipologias)</option>
                  {tipologiasNovas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Gatilho">
                <select
                  className="input-dark"
                  value={r.gatilho}
                  onChange={(e) => onAtualizarRegraPreco(r.id, { gatilho: e.target.value as TipoGatilhoPreco })}
                >
                  <option value="meses_apos_lancamento">Meses após o lançamento</option>
                  <option value="data">Data específica</option>
                  <option value="pct_vendido_projeto">% do projeto vendido</option>
                  <option value="pct_vendido_tipologia">% da tipologia vendido</option>
                </select>
              </FieldGroup>
            </Row>
            <Row>
              {r.gatilho === "data" ? (
                <FieldGroup label="Data do gatilho">
                  <input
                    type="date"
                    className="input-dark"
                    value={r.valorGatilhoData ?? ""}
                    onChange={(e) => onAtualizarRegraPreco(r.id, { valorGatilhoData: e.target.value })}
                  />
                </FieldGroup>
              ) : r.gatilho === "meses_apos_lancamento" ? (
                <FieldGroup label="Meses após o lançamento">
                  <input
                    type="number"
                    className="input-dark"
                    value={r.valorGatilhoNumero ?? 0}
                    onChange={(e) => onAtualizarRegraPreco(r.id, { valorGatilhoNumero: Number(e.target.value) })}
                  />
                </FieldGroup>
              ) : (
                <FieldGroup label="% vendido (gatilho)">
                  <PercentInput value={r.valorGatilhoNumero ?? 0} onChange={(v) => onAtualizarRegraPreco(r.id, { valorGatilhoNumero: v })} />
                </FieldGroup>
              )}
              <FieldGroup label="Ajuste de preço (%)">
                <PercentInput value={r.ajustePct} onChange={(v) => onAtualizarRegraPreco(r.id, { ajustePct: v })} />
              </FieldGroup>
              <FieldGroup label="Modo">
                <select
                  className="input-dark"
                  value={r.modo}
                  onChange={(e) => onAtualizarRegraPreco(r.id, { modo: e.target.value as "cumulativo" | "substituicao" })}
                >
                  <option value="cumulativo">Cumulativo (soma-se às anteriores)</option>
                  <option value="substituicao">Substituição (ignora as anteriores)</option>
                </select>
              </FieldGroup>
            </Row>
            <div className="flex justify-end">
              <button onClick={() => onRemoverRegraPreco(r.id)} className="text-[#A13D2E] text-xs">
                Remover regra
              </button>
            </div>
          </div>
        ))}
        <div className="flex gap-3 items-center">
          <button onClick={onAdicionarRegraPreco} className="text-[#B96343] text-sm font-semibold">
            + Adicionar regra
          </button>
          {regrasPreco.length > 0 && (
            <button onClick={onAplicarEvolucaoPrecos} className="text-xs px-3 py-1.5 rounded-lg bg-[#142B3A] text-white font-semibold">
              Aplicar evolução de preços à Sales Table
            </button>
          )}
        </div>
      </Card>

      <Card
        title="Sales Table"
        subtitle="Uma linha por unidade real. É a única fonte do VGV — nenhum outro ecrã soma preços de tipologias para chegar a este valor."
      >
        {unidades.length === 0 && (
          <p className="text-xs text-[#8FA6AF] mb-3">
            Ainda sem unidades. Clica em &quot;Sincronizar Sales Table&quot; em cada tipologia acima para gerar as unidades.
          </p>
        )}
        {tipologiasNovas.map((tipologia) => {
          const unidadesDaTipologia = salesTableDaTipologia(unidades, tipologiasNovas, tipologia.id);
          if (unidadesDaTipologia.length === 0) return null;
          return (
            <div key={tipologia.id} className="mb-5">
              <p className="text-xs font-semibold text-[#142B3A] mb-2">{tipologia.nome}</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[#59636A] uppercase">
                    <th className="pb-1 pr-2">Bloco</th>
                    <th className="pb-1 pr-2">Piso</th>
                    <th className="pb-1 pr-2">Área vendável</th>
                    <th className="pb-1 pr-2">Prémio/desconto</th>
                    <th className="pb-1 pr-2">Override manual</th>
                    <th className="pb-1 pr-2">Preço final</th>
                    <th className="pb-1 pr-2">Estado</th>
                    <th className="pb-1 pr-2">Data venda</th>
                    <th className="pb-1 pr-2">Escritura</th>
                  </tr>
                </thead>
                <tbody>
                  {unidadesDaTipologia.map((u) => {
                    const validacaoEscritura = validarEscrituraUnidade(u, u.precoFinal);
                    const valorEscritura = calcValorEscrituraUnidade(u, u.precoFinal);
                    const dataEscrituraDefeito = calcDataEscrituraDefeito(planoVendas.dataFimConstrucao, planoVendas.duracaoEscrituraAposObraMeses);
                    const expandida = unidadeExpandidaId === u.id;
                    return (
                    <Fragment key={u.id}>
                    <tr className="border-t border-[#E3DACB]">
                      <td className="py-1 pr-2">
                        <input className="input-dark w-20" value={u.bloco ?? ""} onChange={(e) => onAtualizarUnidade(u.id, { bloco: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2">
                        <input className="input-dark w-16" value={u.piso ?? ""} onChange={(e) => onAtualizarUnidade(u.id, { piso: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2 text-[#59636A]">{Math.round(u.areaVendavel)} m²</td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          className="input-dark w-24"
                          value={u.premioDescontoUnidade}
                          onChange={(e) => onAtualizarUnidade(u.id, { premioDescontoUnidade: Number(e.target.value) })}
                          disabled={u.estadoComercial !== "disponivel"}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="number"
                          className="input-dark w-24"
                          placeholder="—"
                          value={u.overrideManualValor ?? ""}
                          onChange={(e) => onAtualizarUnidade(u.id, { overrideManualValor: e.target.value ? Number(e.target.value) : null })}
                          disabled={u.estadoComercial !== "disponivel"}
                        />
                      </td>
                      <td className="py-1 pr-2 font-semibold text-[#142B3A]">€{Math.round(u.precoFinal).toLocaleString("pt-PT")}</td>
                      <td className="py-1 pr-2">
                        <span
                          className={
                            u.estadoComercial === "disponivel"
                              ? "text-[#59636A]"
                              : u.estadoComercial === "vendido" || u.estadoComercial === "escriturado"
                                ? "text-[#4E7A5C] font-semibold"
                                : "text-[#B96343]"
                          }
                        >
                          {u.estadoComercial}
                        </span>
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="date"
                          className="input-dark"
                          value={u.dataVenda ?? datasEfetivas.get(u.id) ?? ""}
                          onChange={(e) => onAtualizarUnidade(u.id, { dataVenda: e.target.value || null })}
                          disabled={u.estadoComercial === "escriturado"}
                        />
                        <span className="block text-[10px] text-[#59636A] mt-1">
                          {u.dataVenda ? "Override manual" : datasEfetivas.has(u.id) ? "Calculada pela curva" : "Preencha o lançamento e a curva"}
                        </span>
                      </td>
                      <td className="py-1 pr-2">
                        <button
                          onClick={() => setUnidadeExpandidaId(expandida ? null : u.id)}
                          className={`text-[10px] px-2 py-1 rounded-full border ${
                            validacaoEscritura.valido ? "border-[#E3DACB] text-[#59636A]" : "border-[#A13D2E] text-[#A13D2E] font-semibold"
                          } hover:border-[#B96343]`}
                        >
                          {expandida ? "Fechar ▲" : validacaoEscritura.valido ? "Detalhe ▾" : "Ver erro ▾"}
                        </button>
                      </td>
                    </tr>
                    {expandida && (
                      <tr className="bg-[#F5F0E6]">
                        <td colSpan={9} className="p-3">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <FieldGroup label="Sinal">
                              <NumeroInput value={u.sinalValor} onChange={(v) => onAtualizarUnidade(u.id, { sinalValor: v })} />
                            </FieldGroup>
                            <FieldGroup label="Reforços">
                              <NumeroInput value={u.reforcosValor} onChange={(v) => onAtualizarUnidade(u.id, { reforcosValor: v })} />
                            </FieldGroup>
                            <FieldGroup label="Escritura (residual)">
                              <input className="input-dark" disabled value={`€${Math.round(valorEscritura).toLocaleString("pt-PT")}`} />
                            </FieldGroup>
                            <FieldGroup label="Data escritura">
                              <input
                                type="date"
                                className="input-dark"
                                value={u.dataEscritura ?? dataEscrituraDefeito ?? ""}
                                onChange={(e) => onAtualizarUnidade(u.id, { dataEscritura: e.target.value || null })}
                              />
                            </FieldGroup>
                          </div>
                          <p className={`text-[10px] mt-2 ${validacaoEscritura.valido ? "text-[#59636A]" : "text-[#A13D2E] font-semibold"}`}>
                            {!validacaoEscritura.valido
                              ? validacaoEscritura.erro
                              : u.dataEscritura
                                ? "Data de escritura: override manual."
                                : dataEscrituraDefeito
                                  ? "Data de escritura: fim de obra + prazo por defeito."
                                  : "Preencha o fim de obra para sugerir a data de escritura."}
                          </p>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        {unidades.length > 0 && (
          <div className="pt-4 border-t border-[#E3DACB] text-sm">
            <span className="text-xs text-[#59636A] block">VGV Bruto (fonte única — soma real da Sales Table)</span>
            <span className="font-bold text-lg text-[#142B3A]">
              €{Math.round(calcVgvBruto(resolverSalesTable(unidades, tipologiasNovas))).toLocaleString("pt-PT")}
            </span>
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
  { grupo: "aquisicao", titulo: "Aquisição", sugestoes: [] },
  { grupo: "hard_cost", titulo: "Hard costs", sugestoes: ["Jardinagem e exteriores", "Demolição", "Infraestruturas", "Ligações", "Equipamentos"] },
  { grupo: "soft_cost", titulo: "Soft costs", sugestoes: ["Especialidades", "Seguros"] },
  { grupo: "outro", titulo: "Outros custos", sugestoes: ["Branding", "Outro"] },
];

const TIPOS_CALCULO_CUSTO: { value: LinhaCusto["tipoCalculo"]; label: string }[] = [
  { value: "valor_fixo", label: "Valor fixo (€)" },
  { value: "valor_mensal", label: "Valor mensal (€/mês)" },
  { value: "percentagem_aquisicao", label: "% da aquisição" },
  { value: "percentagem_hard_costs", label: "% dos hard costs" },
  { value: "percentagem_capex", label: "% do capex" },
  { value: "percentagem_custo_total", label: "% do custo total" },
  { value: "eur_m2_abc_acima", label: "€/m² de ABC acima do solo" },
  { value: "eur_m2_abc_abaixo", label: "€/m² de ABC abaixo do solo" },
  { value: "eur_m2_abd", label: "€/m² de ABD (área dependente)" },
  { value: "eur_m2_abc_principal", label: "€/m² de ABC (sem ABD)" },
  { value: "eur_m2_abc_total", label: "€/m² de ABC Total (com ABD)" },
  { value: "eur_unidade", label: "€/unidade" },
];

/** Base automática por nome (secção 21 do plano) — nunca obriga o utilizador a escolher manualmente para as 3 linhas de construção principais. */
const BASE_AUTOMATICA_POR_NOME: Record<string, LinhaCusto["tipoCalculo"]> = {
  "Construção acima do solo": "eur_m2_abc_acima",
  "Construção abaixo do solo": "eur_m2_abc_abaixo",
  "Construção dependente": "eur_m2_abd",
};

const PERFIS_DESEMBOLSO: { value: LinhaCusto["perfilDesembolso"]; label: string }[] = [
  { value: "unico_inicio", label: "Único no início" },
  { value: "unico_fim", label: "Único no fim" },
  { value: "linear", label: "Linear" },
  { value: "curva_s", label: "Curva S" },
  { value: "front_loaded", label: "Front-loaded" },
  { value: "back_loaded", label: "Back-loaded" },
];

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

const NOMES_CUSTOS_FIXOS = new Set(CUSTOS_PADRAO.map((c) => c.nome));

function StepAquisicaoCustos({
  custosNovos,
  identificacao,
  tipologiasNovas,
  inputs,
  updateInput,
  onAdicionarCusto,
  onAtualizarCusto,
  onRemoverCusto,
}: {
  custosNovos: LinhaCusto[];
  identificacao: IdentificacaoEstruturada;
  tipologiasNovas: Typology[];
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(key: K, value: ProjectInputs[K]) => void;
  onAdicionarCusto: (grupo: GrupoCusto, nome: string) => void;
  onAtualizarCusto: (id: string, patch: Partial<LinhaCusto>) => void;
  onRemoverCusto: (id: string) => void;
}) {
  const resumoProgramaLocal = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const contexto: ContextoCusto = {
    valorAquisicao: inputs.custoTerreno || 0,
    abcAcimaSolo: identificacao.abcAcimaSolo ?? 0,
    abcAbaixoSolo: identificacao.abcAbaixoSolo ?? 0,
    abdTotal: resumoProgramaLocal.areaDependenteTotal,
    numeroUnidades: tipologiasNovas.reduce((soma, t) => soma + t.quantidade, 0),
  };
  const resolvidas = resolverCustos(custosNovos, contexto);
  const resumo = agregarCustos(resolvidas);
  const custoPorNome = (nome: string) => custosNovos.find((c) => c.nome === nome);
  const reforcos = custosNovos.filter((c) => c.grupo === "aquisicao" && c.nome.startsWith("Reforço da aquisição"));
  const somaReforcos = reforcos.reduce((soma, c) => soma + c.valorInput, 0);
  const sinalValor = Math.max(0, (inputs.custoTerreno || 0) * (inputs.sinalAquisicaoPct || 0));
  const valorEscritura = Math.max(0, (inputs.custoTerreno || 0) - sinalValor - somaReforcos);
  const dataEscrituraCalculada = inputs.dataEscrituraAquisicao || adicionarMesesData(inputs.dataSinalAquisicao, inputs.duracaoAteEscrituraMeses);

  function atualizarLinha(nome: string, patch: Partial<LinhaCusto>) {
    const c = custoPorNome(nome);
    if (c) onAtualizarCusto(c.id, patch);
  }

  function sincronizarAquisicao(patchInputs: Partial<ProjectInputs>) {
    const proximo = { ...inputs, ...patchInputs };
    const sinal = Math.max(0, (proximo.custoTerreno || 0) * (proximo.sinalAquisicaoPct || 0));
    const dataEscritura = proximo.dataEscrituraAquisicao || adicionarMesesData(proximo.dataSinalAquisicao, proximo.duracaoAteEscrituraMeses);
    const residual = Math.max(0, (proximo.custoTerreno || 0) - sinal - somaReforcos);
    atualizarLinha("Sinal da aquisição", {
      valorInput: sinal,
      dataInicial: proximo.dataSinalAquisicao || null,
      dataFinal: proximo.dataSinalAquisicao || null,
      duracaoMeses: 1,
      perfilDesembolso: "unico_inicio",
    });
    atualizarLinha("Escritura da aquisição", {
      valorInput: residual,
      dataInicial: dataEscritura || null,
      dataFinal: dataEscritura || null,
      duracaoMeses: 1,
      perfilDesembolso: "unico_inicio",
    });
    ["Notário", "Registos", "IMT", "Imposto do selo", "Comissão de aquisição", "Outros custos de aquisição"].forEach((nome) => {
      const linha = custoPorNome(nome);
      if (linha && !linha.dataInicial) {
        onAtualizarCusto(linha.id, { dataInicial: dataEscritura || null, dataFinal: dataEscritura || null, duracaoMeses: 1, perfilDesembolso: "unico_inicio" });
      }
    });
  }

  function alterarInput<K extends keyof ProjectInputs>(key: K, value: ProjectInputs[K]) {
    updateInput(key, value);
    sincronizarAquisicao({ [key]: value } as Partial<ProjectInputs>);
  }

  function handleData(custo: LinhaCusto, dataInicial: string, duracaoMeses: number) {
    const dataFinal = dataInicial && duracaoMeses > 0 ? calcDataFinal(dataInicial, duracaoMeses) : null;
    onAtualizarCusto(custo.id, { dataInicial: dataInicial || null, duracaoMeses: duracaoMeses || null, dataFinal });
  }

  const [imtTipoImovel, setImtTipoImovel] = useState<TipoImovelImt>("outro_urbano_ou_terreno_construcao");
  const [imtRegiaoAutonoma, setImtRegiaoAutonoma] = useState(false);
  const [imtJovem, setImtJovem] = useState(false);
  const [imtOffshore, setImtOffshore] = useState(false);
  const imtCalculado = calcularImt({ tipoImovel: imtTipoImovel, valor: inputs.custoTerreno || 0, regiaoAutonoma: imtRegiaoAutonoma, jovemAte35: imtJovem, offshore: imtOffshore });

  function aplicarImtCalculado() {
    atualizarLinha("IMT", { valorInput: Math.round(imtCalculado.imt * 100) / 100 });
    atualizarLinha("Imposto do selo", { valorInput: Math.round(imtCalculado.impostoSelo * 100) / 100 });
  }

  function renderLinhaAquisicaoCompacta(c: LinhaCusto) {
    return (
      <div key={c.id} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-3 items-end border-b border-[#E3DACB] py-3 last:border-b-0">
        <FieldGroup label="Custo">
          <input className="input-dark" value={c.nome} disabled />
        </FieldGroup>
        <FieldGroup label="Valor (€)">
          <NumeroInput
            value={c.valorInput}
            onChange={(v) => onAtualizarCusto(c.id, { valorInput: v, tipoCalculo: "valor_fixo", taxaIva: null, ivaRecuperavelPct: 0 })}
          />
        </FieldGroup>
        <FieldGroup label="Data">
          <input
            type="date"
            className="input-dark"
            value={c.dataInicial ?? ""}
            onChange={(e) =>
              onAtualizarCusto(c.id, {
                dataInicial: e.target.value || null,
                dataFinal: e.target.value || null,
                duracaoMeses: 1,
                perfilDesembolso: "unico_inicio",
              })
            }
          />
        </FieldGroup>
      </div>
    );
  }

  function renderLinhaCusto(c: LinhaCusto, opcoes: { mostrarIva?: boolean } = {}) {
    const fixa = NOMES_CUSTOS_FIXOS.has(c.nome);
    const mensal = c.tipoCalculo === "valor_mensal";
    const mostrarIva = opcoes.mostrarIva ?? true;
    return (
      <div key={c.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
        <Row>
          <FieldGroup label="Nome">
            <input className="input-dark" value={c.nome} disabled={fixa} onChange={(e) => onAtualizarCusto(c.id, { nome: e.target.value })} />
          </FieldGroup>
          <FieldGroup label="Tipo de cálculo">
            <select
              className="input-dark"
              value={c.tipoCalculo}
              disabled={["Construção acima do solo", "Construção abaixo do solo", "Construção dependente", "Fiscalização de obra"].includes(c.nome)}
              onChange={(e) => onAtualizarCusto(c.id, { tipoCalculo: e.target.value as LinhaCusto["tipoCalculo"] })}
            >
              {TIPOS_CALCULO_CUSTO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label={mensal ? "Valor por mês" : c.tipoCalculo.startsWith("percentagem") ? "Percentagem" : "Valor"}>
            {c.tipoCalculo.startsWith("percentagem") ? (
              <PercentInput value={c.valorInput} onChange={(v) => onAtualizarCusto(c.id, { valorInput: v })} />
            ) : (
              <NumeroInput value={c.valorInput} onChange={(v) => onAtualizarCusto(c.id, { valorInput: v })} />
            )}
          </FieldGroup>
        </Row>
        <Row>
          {mostrarIva && (
            <>
              <FieldGroup label="Taxa de IVA">
                <select className="input-dark" value={c.taxaIva ?? ""} onChange={(e) => onAtualizarCusto(c.id, { taxaIva: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Sem IVA</option><option value={0.06}>6%</option><option value={0.13}>13%</option><option value={0.23}>23%</option>
                </select>
              </FieldGroup>
              <FieldGroup label="% de IVA recuperável"><PercentInput value={c.ivaRecuperavelPct} onChange={(v) => onAtualizarCusto(c.id, { ivaRecuperavelPct: v })} /></FieldGroup>
            </>
          )}
          <FieldGroup label="Perfil de desembolso">
            <select className="input-dark" value={c.perfilDesembolso} onChange={(e) => onAtualizarCusto(c.id, { perfilDesembolso: e.target.value as LinhaCusto["perfilDesembolso"] })}>
              {PERFIS_DESEMBOLSO.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Data inicial"><input type="date" className="input-dark" value={c.dataInicial ?? ""} disabled={c.nome === "Fiscalização de obra"} onChange={(e) => handleData(c, e.target.value, c.duracaoMeses ?? 1)} /></FieldGroup>
          <FieldGroup label="Duração (meses)"><input type="number" className="input-dark" value={c.duracaoMeses ?? ""} disabled={c.nome === "Fiscalização de obra"} onChange={(e) => handleData(c, c.dataInicial ?? "", Number(e.target.value))} /></FieldGroup>
          <FieldGroup label="Data final (calculada)"><input type="date" className="input-dark" value={c.dataFinal ?? ""} disabled /></FieldGroup>
        </Row>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-[#59636A]">Valor resolvido: €{Math.round(resolvidas.find((r) => r.id === c.id)?.valorResolvido ?? 0).toLocaleString("pt-PT")}</span>
          {!fixa && <button onClick={() => onRemoverCusto(c.id)} className="text-[#A13D2E] text-xs">Remover</button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <Card title="Aquisição" subtitle={`Subtotal: €${Math.round(resumo.totalAquisicao).toLocaleString("pt-PT")}. A aquisição é preenchida aqui e não na Identificação.`}>
        <Row>
          <FieldGroup label="Preço total"><NumeroInput value={inputs.custoTerreno || 0} onChange={(v) => alterarInput("custoTerreno", v)} /></FieldGroup>
          <FieldGroup label="Sinal (%)"><PercentInput value={inputs.sinalAquisicaoPct} onChange={(v) => alterarInput("sinalAquisicaoPct", v)} /></FieldGroup>
          <FieldGroup label="Valor do sinal"><input className="input-dark" value={`€${Math.round(sinalValor).toLocaleString("pt-PT")}`} disabled /></FieldGroup>
          <FieldGroup label="Data do sinal"><input type="date" className="input-dark" value={inputs.dataSinalAquisicao} onChange={(e) => alterarInput("dataSinalAquisicao", e.target.value)} /></FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Tempo até à escritura (meses)"><input type="number" className="input-dark" value={inputs.duracaoAteEscrituraMeses} onChange={(e) => { const meses = Number(e.target.value); updateInput("dataEscrituraAquisicao", ""); alterarInput("duracaoAteEscrituraMeses", meses); }} /></FieldGroup>
          <FieldGroup label="Data da escritura">
            <input type="date" className="input-dark" value={dataEscrituraCalculada} onChange={(e) => { const data = e.target.value; updateInput("dataEscrituraAquisicao", data); updateInput("duracaoAteEscrituraMeses", diferencaMesesDatas(inputs.dataSinalAquisicao, data)); sincronizarAquisicao({ dataEscrituraAquisicao: data, duracaoAteEscrituraMeses: diferencaMesesDatas(inputs.dataSinalAquisicao, data) }); }} />
          </FieldGroup>
          <FieldGroup label="Reforços"><input className="input-dark" value={`€${Math.round(somaReforcos).toLocaleString("pt-PT")}`} disabled /></FieldGroup>
          <FieldGroup label="Valor residual da escritura"><input className="input-dark" value={`€${Math.round(valorEscritura).toLocaleString("pt-PT")}`} disabled /></FieldGroup>
        </Row>
        {sinalValor + somaReforcos > (inputs.custoTerreno || 0) && <p className="text-xs text-[#A13D2E]">Sinal e reforços não podem ultrapassar o preço de aquisição.</p>}

        {reforcos.map((c, idx) => (
          <div key={c.id} className="grid grid-cols-4 gap-3 border-t border-[#E3DACB] pt-3 mt-3">
            <FieldGroup label={`Reforço ${idx + 1} (€)`}><NumeroInput value={c.valorInput} onChange={(novoValor) => {
              onAtualizarCusto(c.id, { valorInput: novoValor });
              atualizarLinha("Escritura da aquisição", { valorInput: Math.max(0, (inputs.custoTerreno || 0) - sinalValor - (somaReforcos - c.valorInput + novoValor)) });
            }} /></FieldGroup>
            <FieldGroup label="Data"><input type="date" className="input-dark" value={c.dataInicial ?? ""} onChange={(e) => onAtualizarCusto(c.id, { dataInicial: e.target.value || null, dataFinal: e.target.value || null, duracaoMeses: 1, perfilDesembolso: "unico_inicio" })} /></FieldGroup>
            <FieldGroup label="% do preço"><input className="input-dark" value={`${inputs.custoTerreno > 0 ? ((c.valorInput / inputs.custoTerreno) * 100).toFixed(2) : "0.00"}%`} disabled /></FieldGroup>
            <div className="flex items-end"><button className="text-[#A13D2E] text-xs pb-2" onClick={() => {
              atualizarLinha("Escritura da aquisição", { valorInput: Math.max(0, (inputs.custoTerreno || 0) - sinalValor - (somaReforcos - c.valorInput)) });
              onRemoverCusto(c.id);
            }}>Remover reforço</button></div>
          </div>
        ))}
        <button onClick={() => onAdicionarCusto("aquisicao", `Reforço da aquisição ${reforcos.length + 1}`)} className="text-[#B96343] text-sm font-semibold mt-3">+ Adicionar reforço</button>

        <details className="mt-5 pt-4 border-t border-[#E3DACB]">
          <summary className="cursor-pointer text-xs font-semibold text-[#142B3A]">Calcular IMT e Imposto do Selo assistidamente</summary>
          <div className="mt-3">
            <Row>
              <FieldGroup label="Tipo de imóvel">
                <select className="input-dark" value={imtTipoImovel} onChange={(e) => setImtTipoImovel(e.target.value as TipoImovelImt)}>
                  <option value="outro_urbano_ou_terreno_construcao">Terreno para construção / outro prédio urbano</option>
                  <option value="habitacao_propria_permanente">Habitação própria e permanente</option>
                  <option value="habitacao_secundaria_ou_arrendamento">Habitação secundária / arrendamento</option>
                  <option value="predio_rustico">Prédio rústico</option>
                </select>
              </FieldGroup>
              <FieldGroup label="Região">
                <select className="input-dark" value={imtRegiaoAutonoma ? "ra" : "continente"} onChange={(e) => setImtRegiaoAutonoma(e.target.value === "ra")}>
                  <option value="continente">Portugal Continental</option>
                  <option value="ra">Região Autónoma (Açores/Madeira)</option>
                </select>
              </FieldGroup>
            </Row>
            <Row>
              <label className="flex items-center gap-2 text-xs text-[#59636A]">
                <input
                  type="checkbox"
                  checked={imtJovem}
                  disabled={imtTipoImovel !== "habitacao_propria_permanente"}
                  onChange={(e) => setImtJovem(e.target.checked)}
                />
                Adquirente jovem até 35 anos (só HPP)
              </label>
              <label className="flex items-center gap-2 text-xs text-[#59636A]">
                <input type="checkbox" checked={imtOffshore} onChange={(e) => setImtOffshore(e.target.checked)} />
                Adquirente offshore (paraíso fiscal — taxa agravada de 10%)
              </label>
            </Row>
            <div className="text-xs text-[#142B3A] mt-2 space-y-1">
              <p>{imtCalculado.escalaoDescricao}</p>
              <p>IMT: €{imtCalculado.imt.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} · Imposto do selo (0,8%): €{imtCalculado.impostoSelo.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} · Total: €{imtCalculado.total.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-[#59636A]">Fonte: {FONTE_TABELAS_IMT}. Sugestão calculada sobre o preço de aquisição introduzido acima — confirma sempre o VPT antes da escritura, pois o IMT incide sobre o maior dos dois valores.</p>
            </div>
            <button onClick={aplicarImtCalculado} className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343] mt-2">
              Aplicar às linhas &quot;IMT&quot; e &quot;Imposto do selo&quot;
            </button>
          </div>
        </details>

        <div className="mt-5 pt-4 border-t border-[#E3DACB]">
          <p className="text-xs font-semibold text-[#142B3A] mb-3">Custos de aquisição</p>
          {custosNovos
            .filter((c) => c.grupo === "aquisicao" && !["Sinal da aquisição", "Escritura da aquisição"].includes(c.nome) && !c.nome.startsWith("Reforço da aquisição"))
            .map(renderLinhaAquisicaoCompacta)}
        </div>
      </Card>

      {GRUPOS_CUSTO.filter((g) => g.grupo !== "aquisicao").map(({ grupo, titulo, sugestoes }) => {
        const linhasDoGrupo = custosNovos.filter((c) => c.grupo === grupo);
        const subtotal = grupo === "hard_cost" ? resumo.totalHardCosts : grupo === "soft_cost" ? resumo.totalSoftCosts : resumo.totalOutros;
        const sugestoesOpcionais = sugestoes.filter((nome) => !NOMES_CUSTOS_FIXOS.has(nome) && !linhasDoGrupo.some((c) => c.nome === nome));
        return (
          <Card key={grupo} title={titulo} subtitle={`Subtotal: €${Math.round(subtotal).toLocaleString("pt-PT")}`}>
            {linhasDoGrupo.map((c) => renderLinhaCusto(c))}
            <div className="flex flex-wrap gap-2 mt-2">
              {sugestoesOpcionais.map((nome) => <button key={nome} onClick={() => onAdicionarCusto(grupo, nome)} className="text-xs px-2.5 py-1 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]">+ {nome}</button>)}
              <button onClick={() => onAdicionarCusto(grupo, "Nova linha")} className="text-xs px-2.5 py-1 rounded-full border border-dashed border-[#B96343] text-[#B96343]">+ Linha personalizada</button>
            </div>
          </Card>
        );
      })}

      <Card title="Resumo de custos e IVA">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-xs text-[#59636A] block">Custo total</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.custoTotal).toLocaleString("pt-PT")}</span></div>
          <div><span className="text-xs text-[#59636A] block">IVA suportado</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaSuportadoTotal).toLocaleString("pt-PT")}</span></div>
          <div><span className="text-xs text-[#59636A] block">IVA recuperável</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaRecuperavelTotal).toLocaleString("pt-PT")}</span></div>
          <div><span className="text-xs text-[#59636A] block">IVA não recuperável</span><span className="font-semibold text-[#142B3A]">€{Math.round(resumo.ivaNaoRecuperavelTotal).toLocaleString("pt-PT")}</span></div>
        </div>
      </Card>
    </>
  );
}

// Gráfico SVG simples, sem dependências externas: saldo de caixa acumulado
// (linha) + cash flow levered mensal (barras positivas/negativas).

function StepFinanciamento({
  financiamento,
  onToggleComFinanciamento,
  updateFinanciamento,
  reservaMinima,
}: {
  financiamento: ParametrosFinanciamento;
  onToggleComFinanciamento: (v: boolean) => void;
  updateFinanciamento: <K extends keyof ParametrosFinanciamento>(k: K, v: ParametrosFinanciamento[K]) => void;
  reservaMinima: ReturnType<typeof calcularReservaMinimaCustos>;
}) {
  const desativado = !financiamento.comFinanciamento;
  const [euriborCarregando, setEuriborCarregando] = useState(false);
  const [euriborErro, setEuriborErro] = useState<string | null>(null);

  async function atualizarEuribor(tenor: "6m" | "12m") {
    setEuriborCarregando(true);
    setEuriborErro(null);
    try {
      const resp = await fetch(`/api/financiamento/euribor?tenor=${tenor}`);
      const dados = await resp.json();
      if (dados.sucesso) {
        updateFinanciamento("euribor", dados.taxa);
        updateFinanciamento("euriborOrigem", tenor);
        updateFinanciamento("euriborDataReferencia", dados.dataReferencia);
        updateFinanciamento("euriborFonte", dados.fonte);
      } else {
        setEuriborErro(dados.erro);
      }
    } catch {
      setEuriborErro("Não foi possível ligar ao BCE. Preenche a taxa manualmente.");
    } finally {
      setEuriborCarregando(false);
    }
  }

  return (
    <>
      <Card title="Financiamento bancário">
        <Row>
          <FieldGroup label="Este projeto terá financiamento bancário?">
            <select
              className="input-dark"
              value={financiamento.comFinanciamento ? "sim" : "nao"}
              onChange={(e) => onToggleComFinanciamento(e.target.value === "sim")}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FieldGroup>
        </Row>
        {desativado && (
          <p className="text-xs text-[#59636A] mb-3">
            Sem financiamento bancário: dívida, juros, fees e imposto de selo ficam a €0. O funding passa a ser só equity + recebimentos de clientes.
          </p>
        )}

        <Row>
          <FieldGroup label="% dos hard costs financiada">
            <PercentInput
              value={financiamento.percentagemHardCostsFinanciada}
              onChange={(v) => updateFinanciamento("percentagemHardCostsFinanciada", v)}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="% da aquisição financiada">
            <PercentInput
              value={financiamento.percentagemAquisicaoFinanciada}
              onChange={(v) => updateFinanciamento("percentagemAquisicaoFinanciada", v)}
              disabled={desativado}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Euribor">
            <PercentInput
              value={financiamento.euribor}
              onChange={(v) => {
                updateFinanciamento("euribor", v);
                updateFinanciamento("euriborOrigem", "manual");
                updateFinanciamento("euriborDataReferencia", null);
                updateFinanciamento("euriborFonte", null);
              }}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Spread">
            <PercentInput value={financiamento.spread} onChange={(v) => updateFinanciamento("spread", v)} disabled={desativado} />
          </FieldGroup>
          <FieldGroup label="Taxa anual (calculada)">
            <input className="input-dark" value={`${(taxaAnual(financiamento) * 100).toFixed(2)}%`} disabled />
          </FieldGroup>
        </Row>
        {!desativado && (
          <Row>
            <div>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => atualizarEuribor("6m")}
                  disabled={euriborCarregando}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343] disabled:opacity-50"
                >
                  {euriborCarregando ? "A obter…" : "Atualizar Euribor 6M (BCE)"}
                </button>
                <button
                  onClick={() => atualizarEuribor("12m")}
                  disabled={euriborCarregando}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343] disabled:opacity-50"
                >
                  {euriborCarregando ? "A obter…" : "Atualizar Euribor 12M (BCE)"}
                </button>
              </div>
              {euriborErro && <p className="text-xs text-[#A13D2E] mb-1">{euriborErro}</p>}
              {financiamento.euriborOrigem !== "manual" && financiamento.euriborFonte && (
                <p className="text-xs text-[#59636A]">
                  Origem: Euribor {financiamento.euriborOrigem === "6m" ? "6M" : "12M"} · Referência: {financiamento.euriborDataReferencia} · Fonte:{" "}
                  {financiamento.euriborFonte}. Média mensal do BCE — não é a taxa exata de hoje; podes sobrepor o valor manualmente acima a
                  qualquer momento.
                </p>
              )}
              {financiamento.euriborOrigem === "manual" && <p className="text-xs text-[#8FA6AF]">Taxa preenchida manualmente.</p>}
            </div>
          </Row>
        )}
        <Row>
          <FieldGroup label="Metodologia da taxa mensal">
            <select
              className="input-dark"
              value={financiamento.metodoTaxaMensal}
              onChange={(e) => updateFinanciamento("metodoTaxaMensal", e.target.value as ParametrosFinanciamento["metodoTaxaMensal"])}
              disabled={desativado}
            >
              <option value="nominal_anual_div_12">Taxa nominal anual ÷ 12</option>
              <option value="mensal_equivalente">Taxa mensal equivalente</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Taxa mensal (calculada)">
            <input className="input-dark" value={`${(taxaMensal(financiamento) * 100).toFixed(3)}%`} disabled />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Structuring fee (% do limite)">
            <PercentInput value={financiamento.structuringFeePct} onChange={(v) => updateFinanciamento("structuringFeePct", v)} disabled={desativado} />
          </FieldGroup>
          <FieldGroup label="Setup costs (% do limite)">
            <PercentInput value={financiamento.setupCostsPct ?? 0.003} onChange={(v) => updateFinanciamento("setupCostsPct", v)} disabled={desativado} />
          </FieldGroup>
          <FieldGroup label="Setup costs fixos adicionais (€)">
            <NumeroInput value={financiamento.setupCosts} onChange={(v) => updateFinanciamento("setupCosts", v)} disabled={desativado} />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Imposto de selo do empréstimo">
            <PercentInput
              value={financiamento.impostoSeloEmprestimoPct}
              onChange={(v) => updateFinanciamento("impostoSeloEmprestimoPct", v)}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Imposto de selo sobre juros">
            <PercentInput
              value={financiamento.impostoSeloJurosPct}
              onChange={(v) => updateFinanciamento("impostoSeloJurosPct", v)}
              disabled={desativado}
            />
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Limite da linha (€) — vazio = sem limite explícito">
            <input
              type="number"
              className="input-dark"
              value={financiamento.limiteCredito ?? ""}
              onChange={(e) => updateFinanciamento("limiteCredito", e.target.value ? Number(e.target.value) : null)}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Meses de custos futuros cobertos pela reserva">
            <select
              className="input-dark"
              value={financiamento.saldoMinimoMesesReserva ?? 6}
              onChange={(e) => {
                const meses = Number(e.target.value);
                updateFinanciamento("saldoMinimoMesesReserva", meses);
                updateFinanciamento("cashSweepMesesCustosFuturos", meses);
              }}
              disabled={desativado}
            >
              {[3, 6, 9, 12].map((m) => <option key={m} value={m}>{m} meses</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label="Saldo mínimo calculado (€)">
            <input className="input-dark" value={`€${Math.round(reservaMinima.valor).toLocaleString("pt-PT")}`} disabled />
            <span className="block text-[10px] text-[#59636A] mt-1">
              Janela crítica: {reservaMinima.mesInicio ?? "—"} a {reservaMinima.mesFim ?? "—"}. Exclui aquisição, amortizações, distribuições e imposto sobre lucro.
            </span>
          </FieldGroup>
        </Row>
        <Row>
          <FieldGroup label="Prazo total do empréstimo (anos)">
            <input
              type="number"
              min={0}
              step={0.5}
              className="input-dark"
              value={financiamento.prazoAnos}
              onChange={(e) => updateFinanciamento("prazoAnos", Number(e.target.value))}
              disabled={desativado}
            />
          </FieldGroup>
          <FieldGroup label="Há período de carência de capital?">
            <select
              className="input-dark"
              value={financiamento.carenciaAtiva ? "sim" : "nao"}
              onChange={(e) => updateFinanciamento("carenciaAtiva", e.target.value === "sim")}
              disabled={desativado}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FieldGroup>
          <FieldGroup label="Carência (anos)">
            <input
              type="number"
              min={0}
              step={0.5}
              className="input-dark"
              value={financiamento.carenciaAnos}
              onChange={(e) => updateFinanciamento("carenciaAnos", Number(e.target.value))}
              disabled={desativado || !financiamento.carenciaAtiva}
            />
          </FieldGroup>
        </Row>
        {financiamento.carenciaAtiva && (
          <p className="text-xs text-[#59636A] mb-3">
            Durante a carência só se pagam juros — sem amortização de capital e sem cash sweep. A amortização do capital
            começa a seguir à carência, em linha reta até ao fim do prazo total (com liquidação final na maturidade).
          </p>
        )}
      </Card>

      <Card
        title="Cash sweep"
        subtitle="A partir de um gatilho, usa o caixa livre para amortizar dívida antecipadamente — nunca abaixo do saldo mínimo, nunca sem reservar os próximos meses de custos."
      >
        <Row>
          <FieldGroup label="Ativar cash sweep?">
            <select
              className="input-dark"
              value={financiamento.cashSweepAtivo ? "sim" : "nao"}
              onChange={(e) => updateFinanciamento("cashSweepAtivo", e.target.value === "sim")}
              disabled={desativado}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </FieldGroup>
          <FieldGroup label="% do caixa livre usado para amortizar">
            <PercentInput
              value={financiamento.cashSweepPctCaixaLivre}
              onChange={(v) => updateFinanciamento("cashSweepPctCaixaLivre", v)}
              disabled={desativado || !financiamento.cashSweepAtivo}
            />
          </FieldGroup>
        </Row>
        {financiamento.cashSweepAtivo && (
          <>
            <Row>
              <FieldGroup label="Reserva protegida pelo cash sweep">
                <input className="input-dark" value={`${financiamento.saldoMinimoMesesReserva ?? 6} meses · €${Math.round(reservaMinima.valor).toLocaleString("pt-PT")}`} disabled />
              </FieldGroup>
              <FieldGroup label="Início do cash sweep">
                <select
                  className="input-dark"
                  value={financiamento.cashSweepInicioTipo}
                  onChange={(e) => updateFinanciamento("cashSweepInicioTipo", e.target.value as ParametrosFinanciamento["cashSweepInicioTipo"])}
                  disabled={desativado}
                >
                  <option value="primeira_escritura">Primeira escritura</option>
                  <option value="pct_vendido">% do projeto vendido</option>
                  <option value="pct_vgv_recebido">% do VGV recebido</option>
                  <option value="data">Data específica</option>
                </select>
              </FieldGroup>
            </Row>
            <Row>
              {financiamento.cashSweepInicioTipo === "data" ? (
                <FieldGroup label="Data de início">
                  <input
                    type="date"
                    className="input-dark"
                    value={financiamento.cashSweepInicioData ?? ""}
                    onChange={(e) => updateFinanciamento("cashSweepInicioData", e.target.value)}
                    disabled={desativado}
                  />
                </FieldGroup>
              ) : (
                financiamento.cashSweepInicioTipo !== "primeira_escritura" && (
                  <FieldGroup label="% gatilho">
                    <PercentInput
                      value={financiamento.cashSweepInicioValorPct ?? 0}
                      onChange={(v) => updateFinanciamento("cashSweepInicioValorPct", v)}
                      disabled={desativado}
                    />
                  </FieldGroup>
                )
              )}
            </Row>
          </>
        )}
      </Card>
    </>
  );
}

// ============================================================
// Etapa 4 — Calendário e comercialização
// ============================================================
// ============================================================
// Etapa nova — Estrutura de Capital e Fees
// ============================================================
// ============================================================
// Etapa final — Cash flow e resultados
// ============================================================
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

function StepCashFlowResultados({
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

// Auxiliares visuais (Card, Row, FieldGroup, NumeroInput, PercentInput,
// CheckboxIdent, ResumoItem, SensibilidadesMatriz) vivem em ./_components/ui.tsx

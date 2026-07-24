"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_INPUTS,
  calcularViabilidade,
  type ProjectInputs,
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
import { taxaAnual, taxaMensal, type ParametrosFinanciamento } from "@/lib/calc/financiamento";
import { carregarFinanciamento, guardarFinanciamento, FINANCIAMENTO_VAZIO } from "@/lib/supabase/project-financing";
import { obterModeloPreset, type ModeloCapital } from "@/lib/calc/estrutura-capital";
import type { NivelHurdle } from "@/lib/calc/waterfall";
import { resolverValorFee, agregarFees, type Fee, type TipoFee, type ContextoFees } from "@/lib/calc/fees";
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
  validarVenda,
  type UnidadeVenda,
} from "@/lib/calc/sales-table";
import { listarUnidades, criarUnidades, atualizarUnidade, apagarUnidades } from "@/lib/supabase/project-units";
import {
  calcSeguro,
  calcIMI,
  resolverTaxaIRC,
  calcLucroTributavel,
  calcIRC,
  calcDerramaMunicipal,
  calcDerramaEstadual,
  TAXA_SEGURO_SUGERIDA,
  TAXA_IMI_SUGERIDA,
} from "@/lib/calc/impostos";
import { carregarImpostos, guardarImpostos, type ImpostosEstado, IMPOSTOS_VAZIO } from "@/lib/supabase/project-taxes";
import {
  resolverAtividadesEncadeadas,
  gerarDadosGantt,
  aoEditarDataFinal,
  aoEditarDuracao,
  aoEditarDataInicial,
  ATIVIDADES_INICIAIS_SUGERIDAS,
  type Atividade,
} from "@/lib/calc/calendario";
import {
  listarAtividades,
  criarAtividade,
  atualizarAtividade,
  apagarAtividade,
  duplicarAtividade,
} from "@/lib/supabase/project-timeline";
import { validarEstruturaRecebimentos, type PlanoVendas } from "@/lib/calc/vendas";
import { carregarPlanoVendas, guardarPlanoVendas, PLANO_VENDAS_VAZIO } from "@/lib/supabase/project-sales";
import { calcularCashFlow } from "@/lib/calc/cashflow";
import { gerarRecebimentosMensais } from "@/lib/calc/vendas";
import {
  calcularMatrizSensibilidade,
  extrairIndicador,
  type MatrizSensibilidade,
  type IndicadorSensibilidade,
  type PremissasBaseSensibilidade,
} from "@/lib/calc/sensibilidades";

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
  const [unidades, setUnidades] = useState<UnidadeVenda[]>([]);
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
    const unidadesCarregadas = await listarUnidades(supabase, id);
    setUnidades(unidadesCarregadas);
    const custos = await listarCustosProjeto(supabase, id);
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
    setPlanoVendas(planoVendasCarregado);
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
      await Promise.all(unidades.map((u) => atualizarUnidade(supabase, u.id, u)));
      await Promise.all(custosNovos.map((c) => atualizarCusto(supabase, c.id, c)));
      await guardarFinanciamento(supabase, id, financiamento);
      await guardarEstruturaCapital(supabase, id, estruturaCapital);
      await Promise.all(hurdles.map((h) => atualizarHurdle(supabase, h.id, h)));
      await Promise.all(feesNovos.map((f) => atualizarFee(supabase, f.id, f)));
      await guardarImpostos(supabase, id, impostos);
      await Promise.all(atividades.map((a) => atualizarAtividade(supabase, a.id, a)));
      await guardarPlanoVendas(supabase, id, planoVendas);

      setSavedAt(new Date());
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

  function venderUnidade(unidadeId: string, dataVenda: string) {
    const unidade = unidades.find((u) => u.id === unidadeId);
    if (!unidade) return;
    const validacao = validarVenda(unidade);
    if (!validacao.valido) {
      window.alert(validacao.erro);
      return;
    }
    setUnidades((prev) => prev.map((u) => (u.id === unidadeId ? { ...u, estadoComercial: "vendido", dataVenda } : u)));
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

  async function adicionarAtividade(nome: string) {
    const nova = await criarAtividade(supabase, id, nome, atividades.length);
    if (nova) setAtividades((prev) => [...prev, nova]);
  }

  function atualizarAtividadeLocal(atividadeId: string, patch: Partial<Atividade>) {
    setAtividades((prev) => prev.map((a) => (a.id === atividadeId ? { ...a, ...patch } : a)));
  }

  function handleDataInicialAtividade(atividadeId: string, novaData: string) {
    const atividade = atividades.find((a) => a.id === atividadeId);
    if (!atividade) return;
    if (novaData && atividade.duracaoMeses) {
      const r = aoEditarDataInicial(novaData, atividade.duracaoMeses);
      atualizarAtividadeLocal(atividadeId, { dataInicial: r.dataInicial, dataFinal: r.dataFinal });
    } else {
      atualizarAtividadeLocal(atividadeId, { dataInicial: novaData || null });
    }
  }

  function handleDuracaoAtividade(atividadeId: string, novaDuracao: number) {
    const atividade = atividades.find((a) => a.id === atividadeId);
    if (!atividade) return;
    if (atividade.dataInicial && novaDuracao > 0) {
      const r = aoEditarDuracao(atividade.dataInicial, novaDuracao);
      atualizarAtividadeLocal(atividadeId, { duracaoMeses: r.duracaoMeses, dataFinal: r.dataFinal });
    } else {
      atualizarAtividadeLocal(atividadeId, { duracaoMeses: novaDuracao || null });
    }
  }

  function handleDataFinalAtividade(atividadeId: string, novaDataFinal: string) {
    const atividade = atividades.find((a) => a.id === atividadeId);
    if (!atividade || !atividade.dataInicial || !novaDataFinal) {
      atualizarAtividadeLocal(atividadeId, { dataFinal: novaDataFinal || null });
      return;
    }
    const r = aoEditarDataFinal(atividade.dataInicial, novaDataFinal);
    atualizarAtividadeLocal(atividadeId, { duracaoMeses: r.duracaoMeses, dataFinal: r.dataFinal });
  }

  async function removerAtividade(atividadeId: string) {
    await apagarAtividade(supabase, atividadeId);
    setAtividades((prev) => prev.filter((a) => a.id !== atividadeId));
  }

  async function duplicarAtividadeHandler(atividade: Atividade) {
    const nova = await duplicarAtividade(supabase, id, atividade, atividades.length);
    if (nova) setAtividades((prev) => [...prev, nova]);
  }

  function reordenarAtividade(atividadeId: string, direcao: -1 | 1) {
    setAtividades((prev) => {
      const ordenadas = [...prev].sort((a, b) => a.ordem - b.ordem);
      const idx = ordenadas.findIndex((a) => a.id === atividadeId);
      const novoIdx = idx + direcao;
      if (idx === -1 || novoIdx < 0 || novoIdx >= ordenadas.length) return prev;
      const ordemA = ordenadas[idx].ordem;
      const ordemB = ordenadas[novoIdx].ordem;
      return prev.map((a) => {
        if (a.id === ordenadas[idx].id) return { ...a, ordem: ordemB };
        if (a.id === ordenadas[novoIdx].id) return { ...a, ordem: ordemA };
        return a;
      });
    });
  }

  function updatePlanoVendas<K extends keyof PlanoVendas>(key: K, value: PlanoVendas[K]) {
    setPlanoVendas((prev) => ({ ...prev, [key]: value }));
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

  const contextoCustoAtual: ContextoCusto = {
    valorAquisicao: inputs.custoTerreno || 0,
    abcTotal: (identificacao.abcAcimaSolo ?? 0) + (identificacao.abcAbaixoSolo ?? 0),
    gcaTotal: calcGcaProgramado(identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo, tipologiasNovas),
    numeroUnidades: tipologiasNovas.reduce((s, t) => s + t.quantidade, 0),
  };
  const resumoCustosAtual = agregarCustos(resolverCustos(custosNovos, contextoCustoAtual));
  const resumoProgramaAtual = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const salesTableResolvida = resolverSalesTable(unidades, tipologiasNovas);
  const vgvBrutoAtual = calcVgvBruto(salesTableResolvida);
  const contextoFeesAtual: ContextoFees = {
    valorAquisicao: contextoCustoAtual.valorAquisicao,
    hardCostsTotal: resumoCustosAtual.totalHardCosts,
    capexTotal: resumoCustosAtual.custoTotal,
    custoTotal: resumoCustosAtual.custoTotal,
    abcTotal: contextoCustoAtual.abcTotal,
    numeroUnidades: contextoCustoAtual.numeroUnidades,
  };

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
          onVenderUnidade={venderUnidade}
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
      {step === 3 && (
        <StepFinanciamento
          inputs={inputs}
          updateInput={updateInput}
          financiamento={financiamento}
          onToggleComFinanciamento={handleToggleFinanciamento}
          updateFinanciamento={updateFinanciamento}
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
          valorAquisicao={inputs.custoTerreno || 0}
          onSolicitarConsultoria={handleSolicitarConsultoria}
        />
      )}
      {step === 6 && (
        <StepCalendario
          inputs={inputs}
          updateInput={updateInput}
          atividades={atividades}
          onAdicionarAtividade={adicionarAtividade}
          onAtualizarAtividade={atualizarAtividadeLocal}
          onHandleDataInicial={handleDataInicialAtividade}
          onHandleDuracao={handleDuracaoAtividade}
          onHandleDataFinal={handleDataFinalAtividade}
          onRemoverAtividade={removerAtividade}
          onDuplicarAtividade={duplicarAtividadeHandler}
          onReordenarAtividade={reordenarAtividade}
        />
      )}
      {step === 7 && (
        <StepCashFlowResultados
          calculando={calculando}
          onCalcular={calcular}
          planoVendas={planoVendas}
          updatePlanoVendas={updatePlanoVendas}
          updateEstruturaRecebimentos={updateEstruturaRecebimentos}
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
  onVenderUnidade,
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
  onVenderUnidade: (id: string, dataVenda: string) => void;
}) {
  const resumo = calcResumoPrograma(tipologiasNovas, identificacao.abcAcimaSolo, identificacao.abcAbaixoSolo);
  const semLocalizacao = !identificacao.freguesia && !identificacao.concelho;

  return (
    <>
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
                  </tr>
                </thead>
                <tbody>
                  {unidadesDaTipologia.map((u) => (
                    <tr key={u.id} className="border-t border-[#E3DACB]">
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
                        {u.estadoComercial === "disponivel" ? (
                          <input type="date" className="input-dark" onChange={(e) => e.target.value && onVenderUnidade(u.id, e.target.value)} />
                        ) : (
                          u.dataVenda
                        )}
                      </td>
                    </tr>
                  ))}
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

function salesTableDaTipologia(unidades: UnidadeVenda[], tipologias: Typology[], tipologiaId: string) {
  return resolverSalesTable(
    unidades.filter((u) => u.tipologiaId === tipologiaId),
    tipologias
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

function StepFinanciamento({
  inputs,
  updateInput,
  financiamento,
  onToggleComFinanciamento,
  updateFinanciamento,
}: {
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
  financiamento: ParametrosFinanciamento;
  onToggleComFinanciamento: (v: boolean) => void;
  updateFinanciamento: <K extends keyof ParametrosFinanciamento>(k: K, v: ParametrosFinanciamento[K]) => void;
}) {
  const desativado = !financiamento.comFinanciamento;

  return (
    <>
      <Card title="Custos (motor antigo — alimenta o dashboard atual)">
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

      <Card title="Financiamento bancário">
        <Row>
          <Field label="Este projeto terá financiamento bancário?">
            <select
              className="input-dark"
              value={financiamento.comFinanciamento ? "sim" : "nao"}
              onChange={(e) => onToggleComFinanciamento(e.target.value === "sim")}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </Field>
        </Row>
        {desativado && (
          <p className="text-xs text-[#59636A] mb-3">
            Sem financiamento bancário: dívida, juros, fees e imposto de selo ficam a €0. O funding passa a ser só equity + recebimentos de clientes.
          </p>
        )}

        <Row>
          <Field label="% dos hard costs financiada">
            <PercentInput
              value={financiamento.percentagemHardCostsFinanciada}
              onChange={(v) => updateFinanciamento("percentagemHardCostsFinanciada", v)}
              disabled={desativado}
            />
          </Field>
          <Field label="% da aquisição financiada">
            <PercentInput
              value={financiamento.percentagemAquisicaoFinanciada}
              onChange={(v) => updateFinanciamento("percentagemAquisicaoFinanciada", v)}
              disabled={desativado}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Euribor">
            <PercentInput value={financiamento.euribor} onChange={(v) => updateFinanciamento("euribor", v)} disabled={desativado} />
          </Field>
          <Field label="Spread">
            <PercentInput value={financiamento.spread} onChange={(v) => updateFinanciamento("spread", v)} disabled={desativado} />
          </Field>
          <Field label="Taxa anual (calculada)">
            <input className="input-dark" value={`${(taxaAnual(financiamento) * 100).toFixed(2)}%`} disabled />
          </Field>
        </Row>
        <Row>
          <Field label="Metodologia da taxa mensal">
            <select
              className="input-dark"
              value={financiamento.metodoTaxaMensal}
              onChange={(e) => updateFinanciamento("metodoTaxaMensal", e.target.value as ParametrosFinanciamento["metodoTaxaMensal"])}
              disabled={desativado}
            >
              <option value="nominal_anual_div_12">Taxa nominal anual ÷ 12</option>
              <option value="mensal_equivalente">Taxa mensal equivalente</option>
            </select>
          </Field>
          <Field label="Taxa mensal (calculada)">
            <input className="input-dark" value={`${(taxaMensal(financiamento) * 100).toFixed(3)}%`} disabled />
          </Field>
        </Row>
        <Row>
          <Field label="Structuring fee (% do limite)">
            <PercentInput value={financiamento.structuringFeePct} onChange={(v) => updateFinanciamento("structuringFeePct", v)} disabled={desativado} />
          </Field>
          <Field label="Setup costs (€)">
            <input
              type="number"
              className="input-dark"
              value={financiamento.setupCosts}
              onChange={(e) => updateFinanciamento("setupCosts", Number(e.target.value))}
              disabled={desativado}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Imposto de selo do empréstimo">
            <PercentInput
              value={financiamento.impostoSeloEmprestimoPct}
              onChange={(v) => updateFinanciamento("impostoSeloEmprestimoPct", v)}
              disabled={desativado}
            />
          </Field>
          <Field label="Imposto de selo sobre juros">
            <PercentInput
              value={financiamento.impostoSeloJurosPct}
              onChange={(v) => updateFinanciamento("impostoSeloJurosPct", v)}
              disabled={desativado}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Limite da linha (€) — vazio = sem limite explícito">
            <input
              type="number"
              className="input-dark"
              value={financiamento.limiteCredito ?? ""}
              onChange={(e) => updateFinanciamento("limiteCredito", e.target.value ? Number(e.target.value) : null)}
              disabled={desativado}
            />
          </Field>
          <Field label="Saldo mínimo de caixa (€)">
            <input
              type="number"
              className="input-dark"
              value={financiamento.saldoMinimoCaixa}
              onChange={(e) => updateFinanciamento("saldoMinimoCaixa", Number(e.target.value))}
              disabled={desativado}
            />
          </Field>
        </Row>
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
const MODELOS_CAPITAL: { value: ModeloCapital; label: string }[] = [
  { value: "promotor_sozinho", label: "Promotor sem investidor externo" },
  { value: "joint_venture_simples", label: "Joint venture simples" },
  { value: "family_office_sem_fees", label: "Family office sem fees" },
  { value: "family_office_com_fees", label: "Family office com fees" },
  { value: "personalizado", label: "Estrutura personalizada" },
];

const TIPOS_FEE: { value: TipoFee; label: string }[] = [
  { value: "origination", label: "Origination fee" },
  { value: "development", label: "Development fee" },
  { value: "asset_management", label: "Asset management fee" },
  { value: "project_management", label: "Project management fee" },
  { value: "acquisition", label: "Acquisition fee" },
  { value: "disposition", label: "Disposition fee" },
  { value: "outro", label: "Outro fee" },
];

function StepEstruturaCapital({
  estruturaCapital,
  hurdles,
  feesNovos,
  onAplicarModelo,
  updateEstruturaCapital,
  onAdicionarHurdle,
  onAtualizarHurdle,
  onRemoverHurdle,
  onAdicionarFee,
  onAtualizarFee,
  onRemoverFee,
  contextoFees,
}: {
  estruturaCapital: EstruturaCapitalEstado;
  hurdles: (NivelHurdle & { id: string })[];
  feesNovos: Fee[];
  onAplicarModelo: (modelo: ModeloCapital) => void;
  updateEstruturaCapital: <K extends keyof EstruturaCapitalEstado>(k: K, v: EstruturaCapitalEstado[K]) => void;
  onAdicionarHurdle: () => void;
  onAtualizarHurdle: (id: string, patch: Partial<NivelHurdle>) => void;
  onRemoverHurdle: (id: string) => void;
  onAdicionarFee: (tipo: TipoFee, nome: string) => void;
  onAtualizarFee: (id: string, patch: Partial<Fee>) => void;
  onRemoverFee: (id: string) => void;
  contextoFees: ContextoFees;
}) {
  const resumoFees = agregarFees(feesNovos, contextoFees);

  return (
    <>
      <Card title="Este projeto possui investidores externos?">
        <Row>
          <Field label="Investidor externo">
            <select
              className="input-dark"
              value={estruturaCapital.temInvestidorExterno ? "sim" : "nao"}
              onChange={(e) => updateEstruturaCapital("temInvestidorExterno", e.target.value === "sim")}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </Field>
          <Field label="Modelo inicial (aplica valores de referência, tudo editável depois)">
            <select className="input-dark" value={estruturaCapital.modelo} onChange={(e) => onAplicarModelo(e.target.value as ModeloCapital)}>
              {MODELOS_CAPITAL.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </Row>
        {!estruturaCapital.temInvestidorExterno && (
          <p className="text-xs text-[#59636A]">
            Sem investidor externo: mostra-se só equity do promotor, capital calls, peak cash exposure e resultado do projeto — sem waterfall avançada.
          </p>
        )}
      </Card>

      {estruturaCapital.temInvestidorExterno && (
        <>
          <Card title="Estrutura de capital">
            <Row>
              <Field label="% do investidor">
                <PercentInput
                  value={estruturaCapital.percentagemInvestidor}
                  onChange={(v) => updateEstruturaCapital("percentagemInvestidor", v)}
                />
              </Field>
              <Field label="% do promotor (co-investimento, calculado)">
                <input className="input-dark" value={`${((1 - estruturaCapital.percentagemInvestidor) * 100).toFixed(1)}%`} disabled />
              </Field>
            </Row>
            <Row>
              <Field label="Catch-up ativo?">
                <select
                  className="input-dark"
                  value={estruturaCapital.catchUpAtivo ? "sim" : "nao"}
                  onChange={(e) => updateEstruturaCapital("catchUpAtivo", e.target.value === "sim")}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </Field>
              {estruturaCapital.catchUpAtivo && (
                <Field label="% de catch-up">
                  <PercentInput value={estruturaCapital.catchUpPct} onChange={(v) => updateEstruturaCapital("catchUpPct", v)} />
                </Field>
              )}
            </Row>
          </Card>

          <Card title="Hurdles e promote" subtitle="Ordem: retorno preferencial até ao 1.º hurdle, depois promote sobre o incremento de cada tier.">
            {hurdles.map((h, i) => (
              <Row key={h.id}>
                <Field label={`Hurdle ${i + 1} (IRR)`}>
                  <PercentInput value={h.hurdleIRR} onChange={(v) => onAtualizarHurdle(h.id, { hurdleIRR: v })} />
                </Field>
                <Field label={`Promote ${i + 1} (acima deste hurdle)`}>
                  <PercentInput value={h.promotePctAcima} onChange={(v) => onAtualizarHurdle(h.id, { promotePctAcima: v })} />
                </Field>
                <div className="flex items-end pb-1">
                  <button onClick={() => onRemoverHurdle(h.id)} className="text-[#A13D2E] text-xs">
                    Remover
                  </button>
                </div>
              </Row>
            ))}
            <button onClick={onAdicionarHurdle} className="text-[#B96343] text-sm font-semibold mt-2">
              + Adicionar tier
            </button>
          </Card>
        </>
      )}

      <Card title="Development fees" subtitle={`Total: €${Math.round(resumoFees.total).toLocaleString("pt-PT")}`}>
        {feesNovos.map((f) => (
          <div key={f.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
            <Row>
              <Field label="Nome">
                <input className="input-dark" value={f.nome} onChange={(e) => onAtualizarFee(f.id, { nome: e.target.value })} />
              </Field>
              <Field label="Base de cálculo">
                <select
                  className="input-dark"
                  value={f.baseCalculo}
                  onChange={(e) => onAtualizarFee(f.id, { baseCalculo: e.target.value as Fee["baseCalculo"] })}
                >
                  <option value="valor_fixo">Valor fixo</option>
                  <option value="percentagem_aquisicao">% da aquisição</option>
                  <option value="percentagem_hard_costs">% dos hard costs</option>
                  <option value="percentagem_capex">% do capex</option>
                  <option value="percentagem_custo_total">% do custo total</option>
                  <option value="eur_m2">€/m²</option>
                  <option value="eur_unidade">€/unidade</option>
                </select>
              </Field>
              <Field label={f.baseCalculo.startsWith("percentagem") ? "Percentagem" : "Valor"}>
                {f.baseCalculo.startsWith("percentagem") ? (
                  <PercentInput value={f.valorInput} onChange={(v) => onAtualizarFee(f.id, { valorInput: v })} />
                ) : (
                  <input
                    type="number"
                    className="input-dark"
                    value={f.valorInput}
                    onChange={(e) => onAtualizarFee(f.id, { valorInput: Number(e.target.value) })}
                  />
                )}
              </Field>
            </Row>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#59636A]">
                Valor resolvido: €{Math.round(resolverValorFee(f, contextoFees)).toLocaleString("pt-PT")}
              </span>
              <button onClick={() => onRemoverFee(f.id)} className="text-[#A13D2E] text-xs">
                Remover
              </button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 mt-2">
          {TIPOS_FEE.map((t) => (
            <button
              key={t.value}
              onClick={() => onAdicionarFee(t.value, t.label)}
              className="text-xs px-2.5 py-1 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]"
            >
              + {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#8FA6AF] mt-3">Todos os fees começam em €0 até serem configurados — nunca um valor pré-definido.</p>
      </Card>
    </>
  );
}

// ============================================================
// Etapa nova — Impostos e Seguros
// ============================================================
function StepImpostos({
  impostos,
  updateImpostos,
  valorAquisicao,
  onSolicitarConsultoria,
}: {
  impostos: ImpostosEstado;
  updateImpostos: <K extends keyof ImpostosEstado>(k: K, v: ImpostosEstado[K]) => void;
  valorAquisicao: number;
  onSolicitarConsultoria: (
    dados: { name: string; company: string; email: string; phone: string; message: string; preferenciaContacto: "email" | "telefone" },
    impostoEstimado: number
  ) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const seguro = calcSeguro(impostos.seguroTaxa, "valor_aquisicao", valorAquisicao, impostos.seguroDuracaoAnos);
  const imi = calcIMI(impostos.imiVpt ?? 0, impostos.imiTaxa, impostos.imiNumAnos);
  const { taxa: taxaIrc, taxaManualAplicada } = resolverTaxaIRC(impostos.ircAnoFiscalReferencia, impostos.ircTaxaManual);
  const lucroTributavel = calcLucroTributavel(impostos.ircLucroTributavel ?? 0, impostos.ircPrejuizosFiscaisAcumulados);
  const ircEstimado = calcIRC(lucroTributavel, taxaIrc);
  const derramaMunicipal = calcDerramaMunicipal(lucroTributavel, impostos.derramaMunicipalTaxa);
  const derramaEstadual = calcDerramaEstadual(lucroTributavel);
  const impostoAquisicao = valorAquisicao * impostos.imtValor;
  const seloAquisicao = valorAquisicao * impostos.impostoSeloAquisicaoTaxa;
  const impostoEstimadoTotal = ircEstimado + derramaMunicipal + derramaEstadual + impostoAquisicao + seloAquisicao;

  const [modalAberto, setModalAberto] = useState(false);

  return (
    <>
      <Card title="Seguro">
        <Row>
          <Field label={`Taxa de seguro (sugestão: ${(TAXA_SEGURO_SUGERIDA * 100).toFixed(2)}%, editável)`}>
            <PercentInput value={impostos.seguroTaxa} onChange={(v) => updateImpostos("seguroTaxa", v)} />
          </Field>
          <Field label="Duração (anos)">
            <input
              type="number"
              className="input-dark"
              value={impostos.seguroDuracaoAnos}
              onChange={(e) => updateImpostos("seguroDuracaoAnos", Number(e.target.value))}
            />
          </Field>
          <Field label="Valor total (calculado)">
            <input className="input-dark" value={`€${Math.round(seguro.valorTotal).toLocaleString("pt-PT")}`} disabled />
          </Field>
        </Row>
      </Card>

      <Card title="IMI" subtitle="Aplicado sobre o VPT — nunca sobre o valor de aquisição ou o GDV.">
        <Row>
          <Field label="VPT (€)">
            <input
              type="number"
              className="input-dark"
              value={impostos.imiVpt ?? ""}
              onChange={(e) => updateImpostos("imiVpt", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label={`Taxa de IMI (referência: ${(TAXA_IMI_SUGERIDA * 100).toFixed(2)}%, editável)`}>
            <PercentInput value={impostos.imiTaxa} onChange={(v) => updateImpostos("imiTaxa", v)} />
          </Field>
          <Field label="Número de anos">
            <input
              type="number"
              className="input-dark"
              value={impostos.imiNumAnos}
              onChange={(e) => updateImpostos("imiNumAnos", Number(e.target.value))}
            />
          </Field>
        </Row>
        <p className="text-xs text-[#59636A]">Valor total (calculado): €{Math.round(imi.valorTotal).toLocaleString("pt-PT")}</p>
      </Card>

      <Card title="IRC">
        <Row>
          <Field label="Ano fiscal de referência">
            <input
              type="number"
              className="input-dark"
              value={impostos.ircAnoFiscalReferencia}
              onChange={(e) => updateImpostos("ircAnoFiscalReferencia", Number(e.target.value))}
            />
          </Field>
          <Field label="Taxa manual (vazio = usa a configuração anual)">
            <input
              type="number"
              className="input-dark"
              value={impostos.ircTaxaManual ?? ""}
              onChange={(e) => updateImpostos("ircTaxaManual", e.target.value ? Number(e.target.value) / 100 : null)}
              placeholder={`${(taxaIrc * 100).toFixed(0)}%`}
            />
          </Field>
        </Row>
        {taxaManualAplicada && <p className="text-xs text-[#B96343] mb-2">Taxa manual aplicada.</p>}
        <Row>
          <Field label="Lucro tributável estimado (€)">
            <input
              type="number"
              className="input-dark"
              value={impostos.ircLucroTributavel ?? ""}
              onChange={(e) => updateImpostos("ircLucroTributavel", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="Prejuízos fiscais acumulados (€)">
            <input
              type="number"
              className="input-dark"
              value={impostos.ircPrejuizosFiscaisAcumulados}
              onChange={(e) => updateImpostos("ircPrejuizosFiscaisAcumulados", Number(e.target.value))}
            />
          </Field>
          <Field label="Derrama municipal (%)">
            <PercentInput value={impostos.derramaMunicipalTaxa} onChange={(v) => updateImpostos("derramaMunicipalTaxa", v)} />
          </Field>
        </Row>
        <div className="grid grid-cols-3 gap-4 text-sm mt-2">
          <div>
            <span className="text-xs text-[#59636A] block">IRC estimado</span>
            <span className="font-semibold text-[#142B3A]">€{Math.round(ircEstimado).toLocaleString("pt-PT")}</span>
          </div>
          <div>
            <span className="text-xs text-[#59636A] block">Derrama municipal</span>
            <span className="font-semibold text-[#142B3A]">€{Math.round(derramaMunicipal).toLocaleString("pt-PT")}</span>
          </div>
          <div>
            <span className="text-xs text-[#59636A] block">Derrama estadual (escalões)</span>
            <span className="font-semibold text-[#142B3A]">€{Math.round(derramaEstadual).toLocaleString("pt-PT")}</span>
          </div>
        </div>
      </Card>

      <Card title="IMT e Imposto de Selo da aquisição">
        <Row>
          <Field label="Método de cálculo do IMT">
            <select className="input-dark" value={impostos.imtMetodo} onChange={(e) => updateImpostos("imtMetodo", e.target.value as ImpostosEstado["imtMetodo"])}>
              <option value="percentagem">Percentagem da aquisição</option>
              <option value="valor_manual">Valor manual</option>
            </select>
          </Field>
          <Field label={impostos.imtMetodo === "percentagem" ? "Taxa de IMT" : "Valor de IMT (€)"}>
            {impostos.imtMetodo === "percentagem" ? (
              <PercentInput value={impostos.imtValor} onChange={(v) => updateImpostos("imtValor", v)} />
            ) : (
              <input type="number" className="input-dark" value={impostos.imtValor} onChange={(e) => updateImpostos("imtValor", Number(e.target.value))} />
            )}
          </Field>
          <Field label="Taxa de imposto de selo da aquisição">
            <PercentInput value={impostos.impostoSeloAquisicaoTaxa} onChange={(v) => updateImpostos("impostoSeloAquisicaoTaxa", v)} />
          </Field>
        </Row>
        <p className="text-xs text-[#59636A]">
          IMT (calculado): €{Math.round(impostoAquisicao).toLocaleString("pt-PT")} · Selo (calculado): €{Math.round(seloAquisicao).toLocaleString("pt-PT")}
        </p>
      </Card>

      <Card title="★ A estrutura fiscal pode impactar significativamente o retorno do projeto.">
        <p className="text-sm text-[#142B3A] mb-3">Saiba como otimizar. Esta estimativa não substitui uma análise fiscal, jurídica ou contabilística individual.</p>
        <button onClick={() => setModalAberto(true)} className="text-sm font-semibold text-white bg-[#142B3A] px-4 py-2 rounded-lg">
          Solicitar análise especializada
        </button>
      </Card>

      {modalAberto && (
        <ConsultoriaModal onFechar={() => setModalAberto(false)} onEnviar={(dados) => onSolicitarConsultoria(dados, impostoEstimadoTotal)} />
      )}
    </>
  );
}

function ConsultoriaModal({
  onFechar,
  onEnviar,
}: {
  onFechar: () => void;
  onEnviar: (dados: {
    name: string;
    company: string;
    email: string;
    phone: string;
    message: string;
    preferenciaContacto: "email" | "telefone";
  }) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const [nome, setNomeLead] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [preferencia, setPreferencia] = useState<"email" | "telefone">("email");
  const [aEnviar, setAEnviar] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleEnviar() {
    if (!nome || !email) {
      setErro("Preenche pelo menos o nome e o email.");
      return;
    }
    setAEnviar(true);
    setErro(null);
    const resultado = await onEnviar({ name: nome, company: empresa, email, phone: telefone, message: mensagem, preferenciaContacto: preferencia });
    setAEnviar(false);
    if (resultado.ok) {
      setEnviado(true);
    } else {
      setErro(resultado.erro ?? "Não foi possível enviar o pedido. Tenta novamente.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {enviado ? (
          <>
            <h3 className="text-[#142B3A] font-bold text-lg mb-2">Pedido enviado</h3>
            <p className="text-sm text-[#59636A] mb-4">
              Obrigado. A nossa equipa entra em contacto por {preferencia === "email" ? "email" : "telefone"} em breve.
            </p>
            <button onClick={onFechar} className="px-4 py-2 rounded-lg bg-[#142B3A] text-white text-sm font-bold">
              Fechar
            </button>
          </>
        ) : (
          <>
            <h3 className="text-[#142B3A] font-bold text-lg mb-1">Solicitar análise especializada</h3>
            <p className="text-xs text-[#8FA6AF] mb-4">Esta estimativa não substitui uma análise fiscal, jurídica ou contabilística individual.</p>
            <Row>
              <Field label="Nome">
                <input className="input-dark" value={nome} onChange={(e) => setNomeLead(e.target.value)} />
              </Field>
              <Field label="Empresa">
                <input className="input-dark" value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field label="Email">
                <input type="email" className="input-dark" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Telefone">
                <input className="input-dark" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field label="Preferência de contacto">
                <select className="input-dark" value={preferencia} onChange={(e) => setPreferencia(e.target.value as "email" | "telefone")}>
                  <option value="email">Email</option>
                  <option value="telefone">Telefone</option>
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Mensagem (opcional)">
                <textarea className="input-dark" rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              </Field>
            </Row>
            {erro && <p className="text-xs text-[#A13D2E] mb-2">{erro}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={handleEnviar} disabled={aEnviar} className="px-4 py-2 rounded-lg bg-[#142B3A] text-white text-sm font-bold disabled:opacity-60">
                {aEnviar ? "A enviar…" : "Enviar pedido"}
              </button>
              <button onClick={onFechar} className="px-4 py-2 rounded-lg border border-[#E3DACB] text-[#142B3A] text-sm font-semibold">
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StepCalendario({
  inputs,
  updateInput,
  atividades,
  onAdicionarAtividade,
  onAtualizarAtividade,
  onHandleDataInicial,
  onHandleDuracao,
  onHandleDataFinal,
  onRemoverAtividade,
  onDuplicarAtividade,
  onReordenarAtividade,
}: {
  inputs: ProjectInputs;
  updateInput: <K extends keyof ProjectInputs>(k: K, v: ProjectInputs[K]) => void;
  atividades: Atividade[];
  onAdicionarAtividade: (nome: string) => void;
  onAtualizarAtividade: (id: string, patch: Partial<Atividade>) => void;
  onHandleDataInicial: (id: string, data: string) => void;
  onHandleDuracao: (id: string, duracao: number) => void;
  onHandleDataFinal: (id: string, data: string) => void;
  onRemoverAtividade: (id: string) => void;
  onDuplicarAtividade: (atividade: Atividade) => void;
  onReordenarAtividade: (id: string, direcao: -1 | 1) => void;
}) {
  const { atividades: resolvidas, alertas } = resolverAtividadesEncadeadas(atividades);
  const ordenadas = [...resolvidas].sort((a, b) => a.ordem - b.ordem);
  const gantt = gerarDadosGantt(resolvidas);

  const datasValidas = gantt.flatMap((g) => [new Date(g.inicio).getTime(), new Date(g.fim).getTime()]);
  const dataMinMs = datasValidas.length > 0 ? Math.min(...datasValidas) : 0;
  const dataMaxMs = datasValidas.length > 0 ? Math.max(...datasValidas) : 1;
  const totalMs = dataMaxMs - dataMinMs || 1;

  return (
    <>
      <Card title="Calendário e comercialização (motor antigo — alimenta o dashboard atual)">
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

      <Card title="Calendário de atividades" subtitle="Início + duração = fim, calculado automaticamente. Editar qualquer um dos três recalcula os outros dois.">
        {alertas.length > 0 && (
          <div className="mb-3">
            {alertas.map((al, i) => (
              <p key={i} className={`text-xs ${al.tipo === "erro" ? "text-[#A13D2E]" : "text-[#B96343]"}`}>
                {al.mensagem}
              </p>
            ))}
          </div>
        )}

        {ordenadas.map((a) => (
          <div key={a.id} className="border border-[#E3DACB] rounded-lg p-3 mb-3">
            <Row>
              <Field label="Atividade">
                <input className="input-dark" value={a.nome} onChange={(e) => onAtualizarAtividade(a.id, { nome: e.target.value })} />
              </Field>
              <Field label="Dependência (início = fim da anterior + 1 dia)">
                <select
                  className="input-dark"
                  value={a.dependenciaId ?? ""}
                  onChange={(e) => onAtualizarAtividade(a.id, { dependenciaId: e.target.value || null })}
                >
                  <option value="">Sem dependência</option>
                  {atividades
                    .filter((outra) => outra.id !== a.id)
                    .map((outra) => (
                      <option key={outra.id} value={outra.id}>
                        {outra.nome}
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
                  value={a.dataInicial ?? ""}
                  onChange={(e) => onHandleDataInicial(a.id, e.target.value)}
                  disabled={!!a.dependenciaId}
                />
              </Field>
              <Field label="Duração (meses)">
                <input
                  type="number"
                  className="input-dark"
                  value={a.duracaoMeses ?? ""}
                  onChange={(e) => onHandleDuracao(a.id, Number(e.target.value))}
                />
              </Field>
              <Field label="Data final">
                <input type="date" className="input-dark" value={a.dataFinal ?? ""} onChange={(e) => onHandleDataFinal(a.id, e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field label="Perfil de desembolso">
                <select
                  className="input-dark"
                  value={a.perfilDesembolso}
                  onChange={(e) => onAtualizarAtividade(a.id, { perfilDesembolso: e.target.value as Atividade["perfilDesembolso"] })}
                >
                  {PERFIS_DESEMBOLSO.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </Row>
            <div className="flex justify-between items-center mt-1">
              <div className="flex gap-2">
                <button onClick={() => onReordenarAtividade(a.id, -1)} className="text-xs text-[#59636A]">
                  ↑ Subir
                </button>
                <button onClick={() => onReordenarAtividade(a.id, 1)} className="text-xs text-[#59636A]">
                  ↓ Descer
                </button>
                <button onClick={() => onDuplicarAtividade(a)} className="text-xs text-[#142B3A] underline">
                  Duplicar
                </button>
              </div>
              <button onClick={() => onRemoverAtividade(a.id)} className="text-[#A13D2E] text-xs">
                Remover
              </button>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2 mt-2">
          {ATIVIDADES_INICIAIS_SUGERIDAS.map((nome) => (
            <button
              key={nome}
              onClick={() => onAdicionarAtividade(nome)}
              className="text-xs px-2.5 py-1 rounded-full border border-[#E3DACB] text-[#142B3A] hover:border-[#B96343]"
            >
              + {nome}
            </button>
          ))}
        </div>
      </Card>

      {gantt.length > 0 && (
        <Card title="Gantt simples">
          <div className="space-y-2">
            {gantt.map((g) => {
              const offsetPct = ((new Date(g.inicio).getTime() - dataMinMs) / totalMs) * 100;
              const larguraPct = Math.max(1, ((new Date(g.fim).getTime() - new Date(g.inicio).getTime()) / totalMs) * 100);
              return (
                <div key={g.id} className="flex items-center gap-3 text-xs">
                  <span className="w-40 truncate text-[#142B3A]">{g.nome}</span>
                  <div className="flex-1 h-4 bg-[#F4EFE6] rounded relative">
                    <div
                      className="absolute h-4 rounded bg-[#B96343]"
                      style={{ left: `${offsetPct}%`, width: `${larguraPct}%` }}
                      title={`${g.inicio} → ${g.fim}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}

// ============================================================
// Etapa final — Cash flow e resultados
// ============================================================
const SUBTABS_RESULTADOS = ["Plano de vendas", "Resumo", "Cash flow", "Capex", "Funding", "Financiamento", "Investidor e promotor", "Sensibilidades"] as const;

function StepCashFlowResultados({
  calculando,
  onCalcular,
  planoVendas,
  updatePlanoVendas,
  updateEstruturaRecebimentos,
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
}: {
  calculando: boolean;
  onCalcular: () => void;
  planoVendas: PlanoVendas;
  updatePlanoVendas: <K extends keyof PlanoVendas>(k: K, v: PlanoVendas[K]) => void;
  updateEstruturaRecebimentos: <K extends keyof PlanoVendas["estruturaRecebimentos"]>(k: K, v: PlanoVendas["estruturaRecebimentos"][K]) => void;
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
}) {
  const [subtab, setSubtab] = useState<(typeof SUBTABS_RESULTADOS)[number]>("Resumo");
  const [sensMatriz, setSensMatriz] = useState<MatrizSensibilidade>("aquisicao_vs_custo_construcao");
  const [sensIndicador, setSensIndicador] = useState<IndicadorSensibilidade>("margem");

  const recebimentosValidos = validarEstruturaRecebimentos(planoVendas.estruturaRecebimentos);
  const datasPreenchidas = Boolean(
    planoVendas.dataLancamentoComercial && planoVendas.dataInicioConstrucao && planoVendas.dataFimConstrucao && planoVendas.dataEscritura
  );
  const prontoParaCalcular = recebimentosValidos && datasPreenchidas && custosNovos.length > 0;

  let resultado: ReturnType<typeof calcularCashFlow> | null = null;
  if (prontoParaCalcular) {
    const { linhas: recebimentos } = gerarRecebimentosMensais(vgvBruto, planoVendas);
    resultado = calcularCashFlow({
      linhasCusto: custosNovos,
      contextoCusto,
      recebimentos,
      parametrosFinanciamento: financiamento,
      saldoMinimoCaixa: financiamento.saldoMinimoCaixa,
    });
  }

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

      {!prontoParaCalcular && subtab !== "Plano de vendas" && (
        <Card title="Preenche o Plano de Vendas primeiro">
          <p className="text-sm text-[#59636A]">
            {!datasPreenchidas && "Faltam datas do plano de vendas (lançamento, início/fim de construção, escritura). "}
            {!recebimentosValidos && `A estrutura de recebimentos soma ${Math.round(somaRecebimentos * 100)}%, tem de somar 100%. `}
            {custosNovos.length === 0 && "Ainda não há linhas de custo na etapa Aquisição e Custos."}
          </p>
        </Card>
      )}

      {subtab === "Plano de vendas" && (
        <Card title="Plano de vendas">
          <Row>
            <Field label="Data de lançamento comercial">
              <input
                type="date"
                className="input-dark"
                value={planoVendas.dataLancamentoComercial}
                onChange={(e) => updatePlanoVendas("dataLancamentoComercial", e.target.value)}
              />
            </Field>
            <Field label="Duração esperada das vendas (meses)">
              <input
                type="number"
                className="input-dark"
                value={planoVendas.duracaoVendasMeses}
                onChange={(e) => updatePlanoVendas("duracaoVendasMeses", Number(e.target.value))}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Início da construção">
              <input
                type="date"
                className="input-dark"
                value={planoVendas.dataInicioConstrucao}
                onChange={(e) => updatePlanoVendas("dataInicioConstrucao", e.target.value)}
              />
            </Field>
            <Field label="Fim da construção">
              <input
                type="date"
                className="input-dark"
                value={planoVendas.dataFimConstrucao}
                onChange={(e) => updatePlanoVendas("dataFimConstrucao", e.target.value)}
              />
            </Field>
            <Field label="Data da escritura">
              <input type="date" className="input-dark" value={planoVendas.dataEscritura} onChange={(e) => updatePlanoVendas("dataEscritura", e.target.value)} />
            </Field>
          </Row>
          <Row>
            <Field label="Comissão de mediação (%)">
              <PercentInput value={planoVendas.comissaoMediacaoPct} onChange={(v) => updatePlanoVendas("comissaoMediacaoPct", v)} />
            </Field>
            <Field label="Cancelamentos estimados (%)">
              <PercentInput value={planoVendas.cancelamentosEstimadosPct} onChange={(v) => updatePlanoVendas("cancelamentosEstimadosPct", v)} />
            </Field>
          </Row>

          <h4 className="text-sm font-semibold text-[#142B3A] mt-4 mb-2">
            Estrutura de recebimentos — soma: {Math.round(somaRecebimentos * 100)}% {!recebimentosValidos && <span className="text-[#A13D2E]">(tem de ser 100%)</span>}
          </h4>
          <Row>
            <Field label="% na reserva">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctReserva} onChange={(v) => updateEstruturaRecebimentos("pctReserva", v)} />
            </Field>
            <Field label="% no CPCV">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctCpcv} onChange={(v) => updateEstruturaRecebimentos("pctCpcv", v)} />
            </Field>
          </Row>
          <Row>
            <Field label="% durante a construção">
              <PercentInput
                value={planoVendas.estruturaRecebimentos.pctDuranteConstrucao}
                onChange={(v) => updateEstruturaRecebimentos("pctDuranteConstrucao", v)}
              />
            </Field>
            <Field label="% na conclusão">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctConclusao} onChange={(v) => updateEstruturaRecebimentos("pctConclusao", v)} />
            </Field>
            <Field label="% na escritura">
              <PercentInput value={planoVendas.estruturaRecebimentos.pctEscritura} onChange={(v) => updateEstruturaRecebimentos("pctEscritura", v)} />
            </Field>
          </Row>
        </Card>
      )}

      {subtab === "Resumo" && resultado && (
        <Card title="Resumo">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <ResumoItem label="Freguesia / Concelho" valor={[identificacao.freguesia, identificacao.concelho].filter(Boolean).join(", ") || "—"} />
            <ResumoItem label="ABC total" valor={`${Math.round((identificacao.abcAcimaSolo ?? 0) + (identificacao.abcAbaixoSolo ?? 0))} m²`} />
            <ResumoItem label="GCA total" valor={`${Math.round(resumoPrograma.gcaTotal)} m²`} />
            <ResumoItem label="ABP" valor={`${Math.round(resumoPrograma.abpTotal)} m²`} />
            <ResumoItem label="Área vendável equivalente" valor={`${Math.round(resumoPrograma.areaVendavelEquivalenteTotal)} m²`} />
            <ResumoItem label="Número de unidades" valor={String(resumoPrograma.totalUnidades)} />
            <ResumoItem label="Preço médio por m²" valor={`€${Math.round(resumoPrograma.precoMedioPonderadoM2).toLocaleString("pt-PT")}`} />
            <ResumoItem label="GDV" valor={`€${Math.round(resultado.gdv).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Custo total" valor={`€${Math.round(resultado.custoTotal).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Lucro" valor={`€${Math.round(resultado.lucroLevered).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Margem" valor={`${(resultado.margem * 100).toFixed(1)}%`} />
            <ResumoItem label="Peak cash exposure" valor={`€${Math.round(resultado.equity.peakCashExposure).toLocaleString("pt-PT")}`} />
            <ResumoItem label="Peak debt" valor={`€${Math.round(resultado.financiamento.peakDebt).toLocaleString("pt-PT")}`} />
            <ResumoItem
              label="IRR (levered)"
              valor={(() => {
                const irr = extrairIndicador(resultado, "irr_levered");
                return irr !== null ? `${(irr * 100).toFixed(1)}%` : "Não calculável";
              })()}
            />
            <ResumoItem label="MOIC" valor={`${(extrairIndicador(resultado, "moic") ?? 0).toFixed(2)}x`} />
          </div>
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
                  <th className="pb-2 pr-2">CF unlevered</th>
                  <th className="pb-2 pr-2">Drawdown</th>
                  <th className="pb-2 pr-2">Juros+fees</th>
                  <th className="pb-2 pr-2">CF levered</th>
                  <th className="pb-2 pr-2">Equity call</th>
                  <th className="pb-2 pr-2">Distribuições</th>
                  <th className="pb-2 pr-2">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l) => (
                  <tr key={l.mes} className="border-t border-[#E3DACB]">
                    <td className="py-1 pr-2">{l.mes}</td>
                    <td className="py-1 pr-2">€{Math.round(l.receitaVendas).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.custosAquisicao + l.hardCosts + l.softCosts + l.outrosCustos).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.cashFlowUnlevered).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.drawdown).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.jurosEFees).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.cashFlowLevered).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.equityCall).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.distribuicoes).toLocaleString("pt-PT")}</td>
                    <td className="py-1 pr-2">€{Math.round(l.saldoCaixaAcumulado).toLocaleString("pt-PT")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subtab === "Capex" && resultado && (
        <Card title="Capex por categoria">
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
              ).map(([categoria, valor]) => (
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
                <ResumoItem label="Capital devolvido" valor={`€${Math.round(resultado.equity.capitalDevolvidoTotal).toLocaleString("pt-PT")}`} />
                <ResumoItem label="Lucro" valor={`€${Math.round(resultado.lucroLevered).toLocaleString("pt-PT")}`} />
                <ResumoItem label="MOIC" valor={`${(extrairIndicador(resultado, "moic") ?? 0).toFixed(2)}x`} />
                <ResumoItem
                  label="IRR"
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
        <Card title="Sensibilidades" subtitle="Cada célula recalcula o modelo completo — a célula central (0%×0%) é sempre igual ao cenário-base.">
          <Row>
            <Field label="Matriz">
              <select className="input-dark" value={sensMatriz} onChange={(e) => setSensMatriz(e.target.value as MatrizSensibilidade)}>
                <option value="aquisicao_vs_custo_construcao">Aquisição × Custo de construção</option>
                <option value="custo_construcao_vs_preco_venda">Custo de construção × Preço de venda</option>
                <option value="aquisicao_vs_preco_venda">Aquisição × Preço de venda</option>
              </select>
            </Field>
            <Field label="Indicador">
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
            </Field>
          </Row>
          <SensibilidadesMatriz
            base={{
              linhasCusto: custosNovos,
              contextoCusto,
              receitaTotalGdvBase: vgvBruto,
              planoVendas,
              parametrosFinanciamento: financiamento,
            }}
            matriz={sensMatriz}
            indicador={sensIndicador}
          />
        </Card>
      )}

      <Card title="Motor antigo (compatibilidade)" subtitle="Continua a alimentar o dashboard atual — independente do motor novo acima.">
        <button
          onClick={onCalcular}
          disabled={calculando}
          className="px-6 py-3 rounded-lg bg-[#142B3A] text-white text-sm font-bold disabled:opacity-60"
        >
          {calculando ? "A calcular…" : "Calcular viabilidade (motor antigo)"}
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

function ResumoItem({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <span className="text-xs text-[#59636A] block">{label}</span>
      <span className="font-semibold text-[#142B3A]">{valor}</span>
    </div>
  );
}

function SensibilidadesMatriz({
  base,
  matriz,
  indicador,
}: {
  base: PremissasBaseSensibilidade;
  matriz: MatrizSensibilidade;
  indicador: IndicadorSensibilidade;
}) {
  const resultado = calcularMatrizSensibilidade(base, matriz, indicador);
  const formatar = (v: number | null) => {
    if (v === null) return "—";
    if (indicador.startsWith("irr") || indicador === "margem" || indicador === "roe") return `${(v * 100).toFixed(1)}%`;
    if (indicador === "moic") return `${v.toFixed(2)}x`;
    return `€${Math.round(v).toLocaleString("pt-PT")}`;
  };

  return (
    <table className="w-full text-xs text-center">
      <tbody>
        {resultado.celulas.map((linha, i) => (
          <tr key={i}>
            {linha.map((celula, j) => {
              const central = celula.variacaoLinha === 0 && celula.variacaoColuna === 0;
              return (
                <td
                  key={j}
                  title={`GDV: €${Math.round(celula.gdv).toLocaleString("pt-PT")} · Custo total: €${Math.round(celula.custoTotal).toLocaleString("pt-PT")} · Lucro: €${Math.round(celula.lucro).toLocaleString("pt-PT")} · Margem: ${(celula.margem * 100).toFixed(1)}%`}
                  className={`p-2 border border-[#E3DACB] ${central ? "bg-[#B96343]/20 font-bold" : ""}`}
                >
                  {formatar(celula.valor)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
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
function PercentInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      className="input-dark"
      value={Math.round(value * 1000) / 10}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      disabled={disabled}
    />
  );
}

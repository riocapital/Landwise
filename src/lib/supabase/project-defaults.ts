import type { SupabaseClient } from "@supabase/supabase-js";
import type { Typology } from "../calc/areas";
import type { LinhaCusto, GrupoCusto, TipoCalculoCusto } from "../calc/custos";
import { criarTipologia, atualizarTipologia } from "./project-typologies";
import { criarCusto, atualizarCusto } from "./project-costs";

const TIPOLOGIAS_PADRAO = ["T1", "T2", "T3", "T4"] as const;

export async function garantirTipologiasPadrao(
  supabase: SupabaseClient,
  projectId: string,
  existentes: Typology[]
): Promise<Typology[]> {
  if (existentes.length > 0) return existentes;
  const criadas: Typology[] = [];
  for (let ordem = 0; ordem < TIPOLOGIAS_PADRAO.length; ordem += 1) {
    const nova = await criarTipologia(supabase, projectId, ordem);
    if (!nova) continue;
    const patch: Partial<Typology> = {
      nome: TIPOLOGIAS_PADRAO[ordem],
      quantidade: 0,
      abpUnidade: 0,
      varandaM2: 0,
      terracoM2: 0,
      jardimPrivativoM2: 0,
      arrecadacaoM2: 0,
      estacionamentosIncluidos: 0,
      valorEstacionamento: 0,
      precoBaseM2: 0,
      mesesParaPrimeiraVenda: ordem + 1,
      unidadesPorMes: 1,
    };
    await atualizarTipologia(supabase, nova.id, patch);
    criadas.push({ ...nova, ...patch });
  }
  return criadas;
}

type CustoPadrao = {
  grupo: GrupoCusto;
  nome: string;
  tipoCalculo: TipoCalculoCusto;
  valorInput?: number;
  taxaIva?: number | null;
  ivaRecuperavelPct?: number;
  perfilDesembolso?: LinhaCusto["perfilDesembolso"];
};

export const CUSTOS_PADRAO: CustoPadrao[] = [
  { grupo: "aquisicao", nome: "Sinal da aquisição", tipoCalculo: "valor_fixo", perfilDesembolso: "unico_inicio" },
  { grupo: "aquisicao", nome: "Escritura da aquisição", tipoCalculo: "valor_fixo", perfilDesembolso: "unico_inicio" },
  { grupo: "aquisicao", nome: "Due diligence técnica", tipoCalculo: "valor_fixo" },
  { grupo: "aquisicao", nome: "Due diligence legal", tipoCalculo: "valor_fixo" },
  { grupo: "aquisicao", nome: "Notário", tipoCalculo: "valor_fixo", valorInput: 1000 },
  { grupo: "aquisicao", nome: "Registos", tipoCalculo: "valor_fixo", valorInput: 1000 },
  { grupo: "aquisicao", nome: "IMT", tipoCalculo: "valor_fixo" },
  { grupo: "aquisicao", nome: "Imposto do selo", tipoCalculo: "valor_fixo" },
  { grupo: "aquisicao", nome: "Comissão de aquisição", tipoCalculo: "valor_fixo" },
  { grupo: "aquisicao", nome: "Outros custos de aquisição", tipoCalculo: "valor_fixo" },
  { grupo: "hard_cost", nome: "Construção acima do solo", tipoCalculo: "eur_m2_abc_acima", taxaIva: 0.23, perfilDesembolso: "linear" },
  { grupo: "hard_cost", nome: "Construção abaixo do solo", tipoCalculo: "eur_m2_abc_abaixo", taxaIva: 0.23, perfilDesembolso: "linear" },
  { grupo: "hard_cost", nome: "Construção dependente", tipoCalculo: "eur_m2_abd", taxaIva: 0.23, perfilDesembolso: "linear" },
  { grupo: "soft_cost", nome: "Arquitetura", tipoCalculo: "valor_fixo", taxaIva: 0.23 },
  { grupo: "soft_cost", nome: "Engenharia", tipoCalculo: "valor_fixo", taxaIva: 0.23 },
  { grupo: "soft_cost", nome: "Fiscalização de obra", tipoCalculo: "valor_mensal", taxaIva: 0.23, perfilDesembolso: "linear" },
  { grupo: "soft_cost", nome: "Licenças e taxas", tipoCalculo: "valor_fixo", taxaIva: 0.23 },
  { grupo: "soft_cost", nome: "FF&E", tipoCalculo: "valor_fixo", taxaIva: 0.23 },
  { grupo: "soft_cost", nome: "Contingência", tipoCalculo: "percentagem_hard_costs", taxaIva: 0.23 },
  { grupo: "soft_cost", nome: "Outros custos", tipoCalculo: "valor_fixo", taxaIva: 0.23 },
  { grupo: "soft_cost", nome: "Marketing e comercialização", tipoCalculo: "valor_fixo", taxaIva: 0.23 },
];

const aliases = new Map<string, string>([
  ["sinal", "Sinal da aquisição"],
  ["escritura", "Escritura da aquisição"],
  ["dd técnica", "Due diligence técnica"],
  ["dd tecnica", "Due diligence técnica"],
  ["dd legal", "Due diligence legal"],
  ["comercialização", "Marketing e comercialização"],
  ["comercializacao", "Marketing e comercialização"],
  ["fiscalização", "Fiscalização de obra"],
  ["fiscalizacao", "Fiscalização de obra"],
  ["licenciamento", "Licenças e taxas"],
  ["licenças", "Licenças e taxas"],
  ["licencas", "Licenças e taxas"],
]);

const chave = (grupo: GrupoCusto, nome: string) => `${grupo}::${nome.trim().toLocaleLowerCase("pt-PT")}`;

export async function garantirCustosPadrao(
  supabase: SupabaseClient,
  projectId: string,
  existentes: LinhaCusto[]
): Promise<LinhaCusto[]> {
  const normalizados = [...existentes];

  for (let i = 0; i < normalizados.length; i += 1) {
    const atual = normalizados[i];
    const nomeNovo = aliases.get(atual.nome.trim().toLocaleLowerCase("pt-PT"));
    if (nomeNovo && nomeNovo !== atual.nome) {
      await atualizarCusto(supabase, atual.id, { nome: nomeNovo });
      normalizados[i] = { ...atual, nome: nomeNovo };
    }
  }

  const porChave = new Map(normalizados.map((c) => [chave(c.grupo, c.nome), c]));
  let ordem = normalizados.length;
  for (const padrao of CUSTOS_PADRAO) {
    const existente = porChave.get(chave(padrao.grupo, padrao.nome));
    if (existente) {
      const patch: Partial<LinhaCusto> = {};
      if (padrao.nome === "Fiscalização de obra" && existente.tipoCalculo !== "valor_mensal") patch.tipoCalculo = "valor_mensal";
      if (padrao.nome === "Construção acima do solo") patch.tipoCalculo = "eur_m2_abc_acima";
      if (padrao.nome === "Construção abaixo do solo") patch.tipoCalculo = "eur_m2_abc_abaixo";
      if (padrao.nome === "Construção dependente") patch.tipoCalculo = "eur_m2_abd";
      if (padrao.nome === "Notário" && existente.valorInput === 0) patch.valorInput = 1000;
      if (Object.keys(patch).length > 0) {
        await atualizarCusto(supabase, existente.id, patch);
        Object.assign(existente, patch);
      }
      continue;
    }

    const novo = await criarCusto(supabase, projectId, padrao.grupo, padrao.nome, ordem);
    ordem += 1;
    if (!novo) continue;
    const patch: Partial<LinhaCusto> = {
      tipoCalculo: padrao.tipoCalculo,
      valorInput: padrao.valorInput ?? 0,
      taxaIva: padrao.taxaIva ?? null,
      ivaRecuperavelPct: padrao.ivaRecuperavelPct ?? 0,
      perfilDesembolso: padrao.perfilDesembolso ?? "unico_inicio",
    };
    await atualizarCusto(supabase, novo.id, patch);
    const completo = { ...novo, ...patch };
    normalizados.push(completo);
    porChave.set(chave(completo.grupo, completo.nome), completo);
  }

  return normalizados;
}

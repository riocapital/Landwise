// scripts/migrate-legacy-typologies.ts
//
// Migra inputs.tipologias + inputs.mapaVendas (motor antigo) para
// project_typologies + project_units (Sales Table, motor novo).
//
// IDEMPOTENTE: nunca corre num projeto que já tenha linhas em
// project_typologies — correr duas vezes não duplica nada.
// NÃO APAGA NADA: inputs.tipologias/mapaVendas ficam intactos no JSONB,
// só deixam de ser a fonte usada pela UI (secção 5 do plano de revisão).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-legacy-typologies.ts

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de correr este script.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type TipologiaAntiga = { nome: string; gpa: number; varanda: number; terraco: number; precoBaseM2: number };
type LinhaVendasAntiga = { bloco: string; piso: number; tipologia: string; quantidade: number; premioPiso: number };

async function main() {
  const relatorio = {
    projetosLidos: 0,
    projetosMigrados: 0,
    projetosIgnorados: 0, // já tinham dados no motor novo, ou não tinham dados antigos
    tipologiasCriadas: 0,
    unidadesCriadas: 0,
    erros: [] as string[],
  };

  const { data: projetos, error } = await supabase.from("projects").select("id, nome, inputs");
  if (error) {
    console.error("Falha ao ler projetos:", error.message);
    process.exit(1);
  }

  relatorio.projetosLidos = projetos?.length ?? 0;

  for (const projeto of projetos ?? []) {
    const tipologiasAntigas: TipologiaAntiga[] = projeto.inputs?.tipologias ?? [];
    const mapaVendasAntigo: LinhaVendasAntiga[] = projeto.inputs?.mapaVendas ?? [];

    if (tipologiasAntigas.length === 0) {
      relatorio.projetosIgnorados++;
      continue;
    }

    const { count } = await supabase
      .from("project_typologies")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projeto.id);

    if ((count ?? 0) > 0) {
      console.log(`Projeto "${projeto.nome}" já tem tipologias no motor novo — ignorado (idempotente).`);
      relatorio.projetosIgnorados++;
      continue;
    }

    console.log(`A migrar "${projeto.nome}"...`);

    // 1) Tipologias antigas -> project_typologies
    const idsPorNome = new Map<string, string>();
    for (const [i, t] of tipologiasAntigas.entries()) {
      const { data: nova, error: erroInsert } = await supabase
        .from("project_typologies")
        .insert({
          project_id: projeto.id,
          nome: t.nome,
          quantidade: 0, // a quantidade real vem do mapa de vendas, somada a seguir
          abp_unidade: t.gpa,
          varanda_m2: t.varanda,
          varanda_pct_valorizacao: 0.3,
          terraco_m2: t.terraco,
          terraco_pct_valorizacao: 0.3,
          preco_base_m2: t.precoBaseM2,
          ordem: i,
        })
        .select()
        .single();

      if (erroInsert || !nova) {
        relatorio.erros.push(`Tipologia "${t.nome}" do projeto "${projeto.nome}": ${erroInsert?.message}`);
        continue;
      }
      idsPorNome.set(t.nome, nova.id);
      relatorio.tipologiasCriadas++;
    }

    // 2) Mapa de vendas antigo -> project_units (uma linha por unidade real)
    const quantidadePorTipologia = new Map<string, number>();
    for (const linha of mapaVendasAntigo) {
      quantidadePorTipologia.set(linha.tipologia, (quantidadePorTipologia.get(linha.tipologia) ?? 0) + linha.quantidade);
    }

    for (const linha of mapaVendasAntigo) {
      const tipologiaId = idsPorNome.get(linha.tipologia);
      const tipologiaOriginal = tipologiasAntigas.find((t) => t.nome === linha.tipologia);
      if (!tipologiaId || !tipologiaOriginal) {
        relatorio.erros.push(`Linha de mapa de vendas do projeto "${projeto.nome}" refere tipologia desconhecida: "${linha.tipologia}"`);
        continue;
      }

      // Prémio de piso (percentagem antiga) convertido para valor absoluto,
      // uma única vez, no momento da migração — nunca reaplicado depois.
      const areaVendavelEstimativa = tipologiaOriginal.gpa + tipologiaOriginal.varanda * 0.3 + tipologiaOriginal.terraco * 0.3;
      const premioAbsoluto = tipologiaOriginal.precoBaseM2 * areaVendavelEstimativa * linha.premioPiso;

      const unidades = Array.from({ length: linha.quantidade }, (_, i) => ({
        project_id: projeto.id,
        typology_id: tipologiaId,
        ordem: i,
        bloco: linha.bloco,
        piso: String(linha.piso),
        abp: tipologiaOriginal.gpa,
        varanda_m2: tipologiaOriginal.varanda,
        terraco_m2: tipologiaOriginal.terraco,
        preco_base_m2: tipologiaOriginal.precoBaseM2,
        premio_desconto_unidade: premioAbsoluto,
        estado_comercial: "disponivel",
      }));

      const { error: erroUnidades, count: criadas } = await supabase
        .from("project_units")
        .insert(unidades, { count: "exact" });
      if (erroUnidades) {
        relatorio.erros.push(`Unidades de "${linha.tipologia}" no projeto "${projeto.nome}": ${erroUnidades.message}`);
        continue;
      }
      relatorio.unidadesCriadas += criadas ?? unidades.length;
    }

    // 3) Atualiza a quantidade das tipologias para refletir o total real de unidades criadas
    for (const [nomeTipologia, quantidade] of quantidadePorTipologia) {
      const tipologiaId = idsPorNome.get(nomeTipologia);
      if (tipologiaId) {
        await supabase.from("project_typologies").update({ quantidade }).eq("id", tipologiaId);
      }
    }

    relatorio.projetosMigrados++;
  }

  console.log("\n=== Relatório da migração ===");
  console.log(`Projetos lidos: ${relatorio.projetosLidos}`);
  console.log(`Projetos migrados: ${relatorio.projetosMigrados}`);
  console.log(`Projetos ignorados (já migrados ou sem dados antigos): ${relatorio.projetosIgnorados}`);
  console.log(`Tipologias criadas: ${relatorio.tipologiasCriadas}`);
  console.log(`Unidades criadas: ${relatorio.unidadesCriadas}`);
  console.log(`Erros: ${relatorio.erros.length}`);
  relatorio.erros.forEach((e) => console.log(` - ${e}`));
}

main();

/**
 * Importador de comparáveis de mercado — Landwise
 *
 * Uso:
 *   npx tsx scripts/import-comparables.ts <caminho-para-o-ficheiro.xlsx>
 *
 * Requer, apenas no ambiente do script (nunca no browser):
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * O que faz:
 *   1. Lê a folha "Base Anúncios" do Excel fornecido.
 *   2. Normaliza cada linha para o esquema de `market_comparables`.
 *   3. Calcula preço/m² sempre a partir de price/área (nunca confia em
 *      fórmulas do Excel).
 *   4. Faz upsert por (source, external_id) — correr o mesmo ficheiro duas
 *      vezes NÃO duplica linhas, atualiza-as.
 *   5. Regista um lote em `comparable_import_batches` com o relatório.
 *
 * Este script usa a service role key — corre SÓ localmente/CI, nunca no
 * browser nem em código "use client".
 */

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const SHEET_NAME = "Base Anúncios";

type LinhaNormalizada = {
  source: string;
  external_id: string;
  source_url: string | null;
  listing_title: string | null;
  property_type: string | null;
  typology: string | null;
  condition: string;
  is_new_construction: boolean | null;
  asking_or_transaction: "pedido" | "transacao" | "avaliacao" | "estimativa";
  price: number | null;
  private_area: number | null;
  gross_area: number | null;
  dependent_area: number | null;
  area_basis: "abp" | "area_bruta" | "area_total" | "nao_identificada";
  price_per_sqm: number | null;
  address: string | null;
  postal_code: string | null;
  zone: string | null;
  parish: string | null;
  municipality: string | null;
  district: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  elevator: boolean | null;
  terrace: boolean | null;
  garden: boolean | null;
  floor: string | null;
  listing_date: string | null;
  collection_date: string | null;
  is_probable_duplicate: boolean;
  duplicate_group_id: string | null;
  raw_data: Record<string, unknown>;
};

const MAPA_ESTADO: Record<string, LinhaNormalizada["condition"]> = {
  "Novo/Nova construção": "Nova construção",
  "Em construção": "Em construção",
  "Remodelado/Renovado": "Totalmente renovado",
  "Usado - bom estado": "Bom estado",
  Usado: "Usado",
  "Para remodelar": "Para remodelar",
  Ruína: "Ruína",
  "Não indicado": "Desconhecido",
};

function normalizarSimNao(v: unknown): boolean | null {
  if (v === "Sim") return true;
  if (v === "Não") return false;
  return null;
}

function normalizarLinha(row: Record<string, unknown>): LinhaNormalizada {
  const preco = typeof row["Preço (€)"] === "number" ? (row["Preço (€)"] as number) : null;
  const area = typeof row["Área (m²)"] === "number" ? (row["Área (m²)"] as number) : null;
  const tipoArea = row["Tipo de área"] as string | undefined;

  const areaBasis: LinhaNormalizada["area_basis"] = tipoArea === "Bruta" ? "area_bruta" : "nao_identificada";
  const grossArea = areaBasis === "area_bruta" ? area : null;
  const precoPorM2 = preco && area ? Number((preco / area).toFixed(2)) : null;

  const estado = (row["Estado"] as string) ?? "Não indicado";
  const condicaoNormalizada = MAPA_ESTADO[estado] ?? "Desconhecido";

  return {
    source: String(row["Portal"] ?? ""),
    external_id: String(row["Referência"] ?? ""),
    source_url: (row["URL"] as string) ?? null,
    listing_title: (row["Título"] as string) ?? null,
    property_type: (row["Tipo de imóvel"] as string) ?? null,
    typology: (row["Tipologia"] as string) ?? null,
    condition: condicaoNormalizada,
    is_new_construction: condicaoNormalizada === "Nova construção",
    asking_or_transaction: "pedido",
    price: preco,
    private_area: null, // a fonte não distingue ABP de área bruta com confiança suficiente
    gross_area: grossArea,
    dependent_area: null,
    area_basis: areaBasis,
    price_per_sqm: precoPorM2,
    address: (row["Rua"] as string) ?? null,
    postal_code: null, // não disponível nesta fonte
    zone: (row["Zona"] as string) ?? null,
    parish: (row["Freguesia"] as string) ?? null,
    municipality: (row["Concelho"] as string) ?? null,
    district: (row["Distrito"] as string) ?? null,
    bedrooms: typeof row["Quartos"] === "number" ? (row["Quartos"] as number) : null,
    bathrooms: typeof row["Casas de banho"] === "number" ? (row["Casas de banho"] as number) : null,
    parking_spaces: row["Garagem/Estac."] === "Sim" ? 1 : null,
    elevator: normalizarSimNao(row["Elevador"]),
    terrace: normalizarSimNao(row["Varanda/Terraço"]),
    garden: normalizarSimNao(row["Jardim"]),
    floor: (row["Piso"] as string) ?? null,
    listing_date: null, // a fonte só regista a data de recolha, não a data de publicação
    collection_date: row["Data recolha"] ? new Date(row["Data recolha"] as string).toISOString().slice(0, 10) : null,
    is_probable_duplicate: row["Status duplicado"] !== "Único na amostra",
    duplicate_group_id: (row["Grupo duplicado"] as string) ?? null,
    raw_data: row,
  };
}

async function main() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error("Uso: npx tsx scripts/import-comparables.ts <ficheiro.xlsx>");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de correr este script.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    console.error(`A folha "${SHEET_NAME}" não foi encontrada em ${caminho}.`);
    process.exit(1);
  }

  const cabecalho: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cabecalho[colNumber] = String(cell.value ?? "");
  });

  const linhas: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // cabeçalho
    const linha: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const chave = cabecalho[colNumber];
      if (!chave) return;
      // ExcelJS devolve objetos { formula, result } para células com fórmula
      // (ex.: "€/m² calculado"). Usamos sempre o valor calculado, nunca a
      // fórmula em si — e, de qualquer forma, este importador recalcula o
      // preço por m² de raiz a partir de price/área (ver normalizarLinha).
      const valor = cell.value as unknown;
      if (valor && typeof valor === "object" && "result" in (valor as Record<string, unknown>)) {
        linha[chave] = (valor as { result: unknown }).result;
      } else if (valor instanceof Date) {
        linha[chave] = valor.toISOString();
      } else {
        linha[chave] = valor ?? null;
      }
    });
    linhas.push(linha);
  });

  const relatorio = {
    total_rows_read: linhas.length,
    total_imported: 0,
    total_updated: 0,
    total_ignored: 0,
    duplicates_found: 0,
    missing_price: 0,
    missing_area: 0,
    missing_location: 0,
    missing_condition: 0,
    import_errors: [] as string[],
  };

  const normalizadas = linhas.map(normalizarLinha);

  for (const linha of normalizadas) {
    if (!linha.price) relatorio.missing_price++;
    if (!linha.gross_area && !linha.private_area) relatorio.missing_area++;
    if (!linha.parish && !linha.municipality) relatorio.missing_location++;
    if (linha.condition === "Desconhecido") relatorio.missing_condition++;
    if (linha.is_probable_duplicate) relatorio.duplicates_found++;
  }

  // Regista o lote primeiro para obter o id a associar a cada comparável.
  const { data: lote, error: erroLote } = await supabase
    .from("comparable_import_batches")
    .insert({ source_file: caminho, ...relatorio })
    .select()
    .single();

  if (erroLote || !lote) {
    console.error("Falha ao criar o lote de importação:", erroLote);
    process.exit(1);
  }

  const registosParaUpsert = normalizadas
    .filter((l) => l.source && l.external_id)
    .map((l) => ({ ...l, import_batch_id: lote.id }));

  relatorio.total_ignored = normalizadas.length - registosParaUpsert.length;

  // Upsert em lotes de 200 para não exceder limites de payload.
  const TAMANHO_LOTE = 200;
  for (let i = 0; i < registosParaUpsert.length; i += TAMANHO_LOTE) {
    const bloco = registosParaUpsert.slice(i, i + TAMANHO_LOTE);
    const { error, count } = await supabase
      .from("market_comparables")
      .upsert(bloco, { onConflict: "source,external_id", count: "exact" });

    if (error) {
      relatorio.import_errors.push(`Bloco ${i}-${i + bloco.length}: ${error.message}`);
      continue;
    }
    relatorio.total_imported += count ?? bloco.length;
  }

  // Atualiza o lote com os números finais.
  await supabase
    .from("comparable_import_batches")
    .update({
      total_imported: relatorio.total_imported,
      total_ignored: relatorio.total_ignored,
      import_errors: relatorio.import_errors,
    })
    .eq("id", lote.id);

  console.log("Relatório de importação");
  console.table(relatorio);
}

main();

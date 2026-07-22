// Tipo espelho da tabela `market_comparables` (ver
// supabase/migrations/0003_market_comparables.sql). Mantido em snake_case
// de propósito — é o mesmo shape que vem diretamente do Supabase, sem
// camada de tradução extra que possa divergir do schema real.

export type MarketComparable = {
  id: string;
  source: string;
  external_id: string;
  source_url: string | null;
  listing_title: string | null;

  property_type: string | null;
  typology: string | null;
  condition: string | null;
  construction_status: string | null;
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
  locality: string | null;
  parish: string | null;
  municipality: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;

  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  elevator: boolean | null;
  terrace: boolean | null;
  balcony: boolean | null;
  garden: boolean | null;
  floor: string | null;
  energy_rating: string | null;

  listing_date: string | null;
  collection_date: string | null;

  active: boolean;
  is_probable_duplicate: boolean;
  duplicate_group_id: string | null;

  import_batch_id: string | null;
  raw_data: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
};

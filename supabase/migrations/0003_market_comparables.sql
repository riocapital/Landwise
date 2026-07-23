-- ============================================================
-- Landwise — Fase 3: Base de comparáveis de mercado
-- Tabelas: comparable_import_batches, market_comparables
--
-- ADITIVO. Executar depois de 0002_wizard_v2_foundation.sql.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Lotes de importação — um registo por execução do importador
-- ------------------------------------------------------------
create table if not exists comparable_import_batches (
  id uuid default gen_random_uuid() primary key,
  source_file text not null,
  imported_by uuid references auth.users on delete set null,

  total_rows_read integer not null default 0,
  total_imported integer not null default 0,
  total_updated integer not null default 0,
  total_ignored integer not null default 0,
  duplicates_found integer not null default 0,
  missing_price integer not null default 0,
  missing_area integer not null default 0,
  missing_location integer not null default 0,
  missing_condition integer not null default 0,
  import_errors jsonb not null default '[]'::jsonb,
  notes text,

  created_at timestamp with time zone default now()
);

alter table comparable_import_batches enable row level security;

-- Leitura: qualquer utilizador autenticado pode ver o histórico de importações
-- (transparência de fonte/data, secção 16 do plano). Escrita: só service_role
-- (o SQL Editor/scripts de importação correm como postgres, ignorando RLS —
-- não há política de insert/update/delete para 'authenticated' de propósito).
create policy "Utilizadores autenticados veem os lotes de importação"
on comparable_import_batches for select
to authenticated
using (true);

-- ------------------------------------------------------------
-- 2) Comparáveis de mercado
-- ------------------------------------------------------------
create table if not exists market_comparables (
  id uuid default gen_random_uuid() primary key,

  source text not null,                 -- 'Idealista' | 'Imovirtual' | 'RE/MAX' | ...
  external_id text not null,            -- referência/ID no portal de origem
  source_url text,
  listing_title text,

  property_type text,                   -- 'Apartamento' | 'Moradia' | 'Duplex' | 'Penthouse' | 'Outro'
  typology text,                        -- 'T0'..'T10', 'T9+'
  condition text                        -- categorias normalizadas (secção 3 do plano)
    check (condition in (
      'Nova construção','Em construção','Totalmente renovado','Bom estado',
      'Usado','Para remodelar','Ruína','Desconhecido'
    )),
  construction_status text,             -- granularidade adicional, quando disponível na fonte (pode ficar null)
  is_new_construction boolean,

  asking_or_transaction text            -- tipo de valor — nunca confundir preço pedido com transação
    check (asking_or_transaction in ('pedido','transacao','avaliacao','estimativa'))
    default 'pedido',

  price numeric,
  private_area numeric,                 -- ABP, quando a fonte permite essa conclusão (ver area_basis)
  gross_area numeric,
  dependent_area numeric,
  area_basis text                       -- base sobre a qual o preço/m² foi calculado — nunca apresentar
    check (area_basis in ('abp','area_bruta','area_total','nao_identificada')) -- "€/m² ABP" sem certeza da base (secção 4 do plano)
    default 'nao_identificada',
  price_per_sqm numeric,                -- sempre recalculado no importador (price / área usada), nunca vindo de fórmula do Excel

  address text,
  postal_code text,
  zone text,
  locality text,
  parish text,
  municipality text,
  district text,
  latitude numeric,
  longitude numeric,

  bedrooms integer,
  bathrooms integer,
  parking_spaces integer,
  elevator boolean,
  terrace boolean,
  balcony boolean,
  garden boolean,
  floor text,
  energy_rating text,

  listing_date date,
  collection_date date,

  active boolean not null default true,

  -- Duplicação: NUNCA apagar automaticamente (podem ser unidades distintas
  -- do mesmo empreendimento) — apenas sinalizar, conforme a metodologia da
  -- própria base fornecida. O motor de comparáveis decide se usa 1 por
  -- grupo nas medianas, mas a tabela preserva todas as observações.
  is_probable_duplicate boolean not null default false,
  duplicate_group_id text,

  import_batch_id uuid references comparable_import_batches(id) on delete set null,
  raw_data jsonb,                       -- linha original completa, para nunca perder informação da fonte

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  unique (source, external_id)          -- chave natural para upsert idempotente
);

alter table market_comparables enable row level security;

create policy "Utilizadores autenticados consultam comparáveis"
on market_comparables for select
to authenticated
using (true);

-- Sem políticas de insert/update/delete para 'authenticated' — só
-- service_role (script de importação) ou o SQL Editor podem escrever aqui,
-- conforme a secção 3 do plano.

create trigger market_comparables_set_updated_at
before update on market_comparables
for each row execute function set_updated_at();

create index if not exists idx_market_comparables_zone on market_comparables(zone);
create index if not exists idx_market_comparables_parish on market_comparables(parish);
create index if not exists idx_market_comparables_municipality on market_comparables(municipality);
create index if not exists idx_market_comparables_typology on market_comparables(typology);
create index if not exists idx_market_comparables_condition on market_comparables(condition);
create index if not exists idx_market_comparables_active on market_comparables(active);
create index if not exists idx_market_comparables_duplicate_group on market_comparables(duplicate_group_id);

-- ------------------------------------------------------------
-- 3) Seleções de comparáveis por projeto (para o drawer "Ver comparáveis
--    utilizados" — liga um projeto aos comparáveis que fundamentaram a
--    sugestão de preço de uma tipologia específica).
-- ------------------------------------------------------------
create table if not exists project_comparable_selections (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  typology_id uuid references project_typologies(id) on delete cascade,
  comparable_id uuid references market_comparables(id) on delete cascade not null,

  score numeric,                        -- score de comparabilidade 0-100 no momento do cálculo
  distancia_km numeric,

  created_at timestamp with time zone default now()
);

alter table project_comparable_selections enable row level security;

create policy "Utilizador vê as seleções dos próprios projetos"
on project_comparable_selections for select
to authenticated
using (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

create policy "Utilizador cria seleções nos próprios projetos"
on project_comparable_selections for insert
to authenticated
with check (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

create policy "Utilizador apaga seleções dos próprios projetos"
on project_comparable_selections for delete
to authenticated
using (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

create index if not exists idx_pcs_project_id on project_comparable_selections(project_id);

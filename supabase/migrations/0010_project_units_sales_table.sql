-- ============================================================
-- Landwise — Revisão estrutural, Fase 1: Sales Table (project_units)
--
-- Fonte única do VGV (secções 14/19 do plano de revisão). Cada linha é uma
-- unidade real do projeto, gerada a partir de project_typologies.
--
-- ADITIVO. Executar depois de 0002-0009.
-- ============================================================

create table if not exists project_units (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  typology_id uuid references project_typologies(id) on delete cascade not null,

  ordem integer not null default 0,
  bloco text,
  piso text,

  abp numeric not null default 0,
  varanda_m2 numeric not null default 0,
  terraco_m2 numeric not null default 0,
  outras_areas_m2 numeric not null default 0,

  estacionamentos integer not null default 0,
  valor_estacionamento numeric not null default 0,

  preco_base_m2 numeric not null default 0,
  ajuste_fase_comercial_pct numeric not null default 0,
  premio_desconto_unidade numeric not null default 0,
  override_manual_valor numeric,

  preco_bloqueado boolean not null default false,
  personalizada boolean not null default false,

  data_venda date,
  sinal_valor numeric not null default 0,
  reforcos_valor numeric not null default 0,
  data_escritura date,
  estado_comercial text not null default 'disponivel'
    check (estado_comercial in ('disponivel', 'reservado', 'vendido', 'escriturado')),

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_units enable row level security;

create policy "Utilizador vê as unidades dos próprios projetos"
on project_units for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere as unidades dos próprios projetos (insert)"
on project_units for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere as unidades dos próprios projetos (update)"
on project_units for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere as unidades dos próprios projetos (delete)"
on project_units for delete
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_units_set_updated_at
before update on project_units
for each row execute function set_updated_at();

create index if not exists idx_project_units_project_id on project_units(project_id);
create index if not exists idx_project_units_typology_id on project_units(typology_id);
create index if not exists idx_project_units_estado_comercial on project_units(estado_comercial);

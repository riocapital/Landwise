-- ============================================================
-- Landwise — Fase 5 (parte 3): Estrutura de Capital, Investidores e Fees
--
-- ADITIVO. Executar depois de 0002-0006.
-- ============================================================

create table if not exists project_capital_structure (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null unique,

  tem_investidor_externo boolean not null default false,
  modelo text
    check (modelo in ('promotor_sozinho', 'joint_venture_simples', 'family_office_sem_fees', 'family_office_com_fees', 'personalizado'))
    default 'promotor_sozinho',
  percentagem_investidor numeric not null default 0 check (percentagem_investidor between 0 and 1),

  catch_up_ativo boolean not null default false,
  catch_up_pct numeric default 0,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_capital_structure enable row level security;

create policy "Utilizador vê a estrutura de capital dos próprios projetos"
on project_capital_structure for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador cria a estrutura de capital nos próprios projetos"
on project_capital_structure for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador edita a estrutura de capital dos próprios projetos"
on project_capital_structure for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_capital_structure_set_updated_at
before update on project_capital_structure
for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Tiers de hurdle (repetível → tabela relacional, secção 18 do plano)
-- ------------------------------------------------------------
create table if not exists project_waterfall_tiers (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,

  hurdle_irr numeric not null,
  promote_pct_acima numeric not null check (promote_pct_acima between 0 and 1),
  ordem integer not null default 0,

  created_at timestamp with time zone default now()
);

alter table project_waterfall_tiers enable row level security;

create policy "Utilizador vê os tiers dos próprios projetos"
on project_waterfall_tiers for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os tiers dos próprios projetos (insert)"
on project_waterfall_tiers for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os tiers dos próprios projetos (update)"
on project_waterfall_tiers for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os tiers dos próprios projetos (delete)"
on project_waterfall_tiers for delete
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create index if not exists idx_project_waterfall_tiers_project_id on project_waterfall_tiers(project_id);

-- ------------------------------------------------------------
-- Fees (repetível → tabela relacional; todos começam a 0 — secção 9 do plano)
-- ------------------------------------------------------------
create table if not exists project_fees (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,

  nome text not null,
  tipo text not null
    check (tipo in ('origination', 'development', 'asset_management', 'project_management', 'acquisition', 'disposition', 'outro')),
  base_calculo text not null
    check (base_calculo in ('percentagem_aquisicao', 'percentagem_hard_costs', 'percentagem_capex', 'percentagem_custo_total', 'valor_fixo', 'eur_m2', 'eur_unidade'))
    default 'valor_fixo',
  valor_input numeric not null default 0,

  momento_pagamento text not null
    check (momento_pagamento in ('aquisicao', 'durante_desenvolvimento', 'proporcional_capex', 'mensal', 'conclusao', 'escritura', 'venda', 'data_personalizada'))
    default 'aquisicao',
  data_personalizada date,

  ordem integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_fees enable row level security;

create policy "Utilizador vê os fees dos próprios projetos"
on project_fees for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os fees dos próprios projetos (insert)"
on project_fees for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os fees dos próprios projetos (update)"
on project_fees for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os fees dos próprios projetos (delete)"
on project_fees for delete
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_fees_set_updated_at
before update on project_fees
for each row execute function set_updated_at();

create index if not exists idx_project_fees_project_id on project_fees(project_id);

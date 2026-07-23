-- ============================================================
-- Landwise — Fase 8 (parte 4): Plano de Vendas (project_sales_assumptions)
--
-- Secção 5 do plano. ADITIVO. Executar depois de 0002-0008.
-- ============================================================

create table if not exists project_sales_assumptions (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null unique,

  data_lancamento_comercial date,
  duracao_vendas_meses integer default 12,
  data_inicio_construcao date,
  data_fim_construcao date,
  data_escritura date,

  pct_reserva numeric not null default 0.1,
  pct_cpcv numeric not null default 0.2,
  pct_durante_construcao numeric not null default 0.4,
  pct_conclusao numeric not null default 0.1,
  pct_escritura numeric not null default 0.2,

  comissao_mediacao_pct numeric not null default 0.03,
  cancelamentos_estimados_pct numeric not null default 0,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_sales_assumptions enable row level security;

create policy "Utilizador vê o plano de vendas dos próprios projetos"
on project_sales_assumptions for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador cria o plano de vendas nos próprios projetos"
on project_sales_assumptions for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador edita o plano de vendas dos próprios projetos"
on project_sales_assumptions for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_sales_assumptions_set_updated_at
before update on project_sales_assumptions
for each row execute function set_updated_at();

create index if not exists idx_project_sales_assumptions_project_id on project_sales_assumptions(project_id);

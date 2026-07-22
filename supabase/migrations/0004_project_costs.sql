-- ============================================================
-- Landwise — Fase 4: Aquisição e Custos
-- Tabela genérica project_costs (não colunas fixas por categoria — secção 18 do plano)
--
-- ADITIVO. Executar depois de 0002/0003.
-- ============================================================

create table if not exists project_costs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,

  grupo text not null
    check (grupo in ('aquisicao', 'hard_cost', 'soft_cost', 'outro')),
  categoria text not null,          -- ex.: 'Due diligence técnica', 'Obra acima do solo', 'Arquitetura'
  nome text not null,
  descricao text,

  tipo_calculo text not null
    check (tipo_calculo in (
      'valor_fixo', 'percentagem_aquisicao', 'percentagem_hard_costs',
      'percentagem_capex', 'percentagem_custo_total', 'eur_m2_abc',
      'eur_m2_gca', 'eur_unidade', 'percentagem_outra_base'
    ))
    default 'valor_fixo',
  valor_input numeric not null default 0,   -- valor fixo em €, OU percentagem como decimal (0-1), OU taxa €/m²/€unidade
  base_referencia_custo_id uuid references project_costs(id) on delete set null, -- só quando tipo_calculo = 'percentagem_outra_base'

  taxa_iva numeric,                          -- ex.: 0.06, 0.23 — null = sem IVA aplicável configurado
  iva_recuperavel_pct numeric default 0 check (iva_recuperavel_pct between 0 and 1),
  data_iva_recuperacao date,

  data_inicial date,
  duracao_meses integer,
  data_final date,                           -- calculada (início + duração) ou substituída manualmente
  perfil_desembolso text
    check (perfil_desembolso in ('unico_inicio', 'unico_fim', 'linear', 'curva_s', 'front_loaded', 'back_loaded', 'personalizado'))
    default 'unico_inicio',

  observacoes text,
  ordem integer default 0,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_costs enable row level security;

create policy "Utilizador vê custos dos próprios projetos"
on project_costs for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador cria custos nos próprios projetos"
on project_costs for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador edita custos dos próprios projetos"
on project_costs for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador apaga custos dos próprios projetos"
on project_costs for delete
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_costs_set_updated_at
before update on project_costs
for each row execute function set_updated_at();

create index if not exists idx_project_costs_project_id on project_costs(project_id);
create index if not exists idx_project_costs_grupo on project_costs(grupo);

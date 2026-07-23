-- ============================================================
-- Landwise — Fase 5: Financiamento
-- Tabela project_financing (parâmetros, um registo por projeto)
--
-- ADITIVO. Executar depois de 0002/0003/0004.
-- ============================================================

create table if not exists project_financing (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null unique,

  com_financiamento boolean not null default false,

  percentagem_hard_costs_financiada numeric not null default 0 check (percentagem_hard_costs_financiada between 0 and 1),
  percentagem_aquisicao_financiada numeric not null default 0 check (percentagem_aquisicao_financiada between 0 and 1),

  euribor numeric not null default 0,
  spread numeric not null default 0,
  metodo_taxa_mensal text
    check (metodo_taxa_mensal in ('nominal_anual_div_12', 'mensal_equivalente'))
    default 'nominal_anual_div_12',

  structuring_fee_pct numeric not null default 0,
  setup_costs numeric not null default 0,
  imposto_selo_emprestimo_pct numeric not null default 0,
  imposto_selo_juros_pct numeric not null default 0,

  limite_credito numeric,               -- null = sem limite explícito
  data_disponibilidade date,
  periodo_carencia_meses integer default 0,
  inicio_amortizacao date,
  fim_amortizacao date,
  metodo_amortizacao text
    check (metodo_amortizacao in ('bullet', 'linear', 'prestacoes_constantes', 'cash_sweep'))
    default 'bullet',
  cash_sweep boolean default false,
  capitalizacao_juros boolean default true,
  saldo_minimo_caixa numeric not null default 0,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_financing enable row level security;

create policy "Utilizador vê o financiamento dos próprios projetos"
on project_financing for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador cria financiamento nos próprios projetos"
on project_financing for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador edita financiamento dos próprios projetos"
on project_financing for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_financing_set_updated_at
before update on project_financing
for each row execute function set_updated_at();

create index if not exists idx_project_financing_project_id on project_financing(project_id);

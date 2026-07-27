-- ============================================================
-- Landwise — Revisão estrutural, Fase 2: Evolução de preços
-- (project_price_rules)
--
-- Secção 17 do plano. Uma linha por regra — âmbito geral ou por
-- tipologia, gatilho, ajuste percentual, cumulativo ou substituição.
--
-- ADITIVO. Executar depois de 0002-0012.
-- ============================================================

create table if not exists project_price_rules (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,

  escopo_tipo text not null default 'geral' check (escopo_tipo in ('geral', 'tipologia')),
  tipologia_id uuid references project_typologies(id) on delete cascade, -- null quando escopo_tipo = 'geral'

  gatilho text not null
    check (gatilho in ('meses_apos_lancamento', 'data', 'pct_vendido_projeto', 'pct_vendido_tipologia'))
    default 'meses_apos_lancamento',
  valor_gatilho_numero numeric,       -- meses ou percentagem (decimal), consoante o gatilho
  valor_gatilho_data date,            -- só quando gatilho = 'data'

  ajuste_pct numeric not null default 0,
  modo text not null default 'cumulativo' check (modo in ('cumulativo', 'substituicao')),
  ordem integer not null default 0,
  observacao text,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_price_rules enable row level security;

create policy "Utilizador vê as regras de preço dos próprios projetos"
on project_price_rules for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere as regras de preço dos próprios projetos (insert)"
on project_price_rules for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere as regras de preço dos próprios projetos (update)"
on project_price_rules for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere as regras de preço dos próprios projetos (delete)"
on project_price_rules for delete
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_price_rules_set_updated_at
before update on project_price_rules
for each row execute function set_updated_at();

create index if not exists idx_project_price_rules_project_id on project_price_rules(project_id);

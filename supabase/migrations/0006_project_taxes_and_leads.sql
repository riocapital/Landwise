-- ============================================================
-- Landwise — Fase 6: Impostos e Seguros + Lead de Consultoria
--
-- ADITIVO. Executar depois de 0002-0005.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Configuração de IRC por ano — atualizável sem alterar código
--    (secção 10 do plano: "criar uma configuração ou tabela de referência
--    que possa ser atualizada sem alterar todo o código").
-- ------------------------------------------------------------
create table if not exists irc_tax_config (
  ano integer primary key,
  taxa numeric not null
);

insert into irc_tax_config (ano, taxa) values
  (2026, 0.19),
  (2027, 0.18),
  (2028, 0.17)
on conflict (ano) do nothing;

alter table irc_tax_config enable row level security;

create policy "Qualquer utilizador autenticado lê a configuração de IRC"
on irc_tax_config for select
to authenticated
using (true);

-- ------------------------------------------------------------
-- 2) Escalões de derrama estadual — configuração avançada, atualizável
-- ------------------------------------------------------------
create table if not exists derrama_estadual_escaloes (
  id uuid default gen_random_uuid() primary key,
  escalao_min numeric not null,
  escalao_max numeric,             -- null = escalão aberto no topo
  taxa numeric not null
);

insert into derrama_estadual_escaloes (escalao_min, escalao_max, taxa) values
  (1500000, 7500000, 0.03),
  (7500000, 35000000, 0.05),
  (35000000, null, 0.09)
on conflict do nothing;

alter table derrama_estadual_escaloes enable row level security;

create policy "Qualquer utilizador autenticado lê os escalões de derrama"
on derrama_estadual_escaloes for select
to authenticated
using (true);

-- ------------------------------------------------------------
-- 3) Impostos e seguros por projeto
-- ------------------------------------------------------------
create table if not exists project_taxes (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null unique,

  -- Seguro
  seguro_taxa numeric default 0.002,
  seguro_base_calculo text check (seguro_base_calculo in ('valor_aquisicao', 'custo_total', 'gdv', 'valor_fixo')) default 'valor_aquisicao',
  seguro_data_inicial date,
  seguro_duracao_anos integer default 1,

  -- IMI (sobre o VPT — nunca sobre aquisição ou GDV)
  imi_vpt numeric,
  imi_taxa numeric default 0.003,
  imi_num_anos integer default 1,
  imi_data_inicial date,

  -- IRC
  irc_ano_fiscal_referencia integer,
  irc_taxa_manual numeric,          -- null = usa a configuração de referência (irc_tax_config)
  irc_lucro_tributavel numeric,
  irc_prejuizos_fiscais_acumulados numeric default 0,
  derrama_municipal_taxa numeric default 0,
  outros_ajustes_fiscais numeric default 0,

  -- IMT e Imposto de Selo da aquisição
  imt_metodo text check (imt_metodo in ('percentagem', 'valor_manual')) default 'percentagem',
  imt_valor numeric default 0.065,
  imposto_selo_aquisicao_taxa numeric default 0.008,
  data_pagamento_imt date,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_taxes enable row level security;

create policy "Utilizador vê os impostos dos próprios projetos"
on project_taxes for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador cria impostos nos próprios projetos"
on project_taxes for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador edita impostos dos próprios projetos"
on project_taxes for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_taxes_set_updated_at
before update on project_taxes
for each row execute function set_updated_at();

create index if not exists idx_project_taxes_project_id on project_taxes(project_id);

-- ------------------------------------------------------------
-- 4) Leads de consultoria fiscal (secção 10 do plano)
--    Nunca menciona SIC/SICAFI/fundos — só o formulário genérico de contacto.
-- ------------------------------------------------------------
create table if not exists consulting_leads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete set null,
  project_id uuid references projects(id) on delete set null,

  lead_type text not null default 'tax_optimization',
  name text not null,
  company text,
  email text not null,
  phone text,
  message text,
  project_summary jsonb,           -- localização, valor de aquisição, GDV, custo total, imposto estimado (pré-preenchido)
  status text not null default 'novo' check (status in ('novo', 'contactado', 'concluido', 'descartado')),

  created_at timestamp with time zone default now()
);

alter table consulting_leads enable row level security;

create policy "Utilizador vê os próprios leads de consultoria"
on consulting_leads for select
to authenticated
using (auth.uid() = user_id);

create policy "Utilizador cria os próprios leads de consultoria"
on consulting_leads for insert
to authenticated
with check (auth.uid() = user_id);

create index if not exists idx_consulting_leads_user_id on consulting_leads(user_id);

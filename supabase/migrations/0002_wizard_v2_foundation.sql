-- ============================================================
-- Landwise — Fase 1 da evolução estrutural do wizard
-- Fundação: Identificação (localização, áreas, características) + Programa (tipologias)
--
-- ADITIVO — não apaga nem recria "projects". Todas as colunas novas são
-- nullable ou têm default, para não quebrar projetos já existentes.
-- Executar no SQL Editor do Supabase, ou via `supabase db push` se o CLI
-- estiver ligado ao projeto.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Localização estruturada (substitui o campo "localizacao" de texto livre)
-- ------------------------------------------------------------
alter table projects
  add column if not exists codigo_postal text,
  add column if not exists rua text,
  add column if not exists numero_porta text,
  add column if not exists complemento text,
  add column if not exists localidade text,
  add column if not exists freguesia text,
  add column if not exists concelho text,
  add column if not exists distrito text,
  add column if not exists pais text default 'Portugal',
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists localizacao_origem text
    check (localizacao_origem in ('manual', 'codigo_postal', 'geocodificacao'))
    default 'manual';

comment on column projects.localizacao_origem is
  'Origem do preenchimento da localização — usado para o badge de rastreabilidade (secção 16 do plano).';

-- ------------------------------------------------------------
-- 2) Dados gerais de identificação
-- ------------------------------------------------------------
alter table projects
  add column if not exists tipo_ativo text
    check (tipo_ativo in ('Residencial','Hotel','Retail','Escritórios','Logística','Uso misto','Outro'))
    default 'Residencial',
  add column if not exists estado_projeto text
    check (estado_projeto in ('Em estudo','PIP','Licenciamento','Projeto aprovado','Em construção','Concluído','Outro'))
    default 'Em estudo',
  add column if not exists descricao_resumida text,
  add column if not exists data_referencia_analise date default current_date;

-- tipo_projeto já existe na tabela original como texto livre; passamos a
-- restringir os novos valores por check constraint só em código (frontend),
-- não à posteriori na coluna, para não invalidar registos antigos com outro texto.

-- ------------------------------------------------------------
-- 3) Áreas do projeto
-- ------------------------------------------------------------
alter table projects
  add column if not exists area_lote numeric,
  add column if not exists abc_acima_solo numeric,
  add column if not exists abc_abaixo_solo numeric,
  add column if not exists area_dependente_estimada numeric,
  add column if not exists abp_estimada numeric,
  add column if not exists area_implantacao numeric,
  add column if not exists area_jardins_exteriores numeric,
  add column if not exists area_demolicao numeric,
  add column if not exists pisos_acima_solo integer,
  add column if not exists pisos_abaixo_solo integer;

comment on column projects.abp_estimada is
  'ABP estimada manualmente na Identificação. Pode divergir da ABP calculada a partir das tipologias — ver project_typologies. A UI mostra ambas e o alerta de divergência (secção 1 do plano).';

-- ------------------------------------------------------------
-- 4) Características
-- ------------------------------------------------------------
alter table projects
  add column if not exists tem_garagem boolean,
  add column if not exists num_estacionamentos integer,
  add column if not exists tem_elevador boolean,
  add column if not exists num_elevadores integer,
  add column if not exists tem_jardim_exterior boolean,
  add column if not exists necessita_demolicao boolean,
  add column if not exists imovel_ocupado boolean,
  add column if not exists necessita_realojamento boolean,
  add column if not exists tem_licenciamento_aprovado boolean;

-- ------------------------------------------------------------
-- 5) Tipologias (repetível → tabela relacional própria, NÃO colunas fixas)
-- ------------------------------------------------------------
create table if not exists project_typologies (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,

  nome text not null,
  quantidade integer not null default 0 check (quantidade >= 0),

  abp_unidade numeric not null default 0 check (abp_unidade >= 0),

  varanda_m2 numeric default 0 check (varanda_m2 >= 0),
  varanda_pct_valorizacao numeric default 0 check (varanda_pct_valorizacao between 0 and 1),

  terraco_m2 numeric default 0 check (terraco_m2 >= 0),
  terraco_pct_valorizacao numeric default 0 check (terraco_pct_valorizacao between 0 and 1),

  jardim_privativo_m2 numeric default 0 check (jardim_privativo_m2 >= 0),
  jardim_pct_valorizacao numeric default 0 check (jardim_pct_valorizacao between 0 and 1),

  arrecadacao_m2 numeric default 0 check (arrecadacao_m2 >= 0),
  arrecadacao_pct_valorizacao numeric default 0 check (arrecadacao_pct_valorizacao between 0 and 1),

  estacionamentos_incluidos numeric default 0 check (estacionamentos_incluidos >= 0),
  valor_estacionamento numeric default 0 check (valor_estacionamento >= 0),

  preco_base_m2 numeric default 0 check (preco_base_m2 >= 0),
  preco_sugerido_m2 numeric,          -- preenchido pelo motor de comparáveis (fase 4)
  metodo_precificacao text
    check (metodo_precificacao in ('abp_mais_coeficientes','area_vendavel_equivalente','manual_por_unidade'))
    default 'abp_mais_coeficientes',
  preco_manual_unidade numeric,       -- usado quando metodo_precificacao = 'manual_por_unidade'

  ordem integer default 0,            -- para preservar a ordem de exibição na tabela dinâmica

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_typologies enable row level security;

create policy "Utilizador vê tipologias dos próprios projetos"
on project_typologies for select
to authenticated
using (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

create policy "Utilizador cria tipologias nos próprios projetos"
on project_typologies for insert
to authenticated
with check (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

create policy "Utilizador edita tipologias dos próprios projetos"
on project_typologies for update
to authenticated
using (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

create policy "Utilizador apaga tipologias dos próprios projetos"
on project_typologies for delete
to authenticated
using (
  exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid())
);

create trigger project_typologies_set_updated_at
before update on project_typologies
for each row execute function set_updated_at();

create index if not exists idx_project_typologies_project_id on project_typologies(project_id);

-- ------------------------------------------------------------
-- 6) Histórico de premissas (secção 16 do plano — rastreabilidade)
--    Genérico o suficiente para qualquer campo de qualquer etapa futura.
-- ------------------------------------------------------------
create table if not exists project_assumption_history (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,

  campo text not null,               -- ex.: 'abp_estimada', 'typology:uuid:preco_base_m2'
  valor_anterior jsonb,
  valor_novo jsonb,
  origem text not null
    check (origem in ('utilizador','sugestao_landwise','assumido_automaticamente','calculado','importado','substituido_manualmente')),

  created_at timestamp with time zone default now()
);

alter table project_assumption_history enable row level security;

create policy "Utilizador vê o histórico dos próprios projetos"
on project_assumption_history for select
to authenticated
using (auth.uid() = user_id);

create policy "Utilizador regista histórico nos próprios projetos"
on project_assumption_history for insert
to authenticated
with check (auth.uid() = user_id);

create index if not exists idx_assumption_history_project_id on project_assumption_history(project_id);

-- ------------------------------------------------------------
-- 7) Nada de destrutivo: "inputs" e "results" (jsonb) mantêm-se por agora
--    como cache de compatibilidade para o dashboard atual, mas deixam de
--    ser a fonte da verdade para localização, áreas e tipologias — que
--    passam a viver nas colunas/tabelas acima. A migração de leitura do
--    dashboard/wizard para as novas colunas é feita em código (fase 1,
--    ficheiros já entregues), não aqui.
-- ------------------------------------------------------------

-- ============================================================
-- Landwise — esquema da plataforma (executar no SQL Editor do Supabase)
-- ============================================================

-- 1) Perfis (dados do utilizador, além do que o Supabase Auth já guarda)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  nome text,
  empresa text,
  papel text check (papel in ('mediador', 'promotor', 'outro')),
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;

create policy "Utilizador vê o próprio perfil"
on profiles for select
to authenticated
using (auth.uid() = id);

create policy "Utilizador edita o próprio perfil"
on profiles for update
to authenticated
using (auth.uid() = id);

create policy "Utilizador cria o próprio perfil"
on profiles for insert
to authenticated
with check (auth.uid() = id);

-- 2) Projetos (um por ativo em análise)
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  nome text not null default 'Novo projeto',
  tipo_projeto text default 'Terreno para construir',
  localizacao text,
  status text default 'rascunho' check (status in ('rascunho', 'calculado')),
  is_demo boolean default false,
  inputs jsonb default '{}'::jsonb,
  results jsonb default '{}'::jsonb,
  tir numeric,
  roi numeric,
  margem numeric,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table projects enable row level security;

create policy "Utilizador vê os próprios projetos"
on projects for select
to authenticated
using (auth.uid() = user_id);

create policy "Utilizador cria projetos"
on projects for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Utilizador edita os próprios projetos"
on projects for update
to authenticated
using (auth.uid() = user_id);

create policy "Utilizador apaga os próprios projetos"
on projects for delete
to authenticated
using (auth.uid() = user_id);

-- 3) Atualiza updated_at automaticamente a cada gravação
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_set_updated_at
before update on projects
for each row execute function set_updated_at();

-- 4) Cria o perfil automaticamente quando alguém regista conta
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, empresa, papel)
  values (
    new.id,
    new.raw_user_meta_data->>'nome',
    new.raw_user_meta_data->>'empresa',
    new.raw_user_meta_data->>'papel'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

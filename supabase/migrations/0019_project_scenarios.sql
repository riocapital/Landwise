-- ============================================================
-- Landwise — Revisão estrutural, Fase 4: Cenários na UI
--
-- Secção 39 do plano. O motor (cenarios.ts) já existe e está testado —
-- esta migration só persiste os cenários criados/editados pelo
-- utilizador. O cenário-base nunca é apagado (garantido pela aplicação,
-- `eh_base = true` nunca é removido).
--
-- ADITIVO. Executar depois de 0002-0018.
-- ============================================================

create table if not exists project_scenarios (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,

  nome text not null,
  eh_base boolean not null default false,
  delta_aquisicao numeric not null default 0,
  delta_construcao numeric not null default 0,
  delta_preco numeric not null default 0,
  autor text,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_scenarios enable row level security;

create policy "Utilizador vê os cenários dos próprios projetos"
on project_scenarios for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os cenários dos próprios projetos (insert)"
on project_scenarios for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os cenários dos próprios projetos (update)"
on project_scenarios for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere os cenários dos próprios projetos (delete)"
on project_scenarios for delete
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_scenarios_set_updated_at
before update on project_scenarios
for each row execute function set_updated_at();

create index if not exists idx_project_scenarios_project_id on project_scenarios(project_id);

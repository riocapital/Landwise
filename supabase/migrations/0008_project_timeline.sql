-- ============================================================
-- Landwise — Fase 7 (parte 4): Calendário (project_timeline)
--
-- ADITIVO. Executar depois de 0002-0007.
-- ============================================================

create table if not exists project_timeline (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,

  nome text not null,
  data_inicial date,
  duracao_meses integer,
  data_final date,                      -- calculada (início + duração) ou substituída manualmente
  perfil_desembolso text
    check (perfil_desembolso in ('unico_inicio', 'unico_fim', 'linear', 'curva_s', 'front_loaded', 'back_loaded', 'personalizado'))
    default 'unico_inicio',
  dependencia_id uuid references project_timeline(id) on delete set null,  -- início = fim da dependência + 1 dia

  observacoes text,
  ordem integer default 0,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table project_timeline enable row level security;

create policy "Utilizador vê o calendário dos próprios projetos"
on project_timeline for select
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere o calendário dos próprios projetos (insert)"
on project_timeline for insert
to authenticated
with check (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere o calendário dos próprios projetos (update)"
on project_timeline for update
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Utilizador gere o calendário dos próprios projetos (delete)"
on project_timeline for delete
to authenticated
using (exists (select 1 from projects p where p.id = project_id and p.user_id = auth.uid()));

create trigger project_timeline_set_updated_at
before update on project_timeline
for each row execute function set_updated_at();

create index if not exists idx_project_timeline_project_id on project_timeline(project_id);

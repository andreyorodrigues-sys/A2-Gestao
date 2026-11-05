-- A2 Gestão: armazenamento privado de uma única conta proprietária.
-- Execute no SQL Editor do projeto Supabase depois de criar o projeto.
-- Esta migration NÃO importa nem apaga dados do navegador.

create table if not exists public.a2_workspace (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint a2_workspace_payload_is_object
    check (jsonb_typeof(payload) = 'object')
);

alter table public.a2_workspace enable row level security;

revoke all on table public.a2_workspace from anon;
grant select, insert, update, delete on table public.a2_workspace to authenticated;

drop policy if exists "owner reads own A2 workspace" on public.a2_workspace;
create policy "owner reads own A2 workspace"
  on public.a2_workspace for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "owner creates own A2 workspace" on public.a2_workspace;
create policy "owner creates own A2 workspace"
  on public.a2_workspace for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "owner updates own A2 workspace" on public.a2_workspace;
create policy "owner updates own A2 workspace"
  on public.a2_workspace for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "owner deletes own A2 workspace" on public.a2_workspace;
create policy "owner deletes own A2 workspace"
  on public.a2_workspace for delete
  to authenticated
  using (auth.uid() = owner_id);

create or replace function public.a2_touch_workspace_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists a2_workspace_updated_at on public.a2_workspace;
create trigger a2_workspace_updated_at
  before update on public.a2_workspace
  for each row execute function public.a2_touch_workspace_updated_at();

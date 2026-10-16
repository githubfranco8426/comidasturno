-- Snapshot of the MacroTurno schema configured in Entrenamiento.
-- Run only when setting up MacroTurno on a new project.
create table public.macroturno_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.macroturno_states enable row level security;
revoke all on public.macroturno_states from anon;
grant select, insert, update on public.macroturno_states to authenticated;
create policy macroturno_read on public.macroturno_states for select to authenticated
  using ((select auth.uid()) = user_id);
create policy macroturno_insert on public.macroturno_states for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy macroturno_update on public.macroturno_states for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

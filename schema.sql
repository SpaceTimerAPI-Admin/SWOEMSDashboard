
-- ============================================================
-- NEW: Shift Log
-- ============================================================
create table if not exists public.shift_log_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists shift_log_employee_idx on public.shift_log_entries(employee_id);
create index if not exists shift_log_created_at_idx on public.shift_log_entries(created_at);
alter table public.shift_log_entries enable row level security;

-- ============================================================
-- NEW: Assignment columns on tickets + projects
-- ============================================================
alter table public.tickets  add column if not exists assigned_to uuid null references public.employees(id);
alter table public.projects add column if not exists assigned_to uuid null references public.employees(id);

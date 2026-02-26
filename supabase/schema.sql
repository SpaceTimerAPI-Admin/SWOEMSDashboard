-- Maintenance Dashboard (Netlify + Supabase) - Schema v1
-- Safe default: RLS enabled everywhere; no public policies (only service-role functions can read/write).

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Helper function: current timestamp
-- (Supabase already supports now(), but kept for clarity)

-- Employees (enrolled users)
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,        -- barcode/scanned value
  name text not null,
  email text not null,
  pin_hash text not null,                  -- bcrypt/argon2 hash
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_employee_id_idx on public.employees(employee_id);

-- Sessions (custom auth)
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  session_token_hash text not null unique,   -- store a hash of the bearer token
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sessions_employee_id_idx on public.sessions(employee_id);
create index if not exists sessions_expires_at_idx on public.sessions(expires_at);

-- Login attempts (rate limiting / lockouts)
create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  employee_id_text text not null,
  success boolean not null,
  ip text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_employee_id_text_idx on public.login_attempts(employee_id_text);
create index if not exists login_attempts_created_at_idx on public.login_attempts(created_at);

-- Tickets
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,
  details text not null,
  status text not null default 'open', -- open | in_progress | closed
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  closed_by uuid null references public.employees(id),
  closed_at timestamptz null,
  sla_minutes int not null default 60,
  sla_due_at timestamptz not null
);

create index if not exists tickets_status_idx on public.tickets(status);
create index if not exists tickets_sla_due_at_idx on public.tickets(sla_due_at);
create index if not exists tickets_created_at_idx on public.tickets(created_at);

-- Ticket comments
create table if not exists public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  comment text not null,
  status_change text null,
  created_at timestamptz not null default now()
);

create index if not exists ticket_comments_ticket_id_idx on public.ticket_comments(ticket_id);
create index if not exists ticket_comments_created_at_idx on public.ticket_comments(created_at);

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,
  details text not null,
  status text not null default 'open', -- open | in_progress | closed
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  closed_by uuid null references public.employees(id),
  closed_at timestamptz null,
  sla_days int not null default 14,
  sla_due_at timestamptz not null,
  source_ticket_id uuid null references public.tickets(id)
);

create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_sla_due_at_idx on public.projects(sla_due_at);
create index if not exists projects_created_at_idx on public.projects(created_at);

-- Project comments
create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  comment text not null,
  status_change text null,
  created_at timestamptz not null default now()
);

create index if not exists project_comments_project_id_idx on public.project_comments(project_id);
create index if not exists project_comments_created_at_idx on public.project_comments(created_at);

-- Procedures (Open A / Open B / Close)
create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- open_a | open_b | close
  name text not null
);

-- Procedure steps (editable)
create table if not exists public.procedure_steps (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  step_order int not null,
  title text not null,
  details text null,
  is_active boolean not null default true
);

create unique index if not exists procedure_steps_unique_order on public.procedure_steps(procedure_id, step_order);

-- Procedure runs (each checklist execution)
create table if not exists public.procedure_runs (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures(id),
  performed_by uuid not null references public.employees(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  duration_seconds int null
);

create index if not exists procedure_runs_started_at_idx on public.procedure_runs(started_at);

-- Per-step acknowledgements
create table if not exists public.procedure_run_steps (
  id uuid primary key default gen_random_uuid(),
  procedure_run_id uuid not null references public.procedure_runs(id) on delete cascade,
  procedure_step_id uuid not null references public.procedure_steps(id),
  acknowledged_at timestamptz null,
  note text null
);

create index if not exists procedure_run_steps_run_idx on public.procedure_run_steps(procedure_run_id);

-- EOD reports (team-wide, can run multiple times/day)
create table if not exists public.end_of_day_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  notes text not null default '',
  handoff_notes text not null default '',
  snapshot_json jsonb not null,
  emailed_to text not null,
  email_status text not null default 'pending', -- pending|sent|failed
  email_error text null
);

create index if not exists eod_report_date_idx on public.end_of_day_reports(report_date);
create index if not exists eod_created_at_idx on public.end_of_day_reports(created_at);

-- GroupMe message logging (via callback)
create table if not exists public.groupme_messages (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  message_id text not null unique,
  sender_user_id text null,
  sender_name text null,
  text text null,
  created_at timestamptz not null,
  attachments_json jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null
);

create index if not exists groupme_messages_group_id_idx on public.groupme_messages(group_id);
create index if not exists groupme_messages_created_at_idx on public.groupme_messages(created_at);

-- Triggers for updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

-- RLS
alter table public.employees enable row level security;
alter table public.sessions enable row level security;
alter table public.login_attempts enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_comments enable row level security;
alter table public.projects enable row level security;
alter table public.project_comments enable row level security;
alter table public.procedures enable row level security;
alter table public.procedure_steps enable row level security;
alter table public.procedure_runs enable row level security;
alter table public.procedure_run_steps enable row level security;
alter table public.end_of_day_reports enable row level security;
alter table public.groupme_messages enable row level security;

-- No policies are created on purpose (deny-by-default).
-- Netlify Functions will use the Supabase SERVICE_ROLE key (bypasses RLS).

-- Seed procedures
insert into public.procedures (key, name)
values
  ('open_a', 'Open Park - A Side'),
  ('open_b', 'Open Park - B Side'),
  ('close',  'Close Park')
on conflict (key) do nothing;

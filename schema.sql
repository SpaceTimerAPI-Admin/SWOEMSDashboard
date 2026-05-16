
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

-- ============================================================
-- NEW: Weekly Schedule
-- ============================================================
create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,           -- the specific date this entry is for
  employee_name text not null,       -- "First L." format
  shift_start text null,             -- "6:00 AM"
  shift_end text null,               -- "2:30 PM"
  uploaded_by uuid not null references public.employees(id),
  uploaded_at timestamptz not null default now(),
  -- Upsert key: one entry per name per date
  unique (work_date, employee_name)
);
create index if not exists schedule_entries_date_idx on public.schedule_entries(work_date);
alter table public.schedule_entries enable row level security;

-- Migration: add all_shifts column for second shift support
alter table public.schedule_entries add column if not exists all_shifts text null;

-- ============================================================
-- NEW: BEO Events
-- ============================================================
create table if not exists public.beo_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  event_date date not null,
  pdf_path text not null,         -- Supabase storage path
  pdf_url text not null,          -- Public URL
  uploaded_by uuid not null references public.employees(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists beo_events_date_idx on public.beo_events(event_date);
alter table public.beo_events enable row level security;

-- BEO setup/strike actions log
create table if not exists public.beo_actions (
  id uuid primary key default gen_random_uuid(),
  beo_id uuid not null references public.beo_events(id) on delete cascade,
  action_type text not null check (action_type in ('setup','strike')),
  completed_by uuid not null references public.employees(id),
  completed_at timestamptz not null default now(),
  unique (beo_id, action_type)    -- one setup, one strike per event
);
alter table public.beo_actions enable row level security;

-- BEO photos
create table if not exists public.beo_photos (
  id uuid primary key default gen_random_uuid(),
  beo_id uuid not null references public.beo_events(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  uploaded_by uuid not null references public.employees(id),
  uploaded_at timestamptz not null default now()
);
alter table public.beo_photos enable row level security;

-- Supabase storage bucket for BEO PDFs (run separately in Supabase dashboard)
-- insert into storage.buckets (id, name, public) values ('beo-pdfs', 'beo-pdfs', true) on conflict do nothing;
-- insert into storage.buckets (id, name, public) values ('beo-photos', 'beo-photos', true) on conflict do nothing;

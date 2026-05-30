
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

-- Migration: allow pdf_path and pdf_url to be nullable (cleared after 2-day auto-delete)
alter table public.beo_events alter column pdf_path drop not null;
alter table public.beo_events alter column pdf_url drop not null;

-- ============================================================
-- NEW: BEO Activity Log
-- ============================================================
create table if not exists public.beo_log (
  id uuid primary key default gen_random_uuid(),
  beo_id uuid not null references public.beo_events(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  action text not null, -- 'uploaded','revised','setup','strike','deleted','photo_added'
  note text null,       -- deletion reason, revision note, etc.
  created_at timestamptz not null default now()
);
create index if not exists beo_log_beo_id_idx on public.beo_log(beo_id);
create index if not exists beo_log_created_at_idx on public.beo_log(created_at);
alter table public.beo_log enable row level security;

-- Allow soft-deleted events to keep log entries (add deleted_at column)
alter table public.beo_events add column if not exists deleted_at timestamptz null;
alter table public.beo_events add column if not exists deleted_reason text null;

-- ============================================================
-- NEW: Roles & permissions
-- ============================================================
alter table public.employees add column if not exists role text not null default 'ems'
  check (role in ('admin','ems','show_tech'));
alter table public.employees add column if not exists last_login_at timestamptz null;

-- Update login function to record last_login_at (done in login.ts)
-- Migrate existing users: all current employees default to 'ems' role

-- Migration: assigned_to_show_tech flag for group assignment
alter table public.tickets add column if not exists assigned_to_show_tech boolean not null default false;
alter table public.projects add column if not exists assigned_to_show_tech boolean not null default false;

-- ============================================================
-- NEW: Procedures
-- ============================================================
create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('A Side', 'B Side')),
  visibility text not null default 'ems' check (visibility in ('admin', 'ems', 'everyone')),
  created_by uuid not null references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  step_count int not null default 0
);
alter table public.procedures enable row level security;

create table if not exists public.procedure_steps (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  step_number int not null,
  title text not null,
  notes text null,
  photo_url text null,
  photo_path text null,
  created_at timestamptz not null default now(),
  unique (procedure_id, step_number)
);
alter table public.procedure_steps enable row level security;

-- Storage bucket: procedure-photos (create in Supabase dashboard, set to public)

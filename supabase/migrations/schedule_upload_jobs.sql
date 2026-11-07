create table if not exists public.schedule_upload_jobs (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending', -- pending | done | error
  result      jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

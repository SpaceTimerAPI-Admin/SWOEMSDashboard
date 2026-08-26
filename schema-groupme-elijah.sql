-- Add source column to elijah_conversations to track GroupMe vs web UI questions
alter table public.elijah_conversations
  add column if not exists source text not null default 'web';

-- Also relax the employee_id constraint so GroupMe users (no account) can be logged
alter table public.elijah_conversations
  alter column employee_id drop not null;


-- Ensure any employees without a role default to 'ems'
update public.employees set role = 'ems' where role is null;

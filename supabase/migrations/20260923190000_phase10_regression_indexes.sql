-- Phase 10: non-regression indexes for the remaining foreign keys.
create index if not exists idx_hr_employees_user_id
  on public.hr_employees (user_id)
  where user_id is not null;

create index if not exists idx_notifications_created_by
  on public.notifications (created_by)
  where created_by is not null;

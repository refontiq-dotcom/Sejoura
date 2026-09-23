-- Phase 10: non-regression indexes for the remaining foreign keys.
create index if not exists idx_hr_employees_user_id
  on public.hr_employees (user_id);

create index if not exists idx_notifications_created_by
  on public.notifications (created_by);

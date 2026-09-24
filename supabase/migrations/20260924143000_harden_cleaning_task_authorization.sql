CREATE OR REPLACE FUNCTION public.claim_cleaning_task(p_task_id uuid, p_user_id uuid)
RETURNS public.cleaning_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_task public.cleaning_tasks;
  v_user_tenant uuid;
BEGIN
  PERFORM public.assert_current_user(p_user_id);
  IF public.get_current_user_role() <> 'menagere' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seules les ménagères peuvent prendre une tâche';
  END IF;
  v_user_tenant := public.get_current_user_tenant_id();
  SELECT * INTO v_task FROM public.cleaning_tasks
  WHERE id = p_task_id AND tenant_id = v_user_tenant AND status = 'pending'
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.cleaning_tasks
  SET status='claimed', claimed_by=p_user_id, claimed_at=NOW()
  WHERE id=p_task_id AND tenant_id=v_user_tenant AND status='pending'
  RETURNING * INTO v_task;
  RETURN v_task;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_cleaning_task(p_task_id uuid, p_user_id uuid)
RETURNS public.cleaning_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_task public.cleaning_tasks;
  v_user_tenant uuid;
BEGIN
  PERFORM public.assert_current_user(p_user_id);
  IF public.get_current_user_role() <> 'menagere' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seules les ménagères peuvent terminer une tâche';
  END IF;
  v_user_tenant := public.get_current_user_tenant_id();
  SELECT * INTO v_task FROM public.cleaning_tasks
  WHERE id=p_task_id AND tenant_id=v_user_tenant AND claimed_by=p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.cleaning_tasks
  SET status='done', completed_by=p_user_id, completed_at=NOW()
  WHERE id=p_task_id
  RETURNING * INTO v_task;
  UPDATE public.rooms SET status='available' WHERE id=v_task.room_id;
  RETURN v_task;
END;
$function$;
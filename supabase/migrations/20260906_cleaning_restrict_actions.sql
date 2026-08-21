-- ============================================================================
-- Migration : restriction des actions ménage aux ménagères uniquement
-- ============================================================================
-- Contexte : admin_residence et receptionniste ne doivent pas pouvoir
-- effectuer des tâches de ménage (claim / complete / reopen).
-- Seul le rôle menagere est autorisé.

-- 1. Supprimer la politique UPDATE qui autorise admin + réceptionniste
DROP POLICY IF EXISTS "cleaning_tasks_update_staff" ON cleaning_tasks;

-- 2. Supprimer la politique INSERT qui autorise admin + réceptionniste
--    Les créations légitimes passent par le RPC request_mid_stay_cleaning
--    ou les triggers DB (checkout, modification de réservation).
DROP POLICY IF EXISTS "cleaning_tasks_insert_own" ON cleaning_tasks;

-- 3. RPC claim_cleaning_task : vérifier que l'appelant est une ménagère
CREATE OR REPLACE FUNCTION claim_cleaning_task(
  p_task_id UUID,
  p_user_id UUID
)
RETURNS cleaning_tasks AS $$
DECLARE
  v_task cleaning_tasks;
BEGIN
  IF get_current_user_role() != 'menagere' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seules les ménagères peuvent prendre une tâche';
  END IF;

  SELECT * INTO v_task
  FROM cleaning_tasks
  WHERE id = p_task_id AND status = 'pending'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE cleaning_tasks
  SET
    status = 'claimed',
    claimed_by = p_user_id,
    claimed_at = NOW()
  WHERE id = p_task_id AND status = 'pending'
  RETURNING * INTO v_task;

  RETURN v_task;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC complete_cleaning_task : vérifier que l'appelant est une ménagère
CREATE OR REPLACE FUNCTION complete_cleaning_task(
  p_task_id UUID,
  p_user_id UUID
)
RETURNS cleaning_tasks AS $$
DECLARE
  v_task cleaning_tasks;
  v_room_id UUID;
  v_accommodation_id UUID;
BEGIN
  IF get_current_user_role() != 'menagere' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seules les ménagères peuvent terminer une tâche';
  END IF;

  SELECT * INTO v_task
  FROM cleaning_tasks
  WHERE id = p_task_id AND claimed_by = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE cleaning_tasks
  SET
    status = 'done',
    completed_by = p_user_id,
    completed_at = NOW()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  UPDATE rooms SET status = 'available'
  WHERE id = v_task.room_id;

  RETURN v_task;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC reopen_cleaning_task : vérifier que l'appelant est une ménagère
CREATE OR REPLACE FUNCTION reopen_cleaning_task(
  p_task_id UUID
)
RETURNS cleaning_tasks AS $$
DECLARE
  v_task cleaning_tasks;
BEGIN
  IF get_current_user_role() != 'menagere' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seules les ménagères peuvent relancer une tâche';
  END IF;

  SELECT * INTO v_task
  FROM cleaning_tasks
  WHERE id = p_task_id AND status = 'expired'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE cleaning_tasks
  SET
    status = 'pending',
    claimed_by = NULL,
    claimed_at = NULL,
    completed_by = NULL,
    completed_at = NULL,
    is_alert_sent = FALSE,
    is_force_released = FALSE,
    alert_time = NOW() + INTERVAL '1 hour 30 minutes',
    force_release_time = NOW() + INTERVAL '2 hours'
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  UPDATE rooms SET status = 'cleaning' WHERE id = v_task.room_id;

  RETURN v_task;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

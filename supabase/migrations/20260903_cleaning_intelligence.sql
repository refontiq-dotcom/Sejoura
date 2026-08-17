-- 20260903_cleaning_intelligence.sql
-- Intelligence du module ménage :
--  1. check_cleaning_alerts() prend aussi en compte les tâches 'in_progress'
--     (auparavant seules 'pending'/'claimed' passaient en alerte alors que
--     l'UI les considère comme en retard).
--  2. RPC reopen_cleaning_task() : réaffecter une tâche expirée dans le pool
--     (fin du « cul-de-sac » des tâches expirées).

-- ----------------------------------------------------------------------------
-- 1. ALERTES : inclure les tâches en cours (in_progress)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_cleaning_alerts()
RETURNS void AS $$
BEGIN
  -- Marquer les tâches en alerte si le délai de 1h30 est dépassé
  UPDATE cleaning_tasks
  SET is_alert_sent = TRUE
  WHERE status IN ('pending', 'claimed', 'in_progress')
    AND alert_time IS NOT NULL
    AND alert_time < NOW()
    AND is_alert_sent = FALSE;

  -- Mettre les chambres en statut 'alerte'
  UPDATE rooms
  SET status = 'alert'
  WHERE id IN (
    SELECT room_id FROM cleaning_tasks
    WHERE status IN ('pending', 'claimed', 'in_progress')
      AND alert_time < NOW()
      AND is_alert_sent = TRUE
  );

  -- Libération forcée à +2h (marquer la tâche comme expirée)
  UPDATE cleaning_tasks
  SET
    status = 'expired',
    is_force_released = TRUE
  WHERE status IN ('pending', 'claimed', 'in_progress')
    AND force_release_time IS NOT NULL
    AND force_release_time < NOW()
    AND is_force_released = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. RPC : RELANCER une tâche expirée
--    Repasse la tâche en 'pending', remet la chambre en 'cleaning' et recale
--    les délais d'alerte à partir de maintenant.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS reopen_cleaning_task(UUID) CASCADE;

CREATE OR REPLACE FUNCTION reopen_cleaning_task(
  p_task_id UUID
)
RETURNS cleaning_tasks AS $$
DECLARE
  v_task cleaning_tasks;
BEGIN
  -- Verrouiller la ligne (doit être expirée)
  SELECT * INTO v_task
  FROM cleaning_tasks
  WHERE id = p_task_id AND status = 'expired'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Relancer : retour dans le pool, délais recalculés, prise libérée
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

  -- Remettre la chambre en cours de nettoyage
  UPDATE rooms SET status = 'cleaning' WHERE id = v_task.room_id;

  RETURN v_task;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

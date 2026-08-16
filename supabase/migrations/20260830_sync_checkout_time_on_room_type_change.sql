-- 20260830_sync_checkout_time_on_room_type_change.sql
-- Synchronisation intelligente de l'heure de sortie (check_out_time).
--
-- Problème : l'heure de départ d'un type de chambre est copiée comme
-- instantané dans bookings.check_out_time au moment de la création de la
-- réservation. Lorsque le gérant modifie l'heure de sortie du type, les
-- clients DÉJÀ réservés ou DÉJÀ installés en chambre conservent l'ancienne
-- heure — aucun changement automatique.
--
-- Solution : une fonction de synchronisation, appelée à la fois :
--   • automatiquement par un trigger sur room_types (toute modification de
--     check_out_time, par n'importe quel canal), et
--   • explicitement en RPC depuis l'application (sync_room_type_checkout_time)
--     pour afficher le nombre de réservations impactées.
--
-- La fonction :
--   1. Met à jour bookings.check_out_time de toutes les réservations actives
--      (confirmées ou arrivées) des chambres de ce type.
--   2. Réinitialise le statut de dépassement (is_overstay /
--      overstay_detected_at) si la nouvelle heure de départ est encore dans
--      le futur : une alerte devenue obsolète est annulée automatiquement.
--   3. Renseigne checkout_time des tâches de ménage en cours de séjour
--      (dont l'heure de départ n'était pas encore connue) afin que les
--      ménagères voient l'échéance réelle du départ.
--   4. Trace l'opération dans audit_logs.
--
-- Idempotente, à appliquer via : DATABASE_URL="..." npm run db:push

-- ----------------------------------------------------------------------------
-- 1. FONCTION CŒUR : sync_room_type_checkout_time(p_room_type_id)
--    Retourne le nombre de lignes mises à jour (réservations + tâches ménage).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_room_type_checkout_time(p_room_type_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_new_time TIME;
  v_bookings INTEGER := 0;
  v_cleanings INTEGER := 0;
  v_tenant_id UUID;
BEGIN
  SELECT check_out_time INTO v_new_time
  FROM room_types
  WHERE id = p_room_type_id;

  IF v_new_time IS NULL THEN
    RETURN 0;
  END IF;

  -- 1. Réservations actives : appliquer la nouvelle heure de sortie et
  --    annuler un éventuel dépassement si le départ est encore à venir.
  UPDATE bookings b
  SET check_out_time = v_new_time,
      is_overstay = CASE
        WHEN (b.check_out_date + v_new_time) AT TIME ZONE current_setting('TIMEZONE') > NOW() THEN FALSE
        ELSE b.is_overstay
      END,
      overstay_detected_at = CASE
        WHEN (b.check_out_date + v_new_time) AT TIME ZONE current_setting('TIMEZONE') > NOW() THEN NULL
        ELSE b.overstay_detected_at
      END
  FROM rooms r
  WHERE r.id = b.room_id
    AND r.room_type_id = p_room_type_id
    AND b.status IN ('confirmed', 'checked_in');

  GET DIAGNOSTICS v_bookings = ROW_COUNT;

  -- 2. Tâches de ménage en cours de séjour (sans heure de départ connue) :
  --    renseigner l'échéance du départ pour aider les ménagères.
  UPDATE cleaning_tasks ct
  SET checkout_time = (b.check_out_date + v_new_time) AT TIME ZONE current_setting('TIMEZONE')
  FROM bookings b, rooms r
  WHERE ct.booking_id = b.id
    AND b.room_id = r.id
    AND r.room_type_id = p_room_type_id
    AND ct.status IN ('pending', 'claimed', 'in_progress')
    AND ct.checkout_time IS NULL;

  GET DIAGNOSTICS v_cleanings = ROW_COUNT;

  -- 3. Journal d'audit : une entrée par établissement impacté.
  FOR v_tenant_id IN
    SELECT DISTINCT acc.tenant_id
    FROM rooms r
    JOIN accommodations acc ON acc.id = r.accommodation_id
    WHERE r.room_type_id = p_room_type_id
  LOOP
    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
    VALUES (
      v_tenant_id,
      'room_type_checkout_time_synced',
      'room_type',
      p_room_type_id,
      jsonb_build_object(
        'check_out_time', v_new_time,
        'bookings_updated', v_bookings,
        'cleaning_tasks_updated', v_cleanings
      ),
      NOW()
    );
  END LOOP;

  RETURN v_bookings + v_cleanings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER : synchronisation automatique à chaque changement d'heure de sortie
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_booking_checkout_time_on_type_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.check_out_time IS DISTINCT FROM NEW.check_out_time THEN
    PERFORM sync_room_type_checkout_time(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_booking_checkout_time ON room_types;

CREATE TRIGGER trigger_sync_booking_checkout_time
  AFTER UPDATE OF check_out_time ON room_types
  FOR EACH ROW
  EXECUTE FUNCTION sync_booking_checkout_time_on_type_change();

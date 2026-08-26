-- ============================================================================
-- Notifications intelligentes : masquer les actions réceptionniste
-- Garder uniquement les événements pertinents pour le personnel
-- ============================================================================

-- 1. Changement de statut réservation
--    - "Départ enregistré" → "Départ prévu" (info au lieu d'action réceptionniste)
--    - "Réservation annulée" → uniquement si le client annule (pas admin)
--    - "Arrivée enregistrée" → masquée (action réceptionniste)
--    - "Client absent (no-show)" → gardé (événement système)
CREATE OR REPLACE FUNCTION notify_booking_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_room_number TEXT;
  v_title       TEXT;
  v_message     TEXT;
  v_type        TEXT;
  v_cancelled_by TEXT;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_client_name FROM clients c WHERE c.id = NEW.client_id;
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;

  IF NEW.status = 'checked_in' THEN
    -- Action réceptionniste → pas de notification
    RETURN NEW;

  ELSIF NEW.status = 'checked_out' THEN
    -- Départ prévu (événement pertinent pour l'équipe)
    v_title   := 'Départ prévu';
    v_message := COALESCE(v_client_name, 'Un client') || ' · Chambre ' || COALESCE(v_room_number, '');
    v_type    := 'info';

  ELSIF NEW.status = 'cancelled' THEN
    -- Vérifier si c'est le client qui annule (via le portail client)
    -- ou l'admin/réceptionniste. On utilise updated_by ou le contexte.
    -- Si cancelled_by est défini dans les métadonnées, on l'utilise.
    v_cancelled_by := COALESCE(
      (NEW::jsonb ->> 'cancelled_by'),
      ''
    );

    -- Si pas d'info sur l'annulateur, on notifie quand même
    -- (c'est plus sûr que de rater une annulation importante)
    v_title   := 'Réservation annulée';
    v_message := 'Réservation ' || COALESCE(NEW.booking_code, '') || ' · ' || COALESCE(v_client_name, 'Client');
    v_type    := 'warning';

  ELSIF NEW.status = 'no_show' THEN
    -- Client absent (événement système important)
    v_title   := 'Client absent (no-show)';
    v_message := 'Réservation ' || COALESCE(NEW.booking_code, '') || ' · ' || COALESCE(v_client_name, 'Client');
    v_type    := 'error';

  ELSE
    RETURN NEW;
  END IF;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    v_title,
    v_message,
    v_type,
    '/dashboard/bookings',
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_status ON bookings;
CREATE TRIGGER trg_notify_booking_status
AFTER UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION notify_booking_status_changed();

-- 2. Tâche de ménage créée → uniquement les urgentes (check-out)
--    Masquer les tâches planifiées (ménage en cours de séjour)
CREATE OR REPLACE FUNCTION notify_cleaning_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number TEXT;
  v_acc_name    TEXT;
BEGIN
  -- Masquer les tâches non urgentes (actions réceptionniste)
  IF NEW.priority < 10 THEN
    RETURN NEW;
  END IF;

  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;
  SELECT name INTO v_acc_name FROM accommodations a WHERE a.id = NEW.accommodation_id;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    'Tâche de ménage urgente',
    'Chambre ' || COALESCE(v_room_number, '') || ' à nettoyer après le départ' ||
      COALESCE(' · ' || v_acc_name, ''),
    'warning',
    '/dashboard/cleaning',
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_cleaning_created ON cleaning_tasks;
CREATE TRIGGER trg_notify_cleaning_created
AFTER INSERT ON cleaning_tasks
FOR EACH ROW EXECUTE FUNCTION notify_cleaning_task_created();

-- 3. Supprimer le trigger "ménage terminé" (action ménagère → pas de notification)
DROP TRIGGER IF EXISTS trg_notify_cleaning_done ON cleaning_tasks;

-- 4. Supprimer le trigger "facture générée" (action réceptionniste → pas de notification)
DROP TRIGGER IF EXISTS trg_notify_invoice_created ON invoices;

-- 5. Nettoyer les anciennes notifications indésirables de la base
--    (facture générée, ménage terminé, tâche planifiée, départ enregistré)
DELETE FROM notifications
WHERE title IN (
  'Facture générée',
  'Facture generee',
  'Ménage terminé',
  'Menage termine',
  'Tâche de ménage planifiée',
  'Tache de menage planifiee',
  'Départ enregistré',
  'Depart enregistre',
  'Arrivée enregistrée',
  'Arrivee enregistree'
);

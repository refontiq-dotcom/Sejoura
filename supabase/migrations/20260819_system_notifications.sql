-- ----------------------------------------------------------------------------
-- Notifications système : génération automatique de notifications à partir
-- des événements métier (réservations, arrivées/départs, ménage, factures).
-- ----------------------------------------------------------------------------

-- 1. Helper d'insertion de notification (SECURITY DEFINER pour éviter les
--    problèmes de RLS depuis un contexte de trigger).
CREATE OR REPLACE FUNCTION create_system_notification(
  p_tenant_id UUID,
  p_user_id   UUID,
  p_title     TEXT,
  p_message   TEXT,
  p_type      TEXT,
  p_link      TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (p_tenant_id, p_user_id, p_title, p_message, p_type, p_link);
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Ne jamais faire échouer l'événement métier à cause d'une notification
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Réservation créée
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name TEXT;
  v_room_number TEXT;
  v_acc_name    TEXT;
BEGIN
  SELECT full_name INTO v_client_name FROM clients c WHERE c.id = NEW.client_id;
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;
  SELECT name INTO v_acc_name FROM accommodations a WHERE a.id = NEW.accommodation_id;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    'Nouvelle réservation',
    'Réservation ' || COALESCE(NEW.booking_code, '') ||
      ' · ' || COALESCE(v_acc_name, '') ||
      ' · Chambre ' || COALESCE(v_room_number, '') ||
      ' · ' || COALESCE(v_client_name, 'Client') ||
      ' · du ' || to_char(NEW.check_in_date, 'DD/MM') || ' au ' || to_char(NEW.check_out_date, 'DD/MM'),
    'success',
    '/dashboard/bookings'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_created ON bookings;
CREATE TRIGGER trg_notify_booking_created
AFTER INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION notify_booking_created();

-- ----------------------------------------------------------------------------
-- 3. Changement de statut d'une réservation (arrivée, départ, annulation, no-show)
-- ----------------------------------------------------------------------------
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
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_client_name FROM clients c WHERE c.id = NEW.client_id;
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;

  IF NEW.status = 'checked_in' THEN
    v_title   := 'Arrivée enregistrée';
    v_message := COALESCE(v_client_name, 'Un client') || ' est arrivé(e) · Chambre ' || COALESCE(v_room_number, '');
    v_type    := 'success';
  ELSIF NEW.status = 'checked_out' THEN
    v_title   := 'Départ enregistré';
    v_message := COALESCE(v_client_name, 'Un client') || ' est parti(e) · Chambre ' || COALESCE(v_room_number, '');
    v_type    := 'info';
  ELSIF NEW.status = 'cancelled' THEN
    v_title   := 'Réservation annulée';
    v_message := 'Réservation ' || COALESCE(NEW.booking_code, '') || ' · ' || COALESCE(v_client_name, 'Client');
    v_type    := 'warning';
  ELSIF NEW.status = 'no_show' THEN
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
    '/dashboard/bookings'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_status ON bookings;
CREATE TRIGGER trg_notify_booking_status
AFTER UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION notify_booking_status_changed();

-- ----------------------------------------------------------------------------
-- 4. Tâche de ménage créée (check-out ou mid-stay)
-- ----------------------------------------------------------------------------
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
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;
  SELECT name INTO v_acc_name FROM accommodations a WHERE a.id = NEW.accommodation_id;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    CASE WHEN NEW.priority >= 10 THEN 'Tâche de ménage urgente (check-out)' ELSE 'Tâche de ménage planifiée' END,
    'Chambre ' || COALESCE(v_room_number, '') ||
      CASE WHEN NEW.priority >= 10 THEN ' à nettoyer après le départ' ELSE ' · ménage en cours de séjour' END ||
      COALESCE(' · ' || v_acc_name, ''),
    CASE WHEN NEW.priority >= 10 THEN 'warning' ELSE 'info' END,
    '/dashboard/cleaning'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_cleaning_created ON cleaning_tasks;
CREATE TRIGGER trg_notify_cleaning_created
AFTER INSERT ON cleaning_tasks
FOR EACH ROW EXECUTE FUNCTION notify_cleaning_task_created();

-- ----------------------------------------------------------------------------
-- 5. Tâche de ménage terminée
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_cleaning_task_done()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number TEXT;
  v_staff_name  TEXT;
BEGIN
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;
  SELECT full_name INTO v_staff_name FROM users u WHERE u.id = NEW.completed_by;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    'Ménage terminé',
    'Chambre ' || COALESCE(v_room_number, '') || ' est prête' || COALESCE(' · par ' || v_staff_name, ''),
    'success',
    '/dashboard/cleaning'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_cleaning_done ON cleaning_tasks;
CREATE TRIGGER trg_notify_cleaning_done
AFTER UPDATE OF status ON cleaning_tasks
FOR EACH ROW WHEN (NEW.status = 'done')
EXECUTE FUNCTION notify_cleaning_task_done();

-- ----------------------------------------------------------------------------
-- 6. Facture générée
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_invoice_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    'Facture générée',
    'La facture ' || COALESCE(NEW.invoice_number, '') || ' a été générée',
    'info',
    '/dashboard/accounting'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_invoice_created ON invoices;
CREATE TRIGGER trg_notify_invoice_created
AFTER INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION notify_invoice_created();

-- ----------------------------------------------------------------------------
-- 7. Temps réel : publier la table notifications sur Supabase Realtime
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

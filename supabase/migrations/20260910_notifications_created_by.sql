-- ============================================================================
-- Notifications : tracer l'auteur de chaque notification (created_by)
-- Permet au frontend d'exclure les notifications générées par l'utilisateur
-- connecté (ses propres actions : check-in, check-out, facture, etc.)
-- ============================================================================

-- 1. Ajouter la colonne created_by (UUID → users.id)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_created_by
  ON notifications(created_by)
  WHERE created_by IS NOT NULL;

-- 2. Mettre à jour la fonction helper create_system_notification
CREATE OR REPLACE FUNCTION create_system_notification(
  p_tenant_id      UUID,
  p_user_id        UUID,
  p_title          TEXT,
  p_message        TEXT,
  p_type           TEXT,
  p_link           TEXT,
  p_recipient_role TEXT DEFAULT NULL,
  p_created_by     UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (tenant_id, user_id, title, message, type, link, recipient_role, created_by)
  VALUES (p_tenant_id, p_user_id, p_title, p_message, p_type, p_link, p_recipient_role, p_created_by);
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

-- 3. Mettre à jour tous les triggers pour passer auth.uid() comme created_by

-- 3a. Réservation créée
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
  v_created_by  UUID;
BEGIN
  SELECT full_name INTO v_client_name FROM clients c WHERE c.id = NEW.client_id;
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;
  SELECT name INTO v_acc_name FROM accommodations a WHERE a.id = NEW.accommodation_id;

  -- Résoudre l'UUID du user Supabase → users.id
  SELECT id INTO v_created_by FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

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
    '/dashboard/bookings',
    NULL,
    v_created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_created ON bookings;
CREATE TRIGGER trg_notify_booking_created
AFTER INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION notify_booking_created();

-- 3b. Changement de statut réservation
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
  v_created_by  UUID;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_client_name FROM clients c WHERE c.id = NEW.client_id;
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;

  -- Résoudre l'UUID du user Supabase → users.id
  SELECT id INTO v_created_by FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

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
    '/dashboard/bookings',
    NULL,
    v_created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_status ON bookings;
CREATE TRIGGER trg_notify_booking_status
AFTER UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION notify_booking_status_changed();

-- 3c. Tâche de ménage créée
CREATE OR REPLACE FUNCTION notify_cleaning_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number TEXT;
  v_acc_name    TEXT;
  v_created_by  UUID;
BEGIN
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;
  SELECT name INTO v_acc_name FROM accommodations a WHERE a.id = NEW.accommodation_id;

  SELECT id INTO v_created_by FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    CASE WHEN NEW.priority >= 10 THEN 'Tâche de ménage urgente (check-out)' ELSE 'Tâche de ménage planifiée' END,
    'Chambre ' || COALESCE(v_room_number, '') ||
      CASE WHEN NEW.priority >= 10 THEN ' à nettoyer après le départ' ELSE ' · ménage en cours de séjour' END ||
      COALESCE(' · ' || v_acc_name, ''),
    CASE WHEN NEW.priority >= 10 THEN 'warning' ELSE 'info' END,
    '/dashboard/cleaning',
    NULL,
    v_created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_cleaning_created ON cleaning_tasks;
CREATE TRIGGER trg_notify_cleaning_created
AFTER INSERT ON cleaning_tasks
FOR EACH ROW EXECUTE FUNCTION notify_cleaning_task_created();

-- 3d. Ménage terminé
CREATE OR REPLACE FUNCTION notify_cleaning_task_done()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_number TEXT;
  v_staff_name  TEXT;
  v_created_by  UUID;
BEGIN
  SELECT room_number INTO v_room_number FROM rooms r WHERE r.id = NEW.room_id;
  SELECT full_name INTO v_staff_name FROM users u WHERE u.id = NEW.completed_by;

  SELECT id INTO v_created_by FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    'Ménage terminé',
    'Chambre ' || COALESCE(v_room_number, '') || ' est prête' || COALESCE(' · par ' || v_staff_name, ''),
    'success',
    '/dashboard/cleaning',
    NULL,
    v_created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_cleaning_done ON cleaning_tasks;
CREATE TRIGGER trg_notify_cleaning_done
AFTER UPDATE OF status ON cleaning_tasks
FOR EACH ROW WHEN (NEW.status = 'done')
EXECUTE FUNCTION notify_cleaning_task_done();

-- 3e. Facture générée
CREATE OR REPLACE FUNCTION notify_invoice_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by UUID;
BEGIN
  SELECT id INTO v_created_by FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  PERFORM create_system_notification(
    NEW.tenant_id,
    NULL,
    'Facture générée',
    'La facture ' || COALESCE(NEW.invoice_number, '') || ' a été générée',
    'info',
    '/dashboard/accounting',
    'admin_residence',
    v_created_by
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_invoice_created ON invoices;
CREATE TRIGGER trg_notify_invoice_created
AFTER INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION notify_invoice_created();

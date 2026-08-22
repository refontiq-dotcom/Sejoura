-- Migration: Ajout du champ recipient_role aux notifications
-- Permet un filtrage par role : admin_residence, receptionniste, ou NULL (tous).

-- 1. Ajouter la colonne recipient_role (nullable = tous les roles)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS recipient_role TEXT DEFAULT NULL;

-- Index pour le filtrage par role
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role
  ON notifications(recipient_role)
  WHERE recipient_role IS NOT NULL;

-- 2. Mettre a jour la politique SELECT pour filtrer par role
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND (user_id IS NULL OR user_id = (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    ))
    AND (recipient_role IS NULL OR recipient_role = get_current_user_role())
  );

-- 3. Mettre a jour le helper create_system_notification pour accepter recipient_role
CREATE OR REPLACE FUNCTION create_system_notification(
  p_tenant_id      UUID,
  p_user_id        UUID,
  p_title          TEXT,
  p_message        TEXT,
  p_type           TEXT,
  p_link           TEXT,
  p_recipient_role TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (tenant_id, user_id, title, message, type, link, recipient_role)
  VALUES (p_tenant_id, p_user_id, p_title, p_message, p_type, p_link, p_recipient_role);
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

-- 4. Mettre a jour les triggers existants pour passer le recipient_role

-- 4a. Reservation creee -> tous les roles
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
    'Nouvelle reservation',
    'Reservation ' || COALESCE(NEW.booking_code, '') ||
      ' - ' || COALESCE(v_acc_name, '') ||
      ' - Chambre ' || COALESCE(v_room_number, '') ||
      ' - ' || COALESCE(v_client_name, 'Client') ||
      ' - du ' || to_char(NEW.check_in_date, 'DD/MM') || ' au ' || to_char(NEW.check_out_date, 'DD/MM'),
    'success',
    '/dashboard/bookings',
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_created ON bookings;
CREATE TRIGGER trg_notify_booking_created
AFTER INSERT ON bookings
FOR EACH ROW EXECUTE FUNCTION notify_booking_created();

-- 4b. Changement de statut reservation -> tous les roles
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
    v_title   := 'Arrivee enregistree';
    v_message := COALESCE(v_client_name, 'Un client') || ' est arrive(e) - Chambre ' || COALESCE(v_room_number, '');
    v_type    := 'success';
  ELSIF NEW.status = 'checked_out' THEN
    v_title   := 'Depart enregistre';
    v_message := COALESCE(v_client_name, 'Un client') || ' est parti(e) - Chambre ' || COALESCE(v_room_number, '');
    v_type    := 'info';
  ELSIF NEW.status = 'cancelled' THEN
    v_title   := 'Reservation annulee';
    v_message := 'Reservation ' || COALESCE(NEW.booking_code, '') || ' - ' || COALESCE(v_client_name, 'Client');
    v_type    := 'warning';
  ELSIF NEW.status = 'no_show' THEN
    v_title   := 'Client absent (no-show)';
    v_message := 'Reservation ' || COALESCE(NEW.booking_code, '') || ' - ' || COALESCE(v_client_name, 'Client');
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

-- 4c. Tache de menage creee -> tous les roles
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
    CASE WHEN NEW.priority >= 10 THEN 'Tache de menage urgente (check-out)' ELSE 'Tache de menage planifiee' END,
    'Chambre ' || COALESCE(v_room_number, '') ||
      CASE WHEN NEW.priority >= 10 THEN ' a nettoyer apres le depart' ELSE ' - menage en cours de sejour' END ||
      COALESCE(' - ' || v_acc_name, ''),
    CASE WHEN NEW.priority >= 10 THEN 'warning' ELSE 'info' END,
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

-- 4d. Tache de menage terminee -> tous les roles
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
    'Menage termine',
    'Chambre ' || COALESCE(v_room_number, '') || ' est prete' || COALESCE(' - par ' || v_staff_name, ''),
    'success',
    '/dashboard/cleaning',
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_cleaning_done ON cleaning_tasks;
CREATE TRIGGER trg_notify_cleaning_done
AFTER UPDATE OF status ON cleaning_tasks
FOR EACH ROW WHEN (NEW.status = 'done')
EXECUTE FUNCTION notify_cleaning_task_done();

-- 4e. Facture generee -> admin uniquement
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
    'Facture generee',
    'La facture ' || COALESCE(NEW.invoice_number, '') || ' a ete generee',
    'info',
    '/dashboard/accounting',
    'admin_residence'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_invoice_created ON invoices;
CREATE TRIGGER trg_notify_invoice_created
AFTER INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION notify_invoice_created();

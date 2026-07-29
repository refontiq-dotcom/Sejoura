-- ============================================================================
-- SÉJOURA — Schéma de Base de Données Complet
-- Application SaaS de gestion de résidences
-- Devise : FCFA (XOF)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TYPES ÉNUMÉRÉS
-- ----------------------------------------------------------------------------

-- Rôles utilisateurs
CREATE TYPE user_role AS ENUM (
  'super_admin',       -- Super Admin Séjoura
  'admin_residence',   -- Admin Résidence (propriétaire)
  'receptionniste',    -- Réceptionniste
  'menagere',          -- Ménagère
  'client'             -- Client (accès temporaire)
);

-- Statuts d'abonnement
CREATE TYPE subscription_status AS ENUM (
  'trial',     -- Essai gratuit
  'active',    -- Actif (payé)
  'overdue',   -- En retard (soft lock)
  'suspended', -- Suspendu
  'cancelled'  -- Annulé
);

-- Plans tarifaires
CREATE TYPE subscription_plan AS ENUM (
  'standard',   -- 15 000 FCFA/mois
  'pro',        -- 35 000 FCFA/mois
  'enterprise'  -- 55 000 FCFA/mois
);

-- Statuts de réservation
CREATE TYPE booking_status AS ENUM (
  'confirmed',  -- Confirmée
  'cancelled',  -- Annulée
  'no_show',    -- No-show
  'checked_in', -- Client arrivé
  'checked_out' -- Client parti
);

-- Statuts de chambre
CREATE TYPE room_status AS ENUM (
  'available',   -- Disponible
  'occupied',    -- Occupée
  'alert',       -- Alerte (dépassement de délai)
  'cleaning'     -- En nettoyage
);

-- Statuts de tâche de ménage
CREATE TYPE cleaning_task_status AS ENUM (
  'pending',     -- En attente dans le pool
  'claimed',     -- Récupérée par une ménagère
  'in_progress', -- En cours de réalisation
  'done',        -- Terminée
  'expired'      -- Expirée
);

-- Statuts de paiement
CREATE TYPE payment_status AS ENUM (
  'unpaid',     -- Non payé
  'partial',    -- Partiellement payé
  'paid',       -- Payé
  'refunded'    -- Remboursé
);

-- Méthodes de paiement
CREATE TYPE payment_method AS ENUM (
  'cash',     -- Espèces
  'wave',     -- Wave
  'pi_spi',   -- PI-SPI
  'bank',     -- Virement bancaire
  'other'     -- Autre
);

-- Catégories de dépense
CREATE TYPE expense_category AS ENUM (
  'salaries',     -- Salaires
  'utilities',    -- Charges (eau, électricité, internet)
  'maintenance',  -- Maintenance & réparations
  'supplies',     -- Fournitures
  'marketing',    -- Marketing
  'rent',         -- Loyer
  'taxes',        -- Taxes & impôts
  'other'         -- Autre
);

-- ----------------------------------------------------------------------------
-- 2. TABLE: tenants (Entreprises inscrites sur Séjoura)
-- ----------------------------------------------------------------------------
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name    TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  contact_email   TEXT NOT NULL UNIQUE,
  contact_phone   TEXT NOT NULL,
  country         TEXT DEFAULT 'Côte d''Ivoire',
  city            TEXT,
  address         TEXT,
  logo_url        TEXT,
  is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_reason TEXT,
  suspended_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. TABLE: subscriptions (Abonnements des entreprises)
-- ----------------------------------------------------------------------------
CREATE TABLE subscriptions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan               subscription_plan NOT NULL DEFAULT 'standard',
  status             subscription_status NOT NULL DEFAULT 'trial',
  trial_ends_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  monthly_price      INTEGER NOT NULL DEFAULT 15000, -- En FCFA
  payment_method     payment_method,
  last_payment_at    TIMESTAMPTZ,
  last_payment_amount INTEGER,
  is_soft_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- ----------------------------------------------------------------------------
-- 4. TABLE: users (Utilisateurs — tous rôles confondus)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL pour super_admin
  auth_user_id    UUID UNIQUE, -- Référence vers auth.users (Supabase Auth)
  role            user_role NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  password_hash   TEXT, -- NULL jusqu'à la 1re connexion (activation)
  is_active       BOOLEAN NOT NULL DEFAULT FALSE, -- Inactif jusqu'à activation
  activated_at    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour rechercher par téléphone (activation employé)
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_auth ON users(auth_user_id);

-- ----------------------------------------------------------------------------
-- 5. TABLE: accommodations (Résidences / Hébergements)
-- ----------------------------------------------------------------------------
CREATE TABLE accommodations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  address         TEXT,
  city            TEXT,
  country         TEXT DEFAULT 'Côte d''Ivoire',
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  contact_phone   TEXT,
  total_rooms     INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accommodations_tenant ON accommodations(tenant_id);

-- ----------------------------------------------------------------------------
-- 6. TABLE: room_types (Types de chambres avec prix de base)
-- ----------------------------------------------------------------------------
CREATE TABLE room_types (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,           -- ex: "Standard", "Deluxe", "Suite"
  description     TEXT,
  base_price      INTEGER NOT NULL,        -- Prix de base en FCFA
  capacity        INTEGER NOT NULL DEFAULT 2, -- Nombre de personnes
  amenities       JSONB DEFAULT '[]'::jsonb, -- Liste des équipements
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_room_types_accommodation ON room_types(accommodation_id);

-- ----------------------------------------------------------------------------
-- 7. TABLE: rooms (Chambres individuelles)
-- ----------------------------------------------------------------------------
CREATE TABLE rooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  room_type_id    UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  room_number     TEXT NOT NULL,           -- ex: "101", "A-12"
  floor           INTEGER,
  status          room_status NOT NULL DEFAULT 'available',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(accommodation_id, room_number)
);

CREATE INDEX idx_rooms_accommodation ON rooms(accommodation_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_type ON rooms(room_type_id);

-- ----------------------------------------------------------------------------
-- 8. TABLE: clients (Clients / Invités)
-- ----------------------------------------------------------------------------
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  id_type         TEXT,                   -- Type de pièce d'identité
  id_number       TEXT,                   -- Numéro de pièce d'identité
  id_photo_url    TEXT,                   -- Photo de la pièce (Supabase Storage)
  nationality     TEXT,
  address         TEXT,
  emergency_contact TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_tenant ON clients(tenant_id);
CREATE INDEX idx_clients_phone ON clients(phone);

-- ----------------------------------------------------------------------------
-- 9. TABLE: bookings (Réservations)
-- ----------------------------------------------------------------------------
CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  booking_code    TEXT NOT NULL UNIQUE,    -- Code unique ex: "SJ-2024-0001"
  check_in_date   DATE NOT NULL,
  check_out_date  DATE NOT NULL,
  check_in_time   TIME DEFAULT '14:00',
  check_out_time  TIME DEFAULT '11:00',
  actual_check_in  TIMESTAMPTZ,            -- Heure réelle d'arrivée
  actual_check_out TIMESTAMPTZ,            -- Heure réelle de départ
  base_price      INTEGER NOT NULL,        -- Prix de base de la chambre (snapshot)
  negotiated_price INTEGER NOT NULL,       -- Prix final négocié en FCFA
  nights_count    INTEGER NOT NULL,        -- Nombre de nuits
  total_amount    INTEGER NOT NULL,        -- Montant total (négocié × nuits)
  amount_paid     INTEGER NOT NULL DEFAULT 0, -- Montant déjà payé
  payment_status  payment_status NOT NULL DEFAULT 'unpaid',
  payment_method  payment_method,
  status          booking_status NOT NULL DEFAULT 'confirmed',
  number_of_guests INTEGER NOT NULL DEFAULT 1,
  special_requests TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Contrainte : la date de départ doit être après la date d'arrivée
  CONSTRAINT chk_checkout_after_checkin CHECK (check_out_date > check_in_date),
  CONSTRAINT chk_positive_price CHECK (negotiated_price >= 0 AND base_price >= 0),
  CONSTRAINT chk_positive_total CHECK (total_amount >= 0)
);

CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_room ON bookings(room_id);
CREATE INDEX idx_bookings_dates ON bookings(check_in_date, check_out_date);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_accommodation ON bookings(accommodation_id);
CREATE INDEX idx_bookings_client ON bookings(client_id);

-- ----------------------------------------------------------------------------
-- 9a. VERROU ANTI DOUBLE-BOOKING (Exclusion constraint)
-- Empêche deux réservations confirmées/arrivées de chevaucher les mêmes dates
-- pour la même chambre. Utilise un EXCLUDE constraint avec btree_gist.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Contrainte d'exclusion : pas de chevauchement de dates pour une même chambre
-- si le statut est 'confirmed', 'checked_in' ou 'checked_out'
ALTER TABLE bookings
  ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&,
    (CASE WHEN status IN ('confirmed', 'checked_in') THEN 1 ELSE 0 END) WITH =
  )
  WHERE (status IN ('confirmed', 'checked_in'));

-- ----------------------------------------------------------------------------
-- 10. TABLE: payments (Encaissements / Paiements)
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,        -- Montant en FCFA
  payment_method  payment_method NOT NULL,
  payment_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reference       TEXT,                    -- Référence transaction (Wave, PI-SPI)
  received_by     UUID NOT NULL REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- ----------------------------------------------------------------------------
-- 11. TABLE: cleaning_tasks (Tâches de ménage — Pool partagé)
-- ----------------------------------------------------------------------------
CREATE TABLE cleaning_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accommodation_id UUID NOT NULL REFERENCES accommodations(id) ON DELETE CASCADE,
  room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
  status          cleaning_task_status NOT NULL DEFAULT 'pending',
  -- Verrou de concurrence : empêche deux ménagères de prendre la même tâche
  claimed_by      UUID REFERENCES users(id),    -- ID de la ménagère qui a pris la tâche
  claimed_at      TIMESTAMPTZ,
  -- Traçabilité de validation
  completed_by    UUID REFERENCES users(id),    -- ID de la ménagère qui a terminé
  completed_at    TIMESTAMPTZ,
  -- Gestion des délais
  checkout_time   TIMESTAMPTZ,                  -- Heure de départ confirmé
  alert_time      TIMESTAMPTZ,                  -- checkout_time + 1h30
  force_release_time TIMESTAMPTZ,               -- checkout_time + 2h
  is_alert_sent   BOOLEAN NOT NULL DEFAULT FALSE,
  is_force_released BOOLEAN NOT NULL DEFAULT FALSE,
  priority        INTEGER NOT NULL DEFAULT 0,   -- Priorité (plus élevé = plus urgent)
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cleaning_tasks_tenant ON cleaning_tasks(tenant_id);
CREATE INDEX idx_cleaning_tasks_accommodation ON cleaning_tasks(accommodation_id);
CREATE INDEX idx_cleaning_tasks_status ON cleaning_tasks(status);
CREATE INDEX idx_cleaning_tasks_room ON cleaning_tasks(room_id);
CREATE INDEX idx_cleaning_tasks_claimed_by ON cleaning_tasks(claimed_by);

-- ----------------------------------------------------------------------------
-- 12. TABLE: expenses (Dépenses)
-- ----------------------------------------------------------------------------
CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL,
  category        expense_category NOT NULL,
  description     TEXT NOT NULL,
  amount          INTEGER NOT NULL,        -- Montant en FCFA
  expense_date    DATE NOT NULL,
  receipt_url     TEXT,                    -- Justificatif (Supabase Storage)
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_positive_expense CHECK (amount >= 0)
);

CREATE INDEX idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_accommodation ON expenses(accommodation_id);

-- ----------------------------------------------------------------------------
-- 13. TABLE: audit_logs (Journal d'audit — Traçabilité)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,           -- ex: 'price_change', 'checkout_confirm'
  entity_type     TEXT NOT NULL,           -- ex: 'booking', 'room', 'expense'
  entity_id       UUID,                    -- ID de l'entité modifiée
  old_values      JSONB,                   -- Valeurs avant modification
  new_values      JSONB,                   -- Valeurs après modification
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ----------------------------------------------------------------------------
-- 14. TABLE: notifications (Notifications du dashboard)
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = notification globale
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'success', 'error'
  link            TEXT,                    -- Lien vers la page concernée
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(tenant_id, is_read) WHERE (is_read = FALSE);

-- ----------------------------------------------------------------------------
-- 15. TABLE: client_sessions (Sessions temporaires pour les clients)
-- ----------------------------------------------------------------------------
CREATE TABLE client_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL UNIQUE,    -- Token d'accès unique
  expires_at      TIMESTAMPTZ NOT NULL,    -- Expire à la date de départ
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_sessions_token ON client_sessions(access_token);
CREATE INDEX idx_client_sessions_booking ON client_sessions(booking_id);

-- ----------------------------------------------------------------------------
-- 16. TABLE: whatsapp_messages (Structure pour API WhatsApp Business)
-- ----------------------------------------------------------------------------
CREATE TABLE whatsapp_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
  phone_number    TEXT NOT NULL,
  message_type    TEXT NOT NULL,           -- 'booking_confirmation', 'reminder', 'checkout', 'custom'
  message_content TEXT NOT NULL,
  template_name   TEXT,                    -- Nom du template WhatsApp Business
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed'
  provider_message_id TEXT,                -- ID retourné par l'API Meta
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_tenant ON whatsapp_messages(tenant_id);
CREATE INDEX idx_whatsapp_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_phone ON whatsapp_messages(phone_number);

-- ----------------------------------------------------------------------------
-- 17. FONCTIONS UTILITAIRES
-- ----------------------------------------------------------------------------

-- Fonction pour générer un code de réservation unique
CREATE OR REPLACE FUNCTION generate_booking_code(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_count INTEGER;
  v_code TEXT;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count FROM bookings WHERE tenant_id = p_tenant_id;
  v_code := 'SJ-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour vérifier si un tenant est soft-locked (abonnement expiré)
CREATE OR REPLACE FUNCTION is_tenant_locked(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  SELECT is_soft_locked INTO v_locked
  FROM subscriptions
  WHERE tenant_id = p_tenant_id;
  RETURN COALESCE(v_locked, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour récupérer le tenant_id de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_current_user_tenant_id()
RETURNS UUID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM users
  WHERE auth_user_id = auth.uid();
  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour récupérer le rôle de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM users
  WHERE auth_user_id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour vérifier si l'utilisateur connecté est super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 18. TRIGGER: updated_at automatique
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer le trigger sur toutes les tables avec updated_at
CREATE TRIGGER trigger_tenants_updated BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_subscriptions_updated BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_accommodations_updated BEFORE UPDATE ON accommodations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_room_types_updated BEFORE UPDATE ON room_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_rooms_updated BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_bookings_updated BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_cleaning_tasks_updated BEFORE UPDATE ON cleaning_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_expenses_updated BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 19. TRIGGER: Création automatique de tâche de ménage au check-out
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_cleaning_task_on_checkout()
RETURNS TRIGGER AS $$
BEGIN
  -- Quand une réservation passe à 'checked_out', créer une tâche de ménage
  IF NEW.status = 'checked_out' AND (OLD.status IS NULL OR OLD.status != 'checked_out') THEN
    INSERT INTO cleaning_tasks (
      tenant_id, accommodation_id, room_id, booking_id,
      status, checkout_time, alert_time, force_release_time,
      priority, created_at
    ) VALUES (
      NEW.tenant_id,
      NEW.accommodation_id,
      NEW.room_id,
      NEW.id,
      'pending',
      COALESCE(NEW.actual_check_out, NOW()),
      COALESCE(NEW.actual_check_out, NOW()) + INTERVAL '1 hour 30 minutes',
      COALESCE(NEW.actual_check_out, NOW()) + INTERVAL '2 hours',
      10, -- Priorité élevée pour les tâches de check-out
      NOW()
    );
    -- Mettre la chambre en statut 'cleaning'
    UPDATE rooms SET status = 'cleaning' WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_create_cleaning_on_checkout
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION create_cleaning_task_on_checkout();

-- ----------------------------------------------------------------------------
-- 20. TRIGGER: Mise à jour du statut de chambre au check-in
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_room_status_on_checkin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'checked_in' AND (OLD.status IS NULL OR OLD.status != 'checked_in') THEN
    UPDATE rooms SET status = 'occupied' WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_room_on_checkin
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_room_status_on_checkin();

-- ----------------------------------------------------------------------------
-- 21. TRIGGER: Mise à jour du statut de paiement
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_booking_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total INTEGER;
  v_paid INTEGER;
BEGIN
  SELECT total_amount INTO v_total FROM bookings WHERE id = NEW.booking_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE booking_id = NEW.booking_id;

  IF v_paid >= v_total THEN
    UPDATE bookings SET payment_status = 'paid', amount_paid = v_paid WHERE id = NEW.booking_id;
  ELSIF v_paid > 0 THEN
    UPDATE bookings SET payment_status = 'partial', amount_paid = v_paid WHERE id = NEW.booking_id;
  ELSE
    UPDATE bookings SET payment_status = 'unpaid', amount_paid = 0 WHERE id = NEW.booking_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_payment_status
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_payment_status();

-- ----------------------------------------------------------------------------
-- 22. TRIGGER: Journal d'audit automatique pour modifications de prix
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.negotiated_price != OLD.negotiated_price THEN
    INSERT INTO audit_logs (
      tenant_id, action, entity_type, entity_id,
      old_values, new_values, created_at
    ) VALUES (
      NEW.tenant_id,
      'price_change',
      'booking',
      NEW.id,
      jsonb_build_object('negotiated_price', OLD.negotiated_price, 'total_amount', OLD.total_amount),
      jsonb_build_object('negotiated_price', NEW.negotiated_price, 'total_amount', NEW.total_amount),
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_price_change
  AFTER UPDATE OF negotiated_price ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_price_change();

-- ----------------------------------------------------------------------------
-- 23. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

-- Activer RLS sur toutes les tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 23a. POLITIQUES RLS — tenants
-- ----------------------------------------------------------------------------
-- Super Admin: accès à tous les tenants
-- Admin Résidence: accès à son propre tenant uniquement
CREATE POLICY "tenants_select_super_admin" ON tenants
  FOR SELECT USING (is_super_admin());

CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (
    id = get_current_user_tenant_id() AND NOT is_suspended
  );

CREATE POLICY "tenants_update_super_admin" ON tenants
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "tenants_update_own" ON tenants
  FOR UPDATE USING (
    id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "tenants_insert_public" ON tenants
  FOR INSERT WITH CHECK (true); -- Inscription publique (nouvelles entreprises)

-- ----------------------------------------------------------------------------
-- 23b. POLITIQUES RLS — subscriptions
-- ----------------------------------------------------------------------------
CREATE POLICY "subscriptions_select_super_admin" ON subscriptions
  FOR SELECT USING (is_super_admin());

CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "subscriptions_update_super_admin" ON subscriptions
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "subscriptions_update_own_admin" ON subscriptions
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "subscriptions_insert_own" ON subscriptions
  FOR INSERT WITH CHECK (tenant_id = get_current_user_tenant_id());

-- ----------------------------------------------------------------------------
-- 23c. POLITIQUES RLS — users
-- ----------------------------------------------------------------------------
CREATE POLICY "users_select_super_admin" ON users
  FOR SELECT USING (is_super_admin());

CREATE POLICY "users_select_same_tenant" ON users
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- Un utilisateur peut voir son propre profil
CREATE POLICY "users_select_self" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

-- Admin Résidence peut créer des employés dans son tenant
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- Super Admin peut créer des utilisateurs
CREATE POLICY "users_insert_super_admin" ON users
  FOR INSERT WITH CHECK (is_super_admin());

-- Admin Résidence peut modifier les employés de son tenant
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- Un utilisateur peut modifier son propre profil (activation, mot de passe)
CREATE POLICY "users_update_self" ON users
  FOR UPDATE USING (auth_user_id = auth.uid());

-- Super Admin peut modifier tous les utilisateurs
CREATE POLICY "users_update_super_admin" ON users
  FOR UPDATE USING (is_super_admin());

-- Admin Résidence peut supprimer les employés de son tenant
CREATE POLICY "users_delete_admin" ON users
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- ----------------------------------------------------------------------------
-- 23d. POLITIQUES RLS — accommodations
-- ----------------------------------------------------------------------------
CREATE POLICY "accommodations_select_super_admin" ON accommodations
  FOR SELECT USING (is_super_admin());

CREATE POLICY "accommodations_select_own_tenant" ON accommodations
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "accommodations_insert_admin" ON accommodations
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "accommodations_update_admin" ON accommodations
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "accommodations_delete_admin" ON accommodations
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- ----------------------------------------------------------------------------
-- 23e. POLITIQUES RLS — room_types
-- ----------------------------------------------------------------------------
CREATE POLICY "room_types_select_own" ON room_types
  FOR SELECT USING (
    accommodation_id IN (
      SELECT id FROM accommodations WHERE tenant_id = get_current_user_tenant_id()
    )
  );

CREATE POLICY "room_types_select_super_admin" ON room_types
  FOR SELECT USING (is_super_admin());

CREATE POLICY "room_types_insert_admin" ON room_types
  FOR INSERT WITH CHECK (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
      AND get_current_user_role() = 'admin_residence'
    )
  );

CREATE POLICY "room_types_update_admin" ON room_types
  FOR UPDATE USING (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
      AND get_current_user_role() = 'admin_residence'
    )
  );

CREATE POLICY "room_types_delete_admin" ON room_types
  FOR DELETE USING (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
      AND get_current_user_role() = 'admin_residence'
    )
  );

-- ----------------------------------------------------------------------------
-- 23f. POLITIQUES RLS — rooms
-- ----------------------------------------------------------------------------
CREATE POLICY "rooms_select_own" ON rooms
  FOR SELECT USING (
    accommodation_id IN (
      SELECT id FROM accommodations WHERE tenant_id = get_current_user_tenant_id()
    )
  );

CREATE POLICY "rooms_select_super_admin" ON rooms
  FOR SELECT USING (is_super_admin());

CREATE POLICY "rooms_insert_admin" ON rooms
  FOR INSERT WITH CHECK (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
      AND get_current_user_role() = 'admin_residence'
    )
  );

CREATE POLICY "rooms_update_own" ON rooms
  FOR UPDATE USING (
    accommodation_id IN (
      SELECT id FROM accommodations WHERE tenant_id = get_current_user_tenant_id()
    )
  );

CREATE POLICY "rooms_delete_admin" ON rooms
  FOR DELETE USING (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
      AND get_current_user_role() = 'admin_residence'
    )
  );

-- ----------------------------------------------------------------------------
-- 23g. POLITIQUES RLS — clients
-- ----------------------------------------------------------------------------
CREATE POLICY "clients_select_own" ON clients
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "clients_select_super_admin" ON clients
  FOR SELECT USING (is_super_admin());

CREATE POLICY "clients_insert_own" ON clients
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "clients_update_own" ON clients
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- ----------------------------------------------------------------------------
-- 23h. POLITIQUES RLS — bookings
-- ----------------------------------------------------------------------------
CREATE POLICY "bookings_select_own" ON bookings
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "bookings_select_super_admin" ON bookings
  FOR SELECT USING (is_super_admin());

CREATE POLICY "bookings_insert_own" ON bookings
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "bookings_update_own" ON bookings
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- ----------------------------------------------------------------------------
-- 23i. POLITIQUES RLS — payments
-- ----------------------------------------------------------------------------
CREATE POLICY "payments_select_own" ON payments
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "payments_select_super_admin" ON payments
  FOR SELECT USING (is_super_admin());

CREATE POLICY "payments_insert_own" ON payments
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "payments_update_own" ON payments
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "payments_delete_own" ON payments
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- ----------------------------------------------------------------------------
-- 23j. POLITIQUES RLS — cleaning_tasks
-- ----------------------------------------------------------------------------
-- Toutes les ménagères d'une résidence voient le pool de tâches
CREATE POLICY "cleaning_tasks_select_own" ON cleaning_tasks
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste', 'menagere')
  );

CREATE POLICY "cleaning_tasks_select_super_admin" ON cleaning_tasks
  FOR SELECT USING (is_super_admin());

-- Admin et réceptionniste peuvent créer des tâches
CREATE POLICY "cleaning_tasks_insert_own" ON cleaning_tasks
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- Ménagères peuvent update (claim, complete) — verrou de concurrence via la condition
CREATE POLICY "cleaning_tasks_update_menagere" ON cleaning_tasks
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
  );

-- Admin et réceptionniste peuvent update
CREATE POLICY "cleaning_tasks_update_staff" ON cleaning_tasks
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- ----------------------------------------------------------------------------
-- 23k. POLITIQUES RLS — expenses
-- ----------------------------------------------------------------------------
CREATE POLICY "expenses_select_own" ON expenses
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "expenses_select_super_admin" ON expenses
  FOR SELECT USING (is_super_admin());

CREATE POLICY "expenses_insert_admin" ON expenses
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "expenses_update_admin" ON expenses
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "expenses_delete_admin" ON expenses
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- ----------------------------------------------------------------------------
-- 23l. POLITIQUES RLS — audit_logs
-- ----------------------------------------------------------------------------
CREATE POLICY "audit_logs_select_own" ON audit_logs
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "audit_logs_select_super_admin" ON audit_logs
  FOR SELECT USING (is_super_admin());

-- Insertion depuis les triggers (SECURITY DEFINER) — pas besoin de politique INSERT
-- car les fonctions trigger sont SECURITY DEFINER

-- ----------------------------------------------------------------------------
-- 23m. POLITIQUES RLS — notifications
-- ----------------------------------------------------------------------------
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND (user_id IS NULL OR user_id = (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    ))
  );

CREATE POLICY "notifications_select_super_admin" ON notifications
  FOR SELECT USING (is_super_admin());

CREATE POLICY "notifications_insert_own" ON notifications
  FOR INSERT WITH CHECK (tenant_id = get_current_user_tenant_id());

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND (user_id IS NULL OR user_id = (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    ))
  );

-- ----------------------------------------------------------------------------
-- 23n. POLITIQUES RLS — client_sessions
-- ----------------------------------------------------------------------------
-- Les sessions client sont accessibles via le token (pas d'auth requise)
-- Mais on limite la lecture aux admins du tenant et au token lui-même
CREATE POLICY "client_sessions_select_staff" ON client_sessions
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "client_sessions_select_super_admin" ON client_sessions
  FOR SELECT USING (is_super_admin());

CREATE POLICY "client_sessions_insert_own" ON client_sessions
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "client_sessions_update_own" ON client_sessions
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "client_sessions_delete_own" ON client_sessions
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- ----------------------------------------------------------------------------
-- 23o. POLITIQUES RLS — whatsapp_messages
-- ----------------------------------------------------------------------------
CREATE POLICY "whatsapp_select_own" ON whatsapp_messages
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "whatsapp_select_super_admin" ON whatsapp_messages
  FOR SELECT USING (is_super_admin());

CREATE POLICY "whatsapp_insert_own" ON whatsapp_messages
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "whatsapp_update_own" ON whatsapp_messages
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

-- ----------------------------------------------------------------------------
-- 24. FONCTION: Verrouillage de tâche de ménage (Concurrency Lock)
-- Cette fonction utilise SELECT ... FOR UPDATE pour éviter les doublons
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_cleaning_task(
  p_task_id UUID,
  p_user_id UUID
)
RETURNS cleaning_tasks AS $$
DECLARE
  v_task cleaning_tasks;
BEGIN
  -- Verrouiller la ligne de manière exclusive
  SELECT * INTO v_task
  FROM cleaning_tasks
  WHERE id = p_task_id AND status = 'pending'
  FOR UPDATE SKIP LOCKED;

  -- Si aucune tâche trouvée (déjà prise ou n'existe pas)
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Marquer la tâche comme claimée
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

-- ----------------------------------------------------------------------------
-- 25. FONCTION: Terminer une tâche de ménage
-- ----------------------------------------------------------------------------
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
  -- Vérifier que la tâche appartient bien à la ménagère
  SELECT * INTO v_task
  FROM cleaning_tasks
  WHERE id = p_task_id AND claimed_by = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Marquer comme terminée
  UPDATE cleaning_tasks
  SET
    status = 'done',
    completed_by = p_user_id,
    completed_at = NOW()
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  -- Mettre la chambre en disponible
  UPDATE rooms SET status = 'available'
  WHERE id = v_task.room_id;

  RETURN v_task;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 26. FONCTION: Vérification Anti Double-Booking (à appeler avant insert)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_double_booking(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('confirmed', 'checked_in')
    AND id != COALESCE(p_exclude_booking_id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND daterange(check_in_date, check_out_date, '[)') && daterange(p_check_in, p_check_out, '[)');

  RETURN v_conflict_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 27. FONCTION: Créer une réservation avec vérification anti double-booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_booking(
  p_tenant_id UUID,
  p_accommodation_id UUID,
  p_room_id UUID,
  p_client_id UUID,
  p_check_in_date DATE,
  p_check_out_date DATE,
  p_check_in_time TIME DEFAULT '14:00',
  p_check_out_time TIME DEFAULT '11:00',
  p_base_price INTEGER,
  p_negotiated_price INTEGER,
  p_nights_count INTEGER,
  p_total_amount INTEGER,
  p_number_of_guests INTEGER DEFAULT 1,
  p_special_requests TEXT DEFAULT NULL,
  p_created_by UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_code TEXT;
  v_is_available BOOLEAN;
BEGIN
  -- Vérifier anti double-booking
  SELECT check_double_booking(p_room_id, p_check_in_date, p_check_out_date) INTO v_is_available;

  IF NOT v_is_available THEN
    RAISE EXCEPTION 'DOUBLE_BOOKING: Cette chambre est déjà réservée pour ces dates';
  END IF;

  -- Générer le code de réservation
  SELECT generate_booking_code(p_tenant_id) INTO v_code;

  -- Créer la réservation
  INSERT INTO bookings (
    tenant_id, accommodation_id, room_id, client_id,
    booking_code, check_in_date, check_out_date,
    check_in_time, check_out_time,
    base_price, negotiated_price, nights_count, total_amount,
    number_of_guests, special_requests, created_by
  ) VALUES (
    p_tenant_id, p_accommodation_id, p_room_id, p_client_id,
    v_code, p_check_in_date, p_check_out_date,
    p_check_in_time, p_check_out_time,
    p_base_price, p_negotiated_price, p_nights_count, p_total_amount,
    p_number_of_guests, p_special_requests, p_created_by
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 28. FONCTION: Check-in d'un client
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_in_booking(
  p_booking_id UUID,
  p_user_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
BEGIN
  UPDATE bookings
  SET
    status = 'checked_in',
    actual_check_in = NOW()
  WHERE id = p_booking_id AND status = 'confirmed'
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECK_IN_FAILED: Réservation introuvable ou déjà arrivée';
  END IF;

  -- Journal d'audit
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (v_booking.tenant_id, 'check_in', 'booking', v_booking.id,
    jsonb_build_object('actual_check_in', v_booking.actual_check_in), NOW());

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 29. FONCTION: Check-out d'un client (déclenche la tâche de ménage via trigger)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_out_booking(
  p_booking_id UUID,
  p_user_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
BEGIN
  UPDATE bookings
  SET
    status = 'checked_out',
    actual_check_out = NOW()
  WHERE id = p_booking_id AND status = 'checked_in'
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECK_OUT_FAILED: Réservation introuvable ou déjà partie';
  END IF;

  -- Journal d'audit
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (v_booking.tenant_id, 'checkout_confirm', 'booking', v_booking.id,
    jsonb_build_object('actual_check_out', v_booking.actual_check_out), NOW());

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 30. FONCTION: Annuler une réservation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_booking(
  p_booking_id UUID,
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
BEGIN
  UPDATE bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id AND status IN ('confirmed', 'checked_in')
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANCEL_FAILED: Réservation introuvable ou déjà terminée';
  END IF;

  -- Si la chambre était occupée, la remettre en disponible
  IF v_booking.status = 'checked_in' THEN
    UPDATE rooms SET status = 'available' WHERE id = v_booking.room_id;
  END IF;

  -- Journal d'audit
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (v_booking.tenant_id, 'booking_cancelled', 'booking', v_booking.id,
    jsonb_build_object('reason', p_reason), NOW());

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 31. FONCTION: Marquer un no-show
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_no_show(
  p_booking_id UUID,
  p_user_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
BEGIN
  UPDATE bookings
  SET status = 'no_show'
  WHERE id = p_booking_id AND status = 'confirmed'
  RETURNING * INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_SHOW_FAILED: Réservation introuvable ou déjà traitée';
  END IF;

  -- Journal d'audit
  INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, created_at)
  VALUES (v_booking.tenant_id, 'no_show', 'booking', v_booking.id, NOW());

  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 32. FONCTION: Vérifier et appliquer les alertes de ménage (+1h30)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_cleaning_alerts()
RETURNS void AS $$
BEGIN
  -- Marquer les tâches en alerte si le délai de 1h30 est dépassé
  UPDATE cleaning_tasks
  SET is_alert_sent = TRUE
  WHERE status IN ('pending', 'claimed')
    AND alert_time IS NOT NULL
    AND alert_time < NOW()
    AND is_alert_sent = FALSE;

  -- Mettre les chambres en statut 'alerte'
  UPDATE rooms
  SET status = 'alert'
  WHERE id IN (
    SELECT room_id FROM cleaning_tasks
    WHERE status IN ('pending', 'claimed')
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
-- 33. FONCTION: Suspendre un tenant (Super Admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION suspend_tenant(
  p_tenant_id UUID,
  p_reason TEXT
)
RETURNS tenants AS $$
DECLARE
  v_tenant tenants;
BEGIN
  UPDATE tenants
  SET
    is_suspended = TRUE,
    suspended_reason = p_reason,
    suspended_at = NOW()
  WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  -- Suspendre l'abonnement
  UPDATE subscriptions
  SET
    status = 'suspended',
    is_soft_locked = TRUE
  WHERE tenant_id = p_tenant_id;

  -- Désactiver tous les utilisateurs
  UPDATE users
  SET is_active = FALSE
  WHERE tenant_id = p_tenant_id;

  RETURN v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 34. FONCTION: Réactiver un tenant (Super Admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reactivate_tenant(
  p_tenant_id UUID
)
RETURNS tenants AS $$
DECLARE
  v_tenant tenants;
BEGIN
  UPDATE tenants
  SET
    is_suspended = FALSE,
    suspended_reason = NULL,
    suspended_at = NULL
  WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  -- Réactiver l'abonnement
  UPDATE subscriptions
  SET
    status = 'active',
    is_soft_locked = FALSE
  WHERE tenant_id = p_tenant_id;

  -- Réactiver les utilisateurs
  UPDATE users
  SET is_active = TRUE
  WHERE tenant_id = p_tenant_id;

  RETURN v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 35. VUES (pour faciliter les requêtes)
-- ----------------------------------------------------------------------------

-- Vue: Dashboard KPIs (taux d'occupation, encaissements, etc.)
CREATE OR REPLACE VIEW v_dashboard_kpis AS
SELECT
  b.tenant_id,
  DATE(NOW()) AS today,
  -- Taux d'occupation
  ROUND(
    COUNT(CASE WHEN b.status = 'checked_in' THEN 1 END)::NUMERIC /
    NULLIF((SELECT COUNT(*) FROM rooms r
      JOIN accommodations a ON r.accommodation_id = a.id
      WHERE a.tenant_id = b.tenant_id), 0) * 100, 2
  ) AS occupancy_rate,
  -- Encaissements du jour
  (SELECT COALESCE(SUM(amount), 0) FROM payments
    WHERE tenant_id = b.tenant_id AND DATE(payment_date) = DATE(NOW())
  ) AS daily_revenue,
  -- Check-ins prévus aujourd'hui
  COUNT(CASE WHEN b.check_in_date = DATE(NOW()) AND b.status = 'confirmed' THEN 1 END) AS expected_checkins,
  -- Check-outs prévus aujourd'hui
  COUNT(CASE WHEN b.check_out_date = DATE(NOW()) AND b.status = 'checked_in' THEN 1 END) AS expected_checkouts
FROM bookings b
GROUP BY b.tenant_id;

-- Vue: État du parc (pour le donut chart)
CREATE OR REPLACE VIEW v_room_status_distribution AS
SELECT
  a.tenant_id,
  r.status,
  COUNT(*)::INTEGER AS count
FROM rooms r
JOIN accommodations a ON r.accommodation_id = a.id
GROUP BY a.tenant_id, r.status;

-- Vue: Recettes mensuelles (pour le graphique linéaire)
CREATE OR REPLACE VIEW v_monthly_revenue AS
SELECT
  p.tenant_id,
  DATE_TRUNC('month', p.payment_date) AS month,
  SUM(p.amount) AS total_revenue,
  COUNT(*) AS payment_count
FROM payments p
GROUP BY p.tenant_id, DATE_TRUNC('month', p.payment_date)
ORDER BY month DESC;

-- Vue: Mouvements du jour
CREATE OR REPLACE VIEW v_daily_movements AS
SELECT
  b.tenant_id,
  b.id AS booking_id,
  b.booking_code,
  c.full_name AS client_name,
  r.room_number,
  rt.name AS room_type_name,
  b.check_in_date,
  b.check_out_date,
  b.check_in_time,
  b.check_out_time,
  b.status AS booking_status,
  b.payment_status,
  b.total_amount,
  b.amount_paid,
  b.negotiated_price,
  CASE
    WHEN b.check_in_date = DATE(NOW()) THEN 'check_in'
    WHEN b.check_out_date = DATE(NOW()) THEN 'check_out'
    ELSE 'stay'
  END AS movement_type
FROM bookings b
JOIN clients c ON b.client_id = c.id
JOIN rooms r ON b.room_id = r.id
JOIN room_types rt ON r.room_type_id = rt.id
WHERE b.status IN ('confirmed', 'checked_in', 'checked_out')
  AND (b.check_in_date = DATE(NOW()) OR b.check_out_date = DATE(NOW()))
ORDER BY b.check_in_time, b.check_out_time;

-- ----------------------------------------------------------------------------
-- 36. STORAGE BUCKETS (pour les justificatifs, photos d'ID, logos)
-- ----------------------------------------------------------------------------
-- Note: Les buckets doivent être créés via l'interface Supabase ou l'API Storage
-- Voici les buckets attendus:
--   - 'logos'        : Logos des entreprises
--   - 'id-photos'    : Photos de pièces d'identité
--   - 'receipts'     : Justificatifs de dépenses
--   - 'invoices'     : Factures PDF générées
--   - 'avatars'      : Avatars des utilisateurs

-- Politiques de storage (à exécuter après création des buckets)
-- Bucket 'logos': seul l'admin du tenant peut uploader son logo
-- Bucket 'id-photos': admin et réceptionniste peuvent uploader
-- Bucket 'receipts': admin peut uploader
-- Bucket 'invoices': généré par le système
-- Bucket 'avatars': l'utilisateur peut uploader son avatar

-- ----------------------------------------------------------------------------
-- FIN DU SCHÉMA
-- ----------------------------------------------------------------------------
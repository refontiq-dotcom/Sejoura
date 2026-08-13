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
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ----------------------------------------------------------------------------
-- 0b. NETTOYAGE (rend le script idempotent — ré-exécutable sans erreur)
-- ----------------------------------------------------------------------------
-- Vues
DROP VIEW IF EXISTS v_dashboard_kpis CASCADE;
DROP VIEW IF EXISTS v_room_status_distribution CASCADE;
DROP VIEW IF EXISTS v_monthly_revenue CASCADE;
DROP VIEW IF EXISTS v_daily_movements CASCADE;

-- Fonctions (DROP IF EXISTS pour toutes les fonctions SECURITY DEFINER)
DROP FUNCTION IF EXISTS request_mid_stay_cleaning(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS generate_invoice(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS validate_subscription_payment(UUID) CASCADE;
DROP FUNCTION IF EXISTS sync_subscription_statuses() CASCADE;
DROP FUNCTION IF EXISTS reactivate_tenant(UUID) CASCADE;
DROP FUNCTION IF EXISTS suspend_tenant(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS check_cleaning_alerts() CASCADE;
DROP FUNCTION IF EXISTS mark_no_show(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS cancel_booking(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS check_out_booking(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS check_in_booking(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS create_booking CASCADE;
DROP FUNCTION IF EXISTS check_double_booking CASCADE;
DROP FUNCTION IF EXISTS complete_cleaning_task(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS claim_cleaning_task(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS get_current_user_role() CASCADE;
DROP FUNCTION IF EXISTS get_current_user_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS is_tenant_locked(UUID) CASCADE;
DROP FUNCTION IF EXISTS generate_booking_code(UUID) CASCADE;
DROP FUNCTION IF EXISTS log_price_change() CASCADE;
DROP FUNCTION IF EXISTS update_booking_payment_status() CASCADE;
DROP FUNCTION IF EXISTS update_room_status_on_checkin() CASCADE;
DROP FUNCTION IF EXISTS create_cleaning_task_on_checkout() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Tables (CASCADE supprime aussi indexes, triggers, policies, constraints, RLS)
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS whatsapp_messages CASCADE;
DROP TABLE IF EXISTS client_sessions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS cleaning_tasks CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS accommodations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_payment_requests CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ----------------------------------------------------------------------------
-- 1. TYPES ÉNUMÉRÉS
-- ----------------------------------------------------------------------------

-- Rôles utilisateurs
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'super_admin',       -- Super Admin Séjoura
    'admin_residence',   -- Admin Résidence (propriétaire)
    'receptionniste',    -- Réceptionniste
    'menagere',          -- Ménagère
    'client'             -- Client (accès temporaire)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Statuts d'abonnement
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'trial',     -- Essai gratuit
    'active',    -- Actif (payé)
    'overdue',   -- En retard (soft lock)
    'suspended', -- Suspendu
    'cancelled'  -- Annulé
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Plans tarifaires
DO $$ BEGIN
  CREATE TYPE subscription_plan AS ENUM (
    'standard',   -- 15 000 FCFA/mois
    'enterprise'  -- 55 000 FCFA/mois
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Statuts de réservation
DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM (
    'confirmed',  -- Confirmée
    'cancelled',  -- Annulée
    'no_show',    -- No-show
    'checked_in', -- Client arrivé
    'checked_out' -- Client parti
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Statuts de chambre
DO $$ BEGIN
  CREATE TYPE room_status AS ENUM (
    'available',   -- Disponible
    'occupied',    -- Occupée
    'alert',       -- Alerte (dépassement de délai)
    'cleaning'     -- En nettoyage
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Statuts de tâche de ménage
DO $$ BEGIN
  CREATE TYPE cleaning_task_status AS ENUM (
    'pending',     -- En attente dans le pool
    'claimed',     -- Récupérée par une ménagère
    'in_progress', -- En cours de réalisation
    'done',        -- Terminée
    'expired'      -- Expirée
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Statuts de paiement
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM (
    'unpaid',     -- Non payé
    'partial',    -- Partiellement payé
    'paid',       -- Payé
    'refunded'    -- Remboursé
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Méthodes de paiement
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'cash',     -- Espèces
    'wave',     -- Wave
    'pi_spi',   -- PI-SPI
    'bank',     -- Virement bancaire
    'other'     -- Autre
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Catégories de dépense
DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Statuts de facture
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'draft',     -- Brouillon
    'sent',      -- Envoyée au client
    'paid',      -- Payée
    'partial',   -- Partiellement payée
    'cancelled'  -- Annulée
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
  -- Paiement semi-automatisé (lien Wave + validation Super Admin)
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('pending', 'active', 'expired')),
  subscription_end_date TIMESTAMPTZ,
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
-- 4b. TABLE: subscription_payment_requests (Traçabilité paiements manuels Wave)
-- Le gérant déclare son paiement via le lien Wave ; le Super Admin valide.
-- ----------------------------------------------------------------------------
CREATE TABLE subscription_payment_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL,                 -- 'essentiel' | 'entreprise'
  amount          INTEGER NOT NULL,              -- Montant en FCFA (XOF)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'validated', 'rejected')),
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at    TIMESTAMPTZ,
  sender_phone    TEXT,                 -- Numéro Wave expéditeur du paiement
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_payment_req_tenant ON subscription_payment_requests(tenant_id);
CREATE INDEX idx_sub_payment_req_status ON subscription_payment_requests(status);
CREATE INDEX idx_sub_payment_req_created ON subscription_payment_requests(created_at DESC);

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
  amenities       JSONB DEFAULT '[]'::jsonb, -- Liste des équipements (Commodités)
  surface_m2      DOUBLE PRECISION,        -- Superficie en m² (optionnel)
  is_listed_on_trouvetou BOOLEAN NOT NULL DEFAULT FALSE, -- Interrupteur Visibilité Trouvetou
  featured_images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], -- Photos diffusées sur Trouvetou
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Règle de sécurité : pas de diffusion Trouvetou sans au moins une photo
  CONSTRAINT chk_trouvetou_requires_photo
    CHECK (is_listed_on_trouvetou = FALSE OR cardinality(featured_images) > 0)
);

CREATE INDEX idx_room_types_accommodation ON room_types(accommodation_id);
CREATE INDEX idx_room_types_trouvetou_listed
  ON room_types(is_listed_on_trouvetou)
  WHERE (is_listed_on_trouvetou = TRUE);

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
-- 12b. TABLE: invoices (Factures PDF générées)
-- ----------------------------------------------------------------------------
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,              -- ex: F-2026-0001
  amount          INTEGER NOT NULL,           -- Sous-total HT (en FCFA)
  tax_amount      INTEGER NOT NULL DEFAULT 0, -- TVA (en FCFA)
  total_amount    INTEGER NOT NULL,           -- Total TTC (en FCFA)
  status          invoice_status NOT NULL DEFAULT 'draft',
  pdf_url         TEXT,                       -- URL vers le PDF dans Supabase Storage
  sent_at         TIMESTAMPTZ,                -- Date d'envoi au client
  sent_to         TEXT,                       -- Destinataire (email ou téléphone)
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_booking ON invoices(booking_id);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_created ON invoices(created_at);

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

CREATE TRIGGER trigger_sub_payment_req_updated BEFORE UPDATE ON subscription_payment_requests
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
ALTER TABLE subscription_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
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
-- 23b-bis. POLITIQUES RLS — subscription_payment_requests
-- ----------------------------------------------------------------------------
CREATE POLICY "sub_payment_req_select_super_admin" ON subscription_payment_requests
  FOR SELECT USING (is_super_admin());

CREATE POLICY "sub_payment_req_select_own" ON subscription_payment_requests
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "sub_payment_req_insert_admin" ON subscription_payment_requests
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

CREATE POLICY "sub_payment_req_update_super_admin" ON subscription_payment_requests
  FOR UPDATE USING (is_super_admin());

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
-- 23k-bis. POLITIQUES RLS — invoices
-- ----------------------------------------------------------------------------
CREATE POLICY "invoices_select_own" ON invoices
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

CREATE POLICY "invoices_select_super_admin" ON invoices
  FOR SELECT USING (is_super_admin());

CREATE POLICY "invoices_insert_own" ON invoices
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
  );

CREATE POLICY "invoices_update_own" ON invoices
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'receptionniste')
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
  p_base_price INTEGER,
  p_negotiated_price INTEGER,
  p_nights_count INTEGER,
  p_total_amount INTEGER,
  p_created_by UUID,
  p_check_in_time TIME DEFAULT '14:00',
  p_check_out_time TIME DEFAULT '11:00',
  p_number_of_guests INTEGER DEFAULT 1,
  p_special_requests TEXT DEFAULT NULL
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
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut suspendre un établissement';
  END IF;

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
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut réactiver un établissement';
  END IF;

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
-- 34a. FONCTION: Valider une demande de paiement d'abonnement (Super Admin)
-- Utilisée pour le flux semi-automatisé Wave : le gérant paie via le lien
-- Wave, notifie l'administrateur, puis le Super Admin valide manuellement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_subscription_payment(p_request_id UUID)
RETURNS subscription_payment_requests AS $$
DECLARE
  v_request subscription_payment_requests;
  v_subscription_id UUID;
  v_end_date TIMESTAMPTZ;
  v_admin_user_id UUID;
  v_tenant_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Seul le Super Admin peut valider un paiement d''abonnement';
  END IF;

  SELECT * INTO v_request
  FROM subscription_payment_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND: Demande de paiement introuvable ou déjà traitée';
  END IF;

  v_tenant_id := v_request.tenant_id;

  SELECT id INTO v_subscription_id
  FROM subscriptions
  WHERE tenant_id = v_tenant_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND: Aucun abonnement trouvé pour cet établissement';
  END IF;

  -- Date de fin : prolongation de 30 jours à compter d'aujourd'hui
  v_end_date := NOW() + INTERVAL '30 days';

  -- Activation de l'abonnement + déblocage des interrupteurs
  UPDATE subscriptions
  SET
    subscription_status   = 'active',
    subscription_end_date = v_end_date,
    status                = 'active',
    is_soft_locked        = FALSE,
    current_period_start  = NOW(),
    current_period_end    = v_end_date,
    plan                  = v_request.plan::subscription_plan,
    monthly_price         = v_request.amount,
    payment_method        = 'wave',
    last_payment_at       = NOW(),
    last_payment_amount   = v_request.amount
  WHERE id = v_subscription_id;

  -- Réactiver les utilisateurs de l'établissement le cas échéant
  UPDATE users SET is_active = TRUE WHERE tenant_id = v_tenant_id;

  -- Marquer la demande comme validée
  SELECT id INTO v_admin_user_id
  FROM users
  WHERE auth_user_id = auth.uid() AND role = 'super_admin'
  LIMIT 1;

  UPDATE subscription_payment_requests
  SET
    status       = 'validated',
    validated_by = v_admin_user_id,
    validated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  -- Notification pour le gérant de l'établissement
  INSERT INTO notifications (tenant_id, user_id, title, message, type, link)
  VALUES (
    v_tenant_id,
    NULL,
    'Abonnement activé',
    'Votre abonnement a été validé par l''administrateur. Merci pour votre paiement.',
    'success',
    '/dashboard/subscription'
  );

  RETURN v_request;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 34b. FONCTION: Marquer automatiquement les abonnements expirés
-- À appeler périodiquement (cron / edge function) pour passer les abonnements
-- dont la date de fin est dépassée en 'expired' (soft lock).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_subscription_statuses()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE subscriptions
  SET subscription_status = 'expired', is_soft_locked = TRUE
  WHERE subscription_status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 34b. FONCTION: Demander un ménage en cours de séjour (mid-stay cleaning)
-- Contrairement au check-out, la chambre reste 'occupied' (le client y est encore)
-- La tâche est créée avec une note d'avertissement pour les ménagères
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_mid_stay_cleaning(
  p_booking_id UUID,
  p_user_id UUID
)
RETURNS cleaning_tasks AS $$
DECLARE
  v_booking bookings;
  v_task cleaning_tasks;
BEGIN
  -- Récupérer la réservation (doit être checked_in)
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id AND status = 'checked_in'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_ACTIVE: Réservation introuvable ou client non arrivé';
  END IF;

  -- Créer la tâche de ménage SANS changer le statut de la chambre
  INSERT INTO cleaning_tasks (
    tenant_id, accommodation_id, room_id, booking_id,
    status, priority, notes,
    checkout_time, alert_time, force_release_time,
    created_at
  ) VALUES (
    v_booking.tenant_id,
    v_booking.accommodation_id,
    v_booking.room_id,
    v_booking.id,
    'pending',
    5, -- Priorité moyenne (moins urgente qu'un check-out qui est à 10)
    'Chambre occupée — vérifier avant d''entrer',
    NULL, -- Pas de checkout_time car c'est un ménage en cours de séjour
    NULL, -- Pas d'alerte basée sur le départ
    NULL, -- Pas de libération forcée
    NOW()
  )
  RETURNING * INTO v_task;

  -- Journal d'audit
  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (v_booking.tenant_id, p_user_id, 'mid_stay_cleaning_requested', 'booking', v_booking.id,
    jsonb_build_object('cleaning_task_id', v_task.id, 'note', 'Chambre occupée — vérifier avant d''entrer'), NOW());

  RETURN v_task;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 34c. FONCTION: Générer une facture pour une réservation
-- Crée un enregistrement de facture avec tous les montants calculés automatiquement.
-- Le PDF est généré côté application (API route) ; cette fonction prépare les données.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_invoice(
  p_booking_id UUID,
  p_user_id UUID,
  p_invoice_number TEXT
)
RETURNS invoices AS $$
DECLARE
  v_booking bookings;
  v_invoice invoices;
  v_tax integer := 0;
BEGIN
  -- Récupérer la réservation avec ses relations
  SELECT b.* INTO v_booking
  FROM bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Réservation introuvable';
  END IF;

  -- Vérifier que l'utilisateur appartient au même tenant
  IF v_booking.tenant_id != (
    SELECT tenant_id FROM users WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Vous n''êtes pas autorisé à générer une facture pour cette réservation';
  END IF;

  -- Calcul automatique des montants (sans calcul manuel)
  -- Le total est déjà calculé lors de la création de la réservation : total_amount = negotiated_price * nights_count
  -- On applique une TVA de 10 % (configurable)
  v_tax := ROUND(v_booking.total_amount * 0.10);

  -- Créer l'enregistrement de facture
  INSERT INTO invoices (
    tenant_id,
    booking_id,
    invoice_number,
    amount,
    tax_amount,
    total_amount,
    status,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_booking.tenant_id,
    v_booking.id,
    p_invoice_number,
    v_booking.total_amount,
    v_tax,
    v_booking.total_amount + v_tax,
    'draft',
    p_user_id,
    NOW(),
    NOW()
  )
  RETURNING * INTO v_invoice;

  -- Journal d'audit
  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values, created_at)
  VALUES (
    v_booking.tenant_id,
    p_user_id,
    'invoice_generated',
    'invoice',
    v_invoice.id,
    jsonb_build_object(
      'invoice_number', p_invoice_number,
      'booking_id', v_booking.id,
      'total_amount', v_booking.total_amount,
      'tax_amount', v_tax,
      'invoice_total', v_booking.total_amount + v_tax
    ),
    NOW()
  );

  RETURN v_invoice;
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
--   - 'room-photos'  : Photos des chambres diffusées sur Trouvetou

-- Politiques de storage (à exécuter après création des buckets)
-- Bucket 'logos': seul l'admin du tenant peut uploader son logo
-- Bucket 'id-photos': admin et réceptionniste peuvent uploader
-- Bucket 'receipts': admin peut uploader
-- Bucket 'invoices': généré par le système
-- Bucket 'avatars': l'utilisateur peut uploader son avatar

-- ----------------------------------------------------------------------------
-- FIN DU SCHÉMA
-- ----------------------------------------------------------------------------
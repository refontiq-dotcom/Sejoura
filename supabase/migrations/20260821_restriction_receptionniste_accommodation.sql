-- ============================================================================
-- Migration : restriction des réceptionnistes à leur résidence assignée
-- ============================================================================
-- Contexte : Actuellement, les politiques RLS filtrent par tenant_id
-- (entreprise) uniquement. Un réceptionniste pourrait techniquement accéder
-- aux données d'une autre résidence de la même entreprise.
--
-- Cette migration ajoute des politiques RESTREINTES qui limitent les
-- réceptionnistes aux données de leur accommodation_id assigné (depuis
-- la table users.accommodation_id).
--
-- Les admins résidence et super_admin ne sont PAS affectés : ils gardent
-- un accès complet à toutes les résidences de leur entreprise.
-- ============================================================================

-- 1. Supprimer les anciennes politiques permissives pour les réceptionnistes
--    sur les tables sensibles (bookings, payments, cleaning_tasks, rooms)

DROP POLICY IF EXISTS "bookings_select_own" ON bookings;
DROP POLICY IF EXISTS "bookings_insert_own" ON bookings;
DROP POLICY IF EXISTS "bookings_update_own" ON bookings;

DROP POLICY IF EXISTS "payments_select_own" ON payments;
DROP POLICY IF EXISTS "payments_insert_own" ON payments;

DROP POLICY IF EXISTS "cleaning_tasks_select_own" ON cleaning_tasks;

DROP POLICY IF EXISTS "rooms_select_own" ON rooms;

-- 2. Créer une fonction helper qui retourne l'accommodation_id assigné
--    de l'utilisateur courant (null pour les admins = accès à tout)

CREATE OR REPLACE FUNCTION get_user_assigned_accommodation_id()
RETURNS UUID AS $$
  SELECT accommodation_id FROM users WHERE id = get_current_user_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Politiques REPOSITIONNÉES — Admin résidence : accès complet au tenant

-- Bookings
CREATE POLICY "bookings_select_admin" ON bookings
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );

CREATE POLICY "bookings_insert_admin" ON bookings
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );

CREATE POLICY "bookings_update_admin" ON bookings
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );

-- Payments
CREATE POLICY "payments_select_admin" ON payments
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );

CREATE POLICY "payments_insert_admin" ON payments
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );

-- Cleaning tasks
CREATE POLICY "cleaning_tasks_select_admin" ON cleaning_tasks
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );

-- Rooms
CREATE POLICY "rooms_select_admin" ON rooms
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );

-- 4. Politiques RESTREINTES — Réceptionniste : accommodation_id assigné UNIQUEMENT

-- Bookings — réceptionniste voit UNIQUEMENT les bookings de sa résidence
CREATE POLICY "bookings_select_receptionniste" ON bookings
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

CREATE POLICY "bookings_insert_receptionniste" ON bookings
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

CREATE POLICY "bookings_update_receptionniste" ON bookings
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- Payments — réceptionniste voit UNIQUEMENT les paiements de sa résidence
CREATE POLICY "payments_select_receptionniste" ON payments
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

CREATE POLICY "payments_insert_receptionniste" ON payments
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- Cleaning tasks — réceptionniste voit UNIQUEMENT les tâches de sa résidence
CREATE POLICY "cleaning_tasks_select_receptionniste" ON cleaning_tasks
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- Rooms — réceptionniste voit UNIQUEMENT les chambres de sa résidence
CREATE POLICY "rooms_select_receptionniste" ON rooms
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- 5. Ménagère : même logique (restreinte à sa résidence assignée)

CREATE POLICY "bookings_select_menagere" ON bookings
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

CREATE POLICY "payments_select_menagere" ON payments
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

CREATE POLICY "cleaning_tasks_select_menagere" ON cleaning_tasks
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

CREATE POLICY "rooms_select_menagere" ON rooms
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

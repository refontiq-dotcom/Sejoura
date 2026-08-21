-- ============================================================================
-- MIGRATION : Restriction des réceptionnistes/ménagères à leur résidence
--
-- ⚠️ EXÉCUTER EN 4 PARTIES SÉPARÉES dans le SQL Editor de Supabase
--    (le SQL Editor tronque les très longues requêtes)
-- ============================================================================


-- ============================================================================
-- PARTIE 1 : Fonction helper
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_assigned_accommodation_id()
RETURNS UUID AS $$
  SELECT accommodation_id FROM users WHERE id = get_current_user_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================================
-- PARTIE 2 : Supprimer les anciennes politiques permissives
-- ============================================================================

-- Bookings
DROP POLICY IF EXISTS "bookings_select_own" ON bookings;
DROP POLICY IF EXISTS "bookings_insert_own" ON bookings;
DROP POLICY IF EXISTS "bookings_update_own" ON bookings;

-- Payments
DROP POLICY IF EXISTS "payments_select_own" ON payments;
DROP POLICY IF EXISTS "payments_insert_own" ON payments;

-- Cleaning tasks
DROP POLICY IF EXISTS "cleaning_tasks_select_own" ON cleaning_tasks;

-- Rooms (anciennes policies permissives)
DROP POLICY IF EXISTS "rooms_select_own" ON rooms;
DROP POLICY IF EXISTS "rooms_update_own" ON rooms;


-- ============================================================================
-- PARTIE 3 : Politiques Admin (accès complet au tenant)
-- ============================================================================

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

-- Rooms (pas de tenant_id → on passe par accommodations)
CREATE POLICY "rooms_select_admin" ON rooms
  FOR SELECT USING (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
    )
    AND get_current_user_role() IN ('admin_residence', 'super_admin')
  );


-- ============================================================================
-- PARTIE 4 : Politiques Réceptionniste (restreint à accommodation_id)
-- ============================================================================

-- Bookings
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

-- Payments
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

-- Cleaning tasks
CREATE POLICY "cleaning_tasks_select_receptionniste" ON cleaning_tasks
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- Rooms (pas de tenant_id → on passe par accommodations)
CREATE POLICY "rooms_select_receptionniste" ON rooms
  FOR SELECT USING (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
    )
    AND get_current_user_role() = 'receptionniste'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );


-- ============================================================================
-- PARTIE 5 : Politiques Ménagère (restreint à accommodation_id)
-- ============================================================================

-- Bookings (lecture seule)
CREATE POLICY "bookings_select_menagere" ON bookings
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- Payments (lecture seule)
CREATE POLICY "payments_select_menagere" ON payments
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- Cleaning tasks (lecture + update pour valider ses tâches)
CREATE POLICY "cleaning_tasks_select_menagere" ON cleaning_tasks
  FOR SELECT USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

-- Rooms (lecture seule, pas de tenant_id → passe par accommodations)
CREATE POLICY "rooms_select_menagere" ON rooms
  FOR SELECT USING (
    accommodation_id IN (
      SELECT id FROM accommodations
      WHERE tenant_id = get_current_user_tenant_id()
    )
    AND get_current_user_role() = 'menagere'
    AND accommodation_id = get_user_assigned_accommodation_id()
  );

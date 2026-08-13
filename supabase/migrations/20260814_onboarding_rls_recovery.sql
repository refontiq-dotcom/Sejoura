-- Onboarding : l'utilisateur authentifié peut toujours relire son profil et
-- l'établissement de son tenant. Les écritures de création restent exécutées
-- par la route serveur authentifiée (service_role) pour le premier tenant,
-- car aucun utilisateur sans tenant ne peut satisfaire une politique tenant.

DROP POLICY IF EXISTS "users_select_self" ON users;
CREATE POLICY "users_select_self" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "users_update_self" ON users;
CREATE POLICY "users_update_self" ON users
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "accommodations_select_own_tenant" ON accommodations;
CREATE POLICY "accommodations_select_own_tenant" ON accommodations
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "accommodations_insert_admin" ON accommodations;
CREATE POLICY "accommodations_insert_admin" ON accommodations
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "accommodations_update_admin" ON accommodations;
CREATE POLICY "accommodations_update_admin" ON accommodations
  FOR UPDATE
  USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  )
  WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

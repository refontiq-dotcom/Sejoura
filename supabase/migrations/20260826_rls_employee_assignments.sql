-- Migration : RLS pour employee_assignments
-- La table n'avait pas de politiques → 403 sur toutes les requêtes côté client.

-- 1. Activer RLS
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;

-- 2. Politique SELECT : les admins résidence voient les affectations de leur tenant
CREATE POLICY "employee_assignments_select_admin"
  ON employee_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = employee_assignments.user_id
        AND u.tenant_id = (
          SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
        )
    )
  );

-- 3. Politique SELECT : super admin voit tout
CREATE POLICY "employee_assignments_select_super_admin"
  ON employee_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'super_admin'
    )
  );

-- 4. Politique INSERT : les admins résidence peuvent créer des affectations
CREATE POLICY "employee_assignments_insert_admin"
  ON employee_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = employee_assignments.user_id
        AND u.tenant_id = (
          SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
        )
        AND u.role IN ('admin_residence', 'super_admin')
    )
  );

-- 5. Politique UPDATE : les admins résidence peuvent modifier les affectations
CREATE POLICY "employee_assignments_update_admin"
  ON employee_assignments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = employee_assignments.user_id
        AND u.tenant_id = (
          SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
        )
        AND u.role IN ('admin_residence', 'super_admin')
    )
  );

-- 6. Politique DELETE : les admins résidence peuvent supprimer des affectations
CREATE POLICY "employee_assignments_delete_admin"
  ON employee_assignments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = employee_assignments.user_id
        AND u.tenant_id = (
          SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
        )
        AND u.role IN ('admin_residence', 'super_admin')
    )
  );

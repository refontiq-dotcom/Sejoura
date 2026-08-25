-- Migration v2 : RLS simplifié pour employee_assignments
-- Utilise une approche directe sans sous-requête complexe.

-- Supprime les anciennes politiques si elles existent
DROP POLICY IF EXISTS "employee_assignments_select_admin" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_select_super_admin" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_insert_admin" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_update_admin" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_delete_admin" ON employee_assignments;

-- Activer RLS (idempotent)
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;

-- Politique SELECT : les utilisateurs authentifiés du même tenant peuvent lire
CREATE POLICY "employee_assignments_select"
  ON employee_assignments
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      -- Super admin : voit tout
      EXISTS (
        SELECT 1 FROM users
        WHERE auth_user_id = auth.uid() AND role = 'super_admin'
      )
      OR
      -- Admin résidence : voit les affectations de son tenant
      EXISTS (
        SELECT 1 FROM users eu
        WHERE eu.id = employee_assignments.user_id
          AND eu.tenant_id = (
            SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
          )
      )
    )
  );

-- Politique INSERT : admin résidence ou super admin
CREATE POLICY "employee_assignments_insert"
  ON employee_assignments
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM users
        WHERE auth_user_id = auth.uid() AND role = 'super_admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM users eu
        WHERE eu.id = employee_assignments.user_id
          AND eu.tenant_id = (
            SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
          )
          AND eu.role IN ('admin_residence', 'super_admin')
      )
    )
  );

-- Politique UPDATE : admin résidence ou super admin
CREATE POLICY "employee_assignments_update"
  ON employee_assignments
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM users
        WHERE auth_user_id = auth.uid() AND role = 'super_admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM users eu
        WHERE eu.id = employee_assignments.user_id
          AND eu.tenant_id = (
            SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
          )
          AND eu.role IN ('admin_residence', 'super_admin')
      )
    )
  );

-- Politique DELETE : admin résidence ou super admin
CREATE POLICY "employee_assignments_delete"
  ON employee_assignments
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM users
        WHERE auth_user_id = auth.uid() AND role = 'super_admin'
      )
      OR
      EXISTS (
        SELECT 1 FROM users eu
        WHERE eu.id = employee_assignments.user_id
          AND eu.tenant_id = (
            SELECT tenant_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1
          )
          AND eu.role IN ('admin_residence', 'super_admin')
      )
    )
  );

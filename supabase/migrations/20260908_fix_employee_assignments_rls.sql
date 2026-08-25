-- Correction RLS employee_assignments
-- Les politiques INSERT/UPDATE/DELETE vérifiaient le rôle de l'employé AFFECTÉ
-- (u.id = employee_assignments.user_id) au lieu du rôle de l'admin CONNECTÉ.
-- Résultat : un admin résidence ne pouvait réaffecter qu'un autre admin ;
-- toute réaffectation d'un réceptionniste / ménagère échouait côté client avec
-- « Impossible d'effectuer la réaffectation. »

-- Supprimer les anciennes politiques (noms v1 et v2)
DROP POLICY IF EXISTS "employee_assignments_insert_admin" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_update_admin" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_delete_admin" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_insert" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_update" ON employee_assignments;
DROP POLICY IF EXISTS "employee_assignments_delete" ON employee_assignments;

-- Politique INSERT : l'admin CONNECTÉ doit être admin_residence du même tenant
-- (ou super_admin), l'employé affecté et l'établissement de destination doivent
-- appartenir au même tenant que l'admin.
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
      (
        EXISTS (
          SELECT 1 FROM users admin_user
          WHERE admin_user.auth_user_id = auth.uid()
            AND admin_user.role = 'admin_residence'
        )
        AND EXISTS (
          SELECT 1 FROM users eu
          WHERE eu.id = employee_assignments.user_id
            AND eu.tenant_id = get_current_user_tenant_id()
        )
        AND EXISTS (
          SELECT 1 FROM accommodations a
          WHERE a.id = employee_assignments.accommodation_id
            AND a.tenant_id = get_current_user_tenant_id()
        )
      )
    )
  );

-- Politique UPDATE : même logique, avec vérification des nouvelles valeurs
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
      (
        EXISTS (
          SELECT 1 FROM users admin_user
          WHERE admin_user.auth_user_id = auth.uid()
            AND admin_user.role = 'admin_residence'
        )
        AND EXISTS (
          SELECT 1 FROM users eu
          WHERE eu.id = employee_assignments.user_id
            AND eu.tenant_id = get_current_user_tenant_id()
        )
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM users
        WHERE auth_user_id = auth.uid() AND role = 'super_admin'
      )
      OR
      (
        EXISTS (
          SELECT 1 FROM users admin_user
          WHERE admin_user.auth_user_id = auth.uid()
            AND admin_user.role = 'admin_residence'
        )
        AND EXISTS (
          SELECT 1 FROM users eu
          WHERE eu.id = employee_assignments.user_id
            AND eu.tenant_id = get_current_user_tenant_id()
        )
        AND EXISTS (
          SELECT 1 FROM accommodations a
          WHERE a.id = employee_assignments.accommodation_id
            AND a.tenant_id = get_current_user_tenant_id()
        )
      )
    )
  );

-- Politique DELETE : l'admin CONNECTÉ doit être admin_residence du même tenant
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
      (
        EXISTS (
          SELECT 1 FROM users admin_user
          WHERE admin_user.auth_user_id = auth.uid()
            AND admin_user.role = 'admin_residence'
        )
        AND EXISTS (
          SELECT 1 FROM users eu
          WHERE eu.id = employee_assignments.user_id
            AND eu.tenant_id = get_current_user_tenant_id()
        )
      )
    )
  );

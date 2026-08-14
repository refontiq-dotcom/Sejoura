-- ============================================================================
-- Migration : handle_new_user lie un profil existant au lieu de créer un doublon
-- ============================================================================
-- Problème :
--   Quand un employé (profil créé par l'employeur, auth_user_id NULL) définit
--   son code PIN, l'API POST /api/employee-pin crée un compte Auth via
--   admin.auth.admin.createUser(). Le trigger on_auth_user_created
--   (handle_new_user) insère alors un NOUVEAU profil dans public.users avec ce
--   même auth_user_id. La colonne auth_user_id étant UNIQUE, la mise à jour du
--   profil d'origine échoue ensuite en 500 (« Erreur lors de la sauvegarde du
--   PIN »).
--
-- Correctif :
--   1. Le trigger cherche d'abord un profil existant créé par l'employeur
--      (auth_user_id IS NULL) et le lie au nouveau compte Auth par
--      correspondance de téléphone ou d'email, au lieu d'insérer un doublon.
--   2. À défaut, comportement historique : insertion d'un nouveau profil.
--
-- Les doublons déjà présents en base sont supprimés à la fin : ce sont les
-- profils créés par l'ancien trigger, reconnaissables à l'absence de données
-- métier (tenant_id NULL, téléphone vide) et à l'email généré
-- (« @employe.sejoura.com »). Le profil d'origine (avec tenant_id et téléphone)
-- est conservé : il sera relié au compte Auth par l'API à la prochaine
-- connexion de l'employé (nettoyage idempotent intégré à /api/employee-pin).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_phone TEXT := NULLIF(NEW.raw_user_meta_data->>'phone', '');
  meta_role  TEXT := NEW.raw_user_meta_data->>'role';
BEGIN
  -- 1. Lier un profil existant (créé par l'employeur : auth_user_id NULL)
  --    au compte Auth créé, plutôt que d'insérer un doublon.
  UPDATE public.users
  SET auth_user_id = NEW.id,
      email        = COALESCE(public.users.email, NEW.email),
      is_active    = TRUE,
      updated_at   = NOW()
  WHERE auth_user_id IS NULL
    AND (
      (meta_phone IS NOT NULL AND phone = meta_phone)
      OR (
        NEW.email IS NOT NULL
        AND public.users.email IS NOT NULL
        AND lower(public.users.email) = lower(NEW.email)
      )
    );

  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- 2. Sinon, créer un nouveau profil (comportement historique).
  INSERT INTO public.users (auth_user_id, email, role, full_name, phone, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN meta_role IN ('super_admin', 'admin_residence', 'receptionniste', 'menagere', 'client')
      THEN meta_role::public.user_role
      ELSE 'client'::public.user_role
    END,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    COALESCE(meta_phone, ''),
    TRUE
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Supprimer les profils doublons créés par l'ancien trigger. Ciblage strict :
-- aucun rattachement métier (tenant_id NULL, téléphone vide) et email généré
-- du domaine dédié aux employés (jamais utilisé par les gérants/super_admin).
DELETE FROM public.users
WHERE auth_user_id IS NOT NULL
  AND tenant_id IS NULL
  AND phone = ''
  AND email LIKE '%@employe.sejoura.com';

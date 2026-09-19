-- Séjoura: Refontiq Control Center est l'unique Super Admin global.
--
-- Séjoura conserve le type historique super_admin pour compatibilité avec les
-- anciennes données/migrations, mais aucun compte local ne peut plus utiliser
-- ce rôle. L'administration globale est déplacée vers Refontiq Control Center.

-- 1. Désactiver les anciens comptes Super Admin locaux.
UPDATE public.users
SET
  role = 'client'::public.user_role,
  is_active = FALSE,
  updated_at = NOW()
WHERE role = 'super_admin'::public.user_role;

-- 2. Empêcher toute création/réactivation du rôle super_admin dans Séjoura.
CREATE OR REPLACE FUNCTION public.prevent_local_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'super_admin'::public.user_role THEN
    RAISE EXCEPTION
      'FORBIDDEN: le rôle super_admin est géré exclusivement par Refontiq Control Center';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_local_super_admin ON public.users;
CREATE TRIGGER prevent_local_super_admin
  BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_local_super_admin();

-- 3. Le trigger Auth ne doit plus accepter super_admin depuis les metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('admin_residence', 'receptionniste', 'menagere', 'client')
      THEN (NEW.raw_user_meta_data->>'role')::public.user_role
    ELSE 'client'::public.user_role
  END;

  INSERT INTO public.users (
    auth_user_id,
    email,
    role,
    full_name,
    phone,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    TRUE
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 4. Le rôle historique ne doit jamais être considéré comme une autorité
-- globale dans les futures sessions Séjoura.
COMMENT ON TYPE public.user_role IS
  'Séjoura roles. super_admin is legacy-only and forbidden for local accounts; global administration belongs to Refontiq Control Center.';

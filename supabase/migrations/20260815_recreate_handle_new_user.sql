-- Recréer public.handle_new_user() : la version d'origine insérait dans
-- public.profiles (ancien prototype, absent des migrations) et a été supprimée
-- par le reset du schéma public. Résultat : chaque INSERT dans auth.users
-- déclenchait le trigger on_auth_user_created vers une table inexistante et
-- échouait en 500 côté GoTrue (auth/v1/signup).
--
-- On recrée la fonction en synchronisant vers public.users (schéma actuel),
-- avec des valeurs par défaut sûres : role issu des métadonnées (défaut
-- 'client'), is_active TRUE pour ne pas bloquer le nouvel inscrit au niveau du
-- middleware, full_name replié sur l'email, phone vide. La création du profil
-- complet (tenant, établissement) reste faite par /api/register à l'étape 2.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (auth_user_id, email, role, full_name, phone, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('super_admin', 'admin_residence', 'receptionniste', 'menagere', 'client')
      THEN (NEW.raw_user_meta_data->>'role')::public.user_role
      ELSE 'client'::public.user_role
    END,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    TRUE
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

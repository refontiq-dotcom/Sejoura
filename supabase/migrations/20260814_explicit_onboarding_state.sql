-- État explicite d'onboarding : ne jamais l'inférer d'une relation métier.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.onboarding_completed IS
  'TRUE uniquement après création complète du tenant, de l''abonnement et du premier établissement.';

-- Migration des comptes finalisés avant l'ajout de ce champ.
UPDATE users u
SET onboarding_completed = TRUE
WHERE u.role = 'admin_residence'
  AND u.tenant_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM accommodations a WHERE a.tenant_id = u.tenant_id);

-- Les rôles sans onboarding propriétaire ne doivent jamais être redirigés.
UPDATE users
SET onboarding_completed = TRUE
WHERE role IN ('super_admin', 'receptionniste', 'menagere', 'client');

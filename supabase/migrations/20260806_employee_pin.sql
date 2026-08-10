-- ============================================================================
-- Migration : Ajout code PIN employé et flag first_login
-- Table cible : users
-- ============================================================================

-- 1. Ajouter le champ pin_code (stocké hashé côté API)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_code TEXT DEFAULT NULL;

-- 2. Ajouter le flag first_login
--    true  = l'employé n'a pas encore défini son code secret (première connexion)
--    false = l'employé est initialisé, il peut se connecter avec son PIN
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_login BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Index pour recherche par téléphone avec PIN défini
CREATE INDEX IF NOT EXISTS idx_users_phone_pin ON users(phone) WHERE pin_code IS NOT NULL;

-- 4. Commentaires pour documentation
COMMENT ON COLUMN users.pin_code IS 'Hash bcrypt du code PIN à 4 chiffres défini par l''employé lors de sa première connexion. NULL = PIN non encore défini.';
COMMENT ON COLUMN users.first_login IS 'true si l''employé n''a pas encore défini son code PIN. Passe à false après la première définition du PIN.';

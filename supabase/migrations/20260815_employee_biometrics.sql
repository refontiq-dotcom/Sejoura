-- ============================================================================
-- Authentification biométrique des employés (WebAuthn / Passkeys)
--
-- Tables :
--   user_passkeys       : Credentials WebAuthn enregistrés par un employé
--   passkey_challenges  : Challenges à usage unique (anti rejeu)
--
-- Accès : service_role uniquement (API routes /api/employee-biometric/*).
-- RLS activée sans politiques publiques : l'anon key ne peut rien lire/écrire.
-- ============================================================================

-- ── Table : user_passkeys ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_passkeys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    TEXT NOT NULL,
  sign_count    BIGINT NOT NULL DEFAULT 0,
  transports    JSONB,
  device_name   TEXT NOT NULL DEFAULT 'Appareil inconnu',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user ON user_passkeys(user_id);

-- ── Table : passkey_challenges ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passkey_challenges (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge  TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user ON passkey_challenges(user_id, kind);

-- ── RLS : activée, mais aucune politique publique (service_role bypass) ──────
ALTER TABLE user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey_challenges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_passkeys IS
  'Credentials WebAuthn (Face ID / Empreinte) enregistrés par les employés. Accès réservé au service_role.';
COMMENT ON TABLE passkey_challenges IS
  'Challenges WebAuthn à usage unique, expirant après 5 minutes. Accès réservé au service_role.';

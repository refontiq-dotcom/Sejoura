-- ============================================================================
-- Migration : Boîte à idées & Roadmap participative
-- Date : 2026-08-16
--
-- Les clients soumettent des suggestions (fonctionnalité, amélioration, bug),
-- votent (upvote) sur les idées des autres et suivent le statut de la roadmap
-- (en cours d'étude → planifié → en développement → disponible).
-- Les idées sont GLOBALES : tous les clients voient les suggestions des autres
-- afin d'éviter les doublons et de prioriser par nombre de votes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTIE 1 : Table des suggestions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description     TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  category        TEXT NOT NULL CHECK (category IN ('new_feature', 'page_improvement', 'bug_report')),
  impact          TEXT NOT NULL CHECK (impact IN ('essential', 'nice_to_have')),
  screenshot_url  TEXT,
  status          TEXT NOT NULL DEFAULT 'under_review'
                    CHECK (status IN ('under_review', 'planned', 'in_development', 'shipped')),
  hidden          BOOLEAN NOT NULL DEFAULT false,
  upvotes         INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_tenant ON feature_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_hidden ON feature_requests(hidden);
CREATE INDEX IF NOT EXISTS idx_feature_requests_upvotes ON feature_requests(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created_at ON feature_requests(created_at DESC);

COMMENT ON TABLE feature_requests IS 'Suggestions des clients (boîte à idées). Globales : visibles par tous les tenants. Les suggestions masquées (hidden = true) par l''équipe produit ne sont pas visibles des clients.';
COMMENT ON COLUMN feature_requests.status IS 'under_review = en cours d''étude, planned = planifié, in_development = en développement, shipped = disponible';
COMMENT ON COLUMN feature_requests.hidden IS 'true = suggestion masquée (doublon, hors-sujet) par l''équipe produit. Visible uniquement des super admins.';

-- Trigger updated_at
DROP TRIGGER IF EXISTS trigger_feature_requests_updated ON feature_requests;
CREATE TRIGGER trigger_feature_requests_updated
  BEFORE UPDATE ON feature_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- PARTIE 2 : Table des votes (1 vote par utilisateur et par idée)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_request_votes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (feature_request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_request_votes_feature ON feature_request_votes(feature_request_id);
CREATE INDEX IF NOT EXISTS idx_feature_request_votes_user ON feature_request_votes(user_id);

-- ----------------------------------------------------------------------------
-- PARTIE 3 : Synchronisation du compteur de votes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_feature_request_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE feature_requests SET upvotes = upvotes + 1 WHERE id = NEW.feature_request_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE feature_requests SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.feature_request_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_feature_request_upvotes ON feature_request_votes;
CREATE TRIGGER trigger_sync_feature_request_upvotes
  AFTER INSERT OR DELETE ON feature_request_votes
  FOR EACH ROW EXECUTE FUNCTION sync_feature_request_upvotes();

-- ----------------------------------------------------------------------------
-- PARTIE 4 : ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_request_votes ENABLE ROW LEVEL SECURITY;

-- SELECT : toute personne authentifiée (roadmap globale), hors suggestions
-- masquées (hidden = true) qui ne sont visibles que de l'équipe produit.
CREATE POLICY "feature_requests_select_auth" ON feature_requests
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (NOT hidden OR is_super_admin())
  );

-- INSERT : un utilisateur authentifié rattaché à un tenant, pour son propre compte
CREATE POLICY "feature_requests_insert_auth" ON feature_requests
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND created_by IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- UPDATE / DELETE : réservé à l'équipe produit (Super Admin) pour les statuts
CREATE POLICY "feature_requests_update_super_admin" ON feature_requests
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "feature_requests_delete_super_admin" ON feature_requests
  FOR DELETE USING (is_super_admin());

-- Votes : SELECT pour toute personne authentifiée (comptage et état de vote)
CREATE POLICY "feature_request_votes_select_auth" ON feature_request_votes
  FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT : l'utilisateur vote pour lui-même et ne peut pas voter sur sa propre idée
-- (l'unicité est garantie par la contrainte UNIQUE)
CREATE POLICY "feature_request_votes_insert_auth" ON feature_request_votes
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM feature_requests fr
      WHERE fr.id = feature_request_id
        AND fr.created_by != user_id
    )
  );

-- DELETE : un utilisateur peut retirer uniquement son propre vote
CREATE POLICY "feature_request_votes_delete_own" ON feature_request_votes
  FOR DELETE USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- PARTIE 5 : Temps réel (upvotes et statuts en direct)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feature_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_requests;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PARTIE 6 : Bucket storage des captures d'écran
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('feature-screenshots', 'feature-screenshots', true)
ON CONFLICT (id) DO NOTHING;

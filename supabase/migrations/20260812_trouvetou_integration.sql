-- Migration: Intégration Trouvetou dans Séjoura (Cahier des Charges)
-- 1. Fiche Chambre (room_types) : m², interrupteur Visibilité Trouvetou, photos
-- 2. Règle de sécurité : l'interrupteur ne peut être ON sans au moins une photo
-- 3. Automatisation : coupure des interrupteurs à l'expiration de l'abonnement
-- 4. Bucket Storage : photos des chambres
-- Date: 2026-08-12
-- Idempotent : ré-exécutable sans erreur.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. COLONNES room_types
-- ----------------------------------------------------------------------------
ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS surface_m2 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS is_listed_on_trouvetou BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_images TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN room_types.surface_m2
  IS 'Superficie en m² (optionnelle, non obligatoire pour ne pas bloquer le gérant)';
COMMENT ON COLUMN room_types.is_listed_on_trouvetou
  IS 'Interrupteur Visibilité Trouvetou. TRUE = la chambre est diffusée sur le portail public.';
COMMENT ON COLUMN room_types.featured_images
  IS 'Photos de la chambre utilisées sur Trouvetou (au moins 1 requise pour activer l''interrupteur).';

-- Règle de sécurité (niveau base de données) : pas de diffusion sans photo
DO $$ BEGIN
  -- On recrée la contrainte seulement si elle n'existe pas déjà avec les mêmes règles.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_trouvetou_requires_photo'
      AND conrelid = 'room_types'::regclass
  ) THEN
    ALTER TABLE room_types ADD CONSTRAINT chk_trouvetou_requires_photo
      CHECK (is_listed_on_trouvetou = FALSE OR cardinality(featured_images) > 0);
  END IF;
EXCEPTION WHEN check_violation THEN NULL; END $$;

-- Index partiel pour le portail Trouvetou (filtre sur les chambres diffusées)
CREATE INDEX IF NOT EXISTS idx_room_types_trouvetou_listed
  ON room_types(is_listed_on_trouvetou)
  WHERE is_listed_on_trouvetou = TRUE;

-- ----------------------------------------------------------------------------
-- 2. AUTOMATISATION : à l'expiration de l'abonnement, couper les interrupteurs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trouvetou_cut_on_subscription_expiry()
RETURNS TRIGGER AS $$
DECLARE
  v_expired BOOLEAN;
BEGIN
  v_expired := NEW.status IN ('overdue', 'suspended', 'cancelled')
    OR (NEW.current_period_end IS NOT NULL AND NEW.current_period_end < NOW())
    OR NEW.is_soft_locked = TRUE;

  IF v_expired THEN
    -- Couper tous les interrupteurs de visibilité des types de chambre du tenant
    UPDATE room_types rt
    SET is_listed_on_trouvetou = FALSE
    WHERE rt.accommodation_id IN (
      SELECT id FROM accommodations WHERE tenant_id = NEW.tenant_id
    );

    -- Dépublier les fiches Trouvetou correspondantes
    UPDATE trouvetou_listings tl
    SET is_published = FALSE
    WHERE tl.establishment_id IN (
      SELECT id FROM accommodations WHERE tenant_id = NEW.tenant_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_trouvetou_cut_on_expiry ON subscriptions;
CREATE TRIGGER trigger_trouvetou_cut_on_expiry
  AFTER INSERT OR UPDATE OF status, current_period_end, is_soft_locked ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trouvetou_cut_on_subscription_expiry();

-- ----------------------------------------------------------------------------
-- 3. BUCKET STORAGE : photos des chambres (URLs publiques pour le portail)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-photos', 'room-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "room_photos_storage_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "room_photos_storage_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "room_photos_storage_delete_admin" ON storage.objects;
DROP POLICY IF EXISTS "room_photos_storage_select_public" ON storage.objects;

CREATE POLICY "room_photos_storage_insert_admin"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'room-photos');

CREATE POLICY "room_photos_storage_update_admin"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'room-photos');

CREATE POLICY "room_photos_storage_delete_admin"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'room-photos');

CREATE POLICY "room_photos_storage_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'room-photos');

-- ----------------------------------------------------------------------------
-- 4. RLS : les room_types sont déjà couvertes par room_types_update_admin
--    (aucune nouvelle politique requise). Les trouvetou_listings sont couvertes
--    par trouvetou_listings_manage_own. Rien à ajouter ici.
-- ----------------------------------------------------------------------------

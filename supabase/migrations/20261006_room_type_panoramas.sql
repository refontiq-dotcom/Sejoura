-- =============================================================================
-- Migration : Visites 360° (panoramas équirectangulaires) par type de chambre
-- =============================================================================
-- Date        : 2026-10-06
-- Idempotente : oui (IF NOT EXISTS / DROP IF EXISTS partout)
-- Non destructive : aucune donnée existante n'est supprimée ni modifiée.
--
-- CONTEXTE
--   `room_types` ne possède aujourd'hui qu'une colonne média réelle :
--   `featured_images TEXT[]` (photos classiques, max 4). La colonne
--   `panorama_tour JSONB` existe depuis 20260927003000 mais décrit une visite
--   multi-scènes (1 à 12 scènes + startSceneId) : ce n'est PAS un enregistrement
--   média. Elle ne peut donc pas porter un identifiant stable, une clé de
--   stockage, un statut de validation ni des dimensions. D'où cette table.
--
--   ATTENTION — bug préexistant corrigé par le même chantier :
--   `src/lib/trouvetou/sync.ts` sélectionnait quatre colonnes
--   (panorama_360_url, panorama_360_preview_url, panorama_360_mobile_url,
--   panorama_360_hd_url) qui n'ont JAMAIS été créées par une migration. Cette
--   sélection renvoyait PostgREST 42703 et faisait échouer toute la
--   synchronisation Trouvetou. Aucune de ces colonnes n'est recréée ici : le
--   panorama est envoyé via `attributes.panoramas[]`, forme déjà comprise par
--   l'ingestion Trouvetou existante.
--
-- MACHINE D'ÉTAT
--   uploaded ──► validated ──► published
--      │             │
--      └─────────────┴──► rejected        (un fichier rejeté n'est jamais public)
--   published ──► superseded               (remplacement : l'ancien est retiré
--                                           APRÈS publication du nouveau)
--
--   `status` est un TEXT + CHECK plutôt qu'un ENUM PostgreSQL : ajouter un état
--   plus tard ne demande pas un ALTER TYPE, et le CHECK reste rejouable
--   (DROP IF EXISTS + ADD), donc la migration reste idempotente.
--
-- INTÉGRITÉ MULTI-TENANT
--   Deux clés étrangères composites garantissent au niveau base qu'un panorama
--   ne peut être rattaché qu'à l'établissement de son type de chambre, et que
--   son `tenant_id` est bien celui de cet établissement :
--     (room_type_id, accommodation_id) -> room_types(id, accommodation_id)
--     (accommodation_id, tenant_id)   -> accommodations(id, tenant_id)
--   Substituer un id par celui d'un autre tenant viole donc la FK : l'attaque
--   est bloquée par PostgreSQL, pas seulement par l'API.
--
-- RATIO 2:1
--   La contrainte `chk_room_type_panoramas_ratio` reproduit EXACTEMENT la règle
--   appliquée par l'ingestion Trouvetou (`|width/height - 2| <= 0.02`) :
--       198 * height <= 100 * width <= 202 * height
--   Rien d'invalide ne peut donc atteindre Trouvetou, qui le refuserait.
--
-- CE QUE LA VALIDATION NE PEUT PAS PROUVER
--   Le système vérifie qu'un fichier respecte les caractéristiques techniques
--   attendues d'un panorama équirectangulaire (format réel, ratio 2:1,
--   résolution, décodage intégral). Il ne peut PAS prouver mathématiquement que
--   l'image provient réellement d'une caméra 360° : une image plate recadrée en
--   2:1 passerait tous ces contrôles. Aucune décision de ce fichier ne prétend
--   le contraire.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Cibles des clés étrangères composites
--    (id) est déjà clé primaire : ajouter (id, tenant_id) / (id, accommodation_id)
--    crée une unicité plus large, donc toujours satisfaite par les lignes
--    existantes. Aucun UPDATE, aucune réécriture de table.

-- -----------------------------------------------------------------------------
-- 2. Table des panoramas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_type_panoramas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rattachement (garanti composite, cf. section INTÉGRITÉ MULTI-TENANT)
  room_type_id      UUID NOT NULL,
  accommodation_id  UUID NOT NULL,
  tenant_id         UUID NOT NULL,

  -- Identité du média : stable entre deux synchronisations Trouvetou
  media_type        TEXT NOT NULL DEFAULT 'photo_360',
  projection        TEXT NOT NULL DEFAULT 'equirectangular_2_1',

  -- Stockage
  storage_driver    TEXT NOT NULL DEFAULT 'supabase',
  storage_bucket    TEXT NOT NULL,
  storage_key       TEXT NOT NULL,
  public_url        TEXT NOT NULL,
  content_type      TEXT NOT NULL,
  byte_size         BIGINT NOT NULL,
  original_filename TEXT,

  -- Dimensions mesurées sur les BYTES RÉELS du fichier, jamais sur le nom du
  -- fichier ni sur le MIME déclaré par le navigateur.
  width             INTEGER NOT NULL,
  height            INTEGER NOT NULL,

  -- Métadonnées de validation
  status            TEXT NOT NULL DEFAULT 'uploaded',
  validation_error  TEXT,
  -- Indicateur NON BLOQUANT de continuité de jointure (0-255, plus bas = mieux).
  -- Un panorama reste publiable même avec une couture imparfaitement raccordée :
  -- c'est un défaut de qualité, pas un motif de rejet.
  seam_delta        DOUBLE PRECISION,
  validated_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  superseded_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT room_type_panoramas_room_type_fkey
    FOREIGN KEY (room_type_id, accommodation_id)
    REFERENCES public.room_types (id, accommodation_id)
    ON DELETE CASCADE,

  CONSTRAINT room_type_panoramas_accommodation_fkey
    FOREIGN KEY (accommodation_id, tenant_id)
    REFERENCES public.accommodations (id, tenant_id)
    ON DELETE CASCADE,

  -- Type de média : un panorama reste un panorama, jamais une photo classique.
  CONSTRAINT chk_room_type_panoramas_media_type
    CHECK (media_type = 'photo_360'),

  -- Projection : seule la projection équirectangulaire 2:1 est gérée.
  CONSTRAINT chk_room_type_panoramas_projection
    CHECK (projection = 'equirectangular_2_1'),

  -- Machine d'état (cf. schéma en tête de fichier)
  CONSTRAINT chk_room_type_panoramas_status
    CHECK (status IN ('uploaded', 'validated', 'published', 'rejected', 'superseded')),

  -- Cohérence des horodatages avec le statut
  CONSTRAINT chk_room_type_panoramas_timestamps
    CHECK (
      (status IN ('validated', 'published', 'superseded')) = (validated_at IS NOT NULL)
    ),

  -- Les contraintes dimensionnelles ne valent que pour un média RÉELLEMENT
  -- exploitable. Les statuts 'uploaded' et 'rejected' sont volontairement
  -- exemptés : ils décrivent un fichier encore non validé ou explicitement
  -- refusé, dont les dimensions n'ont pas à respecter le ratio. Dans le flux
  -- actuel, la validation précède l'écriture : un fichier invalide n'est ni
  -- stocké ni inséré. Ces deux statuts subsistent pour les transitions
  -- ultérieures (revalidation, modération d'une visite déjà publiée).
  --
  -- Ratio 2:1, tolérance identique à celle de l'ingestion Trouvetou
  CONSTRAINT chk_room_type_panoramas_ratio
    CHECK (
      status IN ('uploaded', 'rejected')
      OR (100 * width BETWEEN 198 * height AND 202 * height)
    ),

  -- Résolution minimale : en dessous, la visionneuse 360° devient illisible
  CONSTRAINT chk_room_type_panoramas_min_resolution
    CHECK (
      status IN ('uploaded', 'rejected')
      OR (width >= 3000 AND height >= 1500)
    ),

  -- Bornes de taille et de dimensions
  CONSTRAINT chk_room_type_panoramas_size
    CHECK (byte_size > 0),
  CONSTRAINT chk_room_type_panoramas_dimensions
    CHECK (width > 0 AND height > 0 AND width <= 20000 AND height <= 10000),

  -- Un fichier rejeté conserve la raison du refus
  CONSTRAINT chk_room_type_panoramas_rejected_reason
    CHECK (status <> 'rejected' OR validation_error IS NOT NULL),

  -- L'indicateur de couture est un écart de niveaux 0-255
  CONSTRAINT chk_room_type_panoramas_seam_delta
    CHECK (seam_delta IS NULL OR (seam_delta >= 0 AND seam_delta <= 255))
);

-- -----------------------------------------------------------------------------
ALTER TABLE public.accommodations
  DROP CONSTRAINT IF EXISTS accommodations_id_tenant_key;
ALTER TABLE public.accommodations
  ADD CONSTRAINT accommodations_id_tenant_key UNIQUE (id, tenant_id);

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_id_accommodation_key;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_id_accommodation_key UNIQUE (id, accommodation_id);

COMMENT ON TABLE public.room_type_panoramas IS
  'Visites 360° (panoramas équirectangulaires 2:1) des types de chambre. '
  'Un seul panorama publié par type de chambre. Publié vers Trouvetou via '
  'attributes.panoramas, jamais dans images.';

COMMENT ON COLUMN public.room_type_panoramas.status IS
  'Machine d''état : uploaded -> validated -> published ; uploaded|validated -> rejected ; published -> superseded.';
COMMENT ON COLUMN public.room_type_panoramas.projection IS
  'Projection géométrique. Seule ''equirectangular_2_1'' est acceptée (identique à Trouvetou).';
COMMENT ON COLUMN public.room_type_panoramas.media_type IS
  'Toujours ''photo_360''. Interdit de dégrader un panorama en photo classique.';

-- -----------------------------------------------------------------------------
-- 3. Index
-- -----------------------------------------------------------------------------
-- Liste des panoramas d'un type de chambre (écran « Visite 360° »)
CREATE INDEX IF NOT EXISTS idx_room_type_panoramas_room_type
  ON public.room_type_panoramas (room_type_id, created_at DESC);

-- Sélection à la publication : panoramas publiés du tenant
CREATE INDEX IF NOT EXISTS idx_room_type_panoramas_published
  ON public.room_type_panoramas (tenant_id)
  WHERE status = 'published';

-- Invariant métier : UNE seule visite 360° publiée par type de chambre.
-- C'est aussi la garantie de ne pas publier deux fois le même panorama.
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_type_panoramas_one_published
  ON public.room_type_panoramas (room_type_id)
  WHERE status = 'published';

-- Nettoyage des panoramas rejetés (jamais publiables, absents du payload)
CREATE INDEX IF NOT EXISTS idx_room_type_panoramas_rejected
  ON public.room_type_panoramas (created_at)
  WHERE status = 'rejected';

-- -----------------------------------------------------------------------------
-- 4. Trigger updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_room_type_panoramas_updated ON public.room_type_panoramas;
CREATE TRIGGER trigger_room_type_panoramas_updated
  BEFORE UPDATE ON public.room_type_panoramas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 5. RLS
--    Les routes API utilisent le client service_role (RLS contourné) : ces
--    politiques protègent les accès directs via le client navigateur/anon, qui
--    constituent le vrai périmètre d'attaque. Elles reprennent le modèle des
--    tables `accommodations` / `room_types`.
-- -----------------------------------------------------------------------------
ALTER TABLE public.room_type_panoramas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_type_panoramas_select_super_admin" ON public.room_type_panoramas;
CREATE POLICY "room_type_panoramas_select_super_admin" ON public.room_type_panoramas
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS "room_type_panoramas_select_own_tenant" ON public.room_type_panoramas;
CREATE POLICY "room_type_panoramas_select_own_tenant" ON public.room_type_panoramas
  FOR SELECT USING (tenant_id = get_current_user_tenant_id());

DROP POLICY IF EXISTS "room_type_panoramas_insert_admin" ON public.room_type_panoramas;
CREATE POLICY "room_type_panoramas_insert_admin" ON public.room_type_panoramas
  FOR INSERT WITH CHECK (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "room_type_panoramas_update_admin" ON public.room_type_panoramas;
CREATE POLICY "room_type_panoramas_update_admin" ON public.room_type_panoramas
  FOR UPDATE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

DROP POLICY IF EXISTS "room_type_panoramas_delete_admin" ON public.room_type_panoramas;
CREATE POLICY "room_type_panoramas_delete_admin" ON public.room_type_panoramas
  FOR DELETE USING (
    tenant_id = get_current_user_tenant_id()
    AND get_current_user_role() = 'admin_residence'
  );

-- -----------------------------------------------------------------------------
-- 6. Ce que cette migration NE fait PAS
-- -----------------------------------------------------------------------------
--   * Elle ne supprime PAS `room_types.panorama_tour` : cette colonne existe en
--     production et reste transmise telle quelle dans attributes.panorama_tour.
--   * Elle ne touche PAS aux photos classiques (`featured_images`) ni à la règle
--     « au moins une photo pour activer la diffusion Trouvetou »
--     (chk_trouvetou_requires_photo) : un panorama ne satisfait PAS cette règle,
--     une annonce sans photo classique reste donc non publiable, comme avant.
--   * Elle ne crée aucun bucket : le bucket `room-photos` existant est réutilisé,
--     les panoramas vivant sous le préfixe de clé `panoramas/`.
-- =============================================================================


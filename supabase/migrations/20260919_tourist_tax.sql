-- ============================================================================
-- Migration : Taxe de nuitée (annexe fiscale 2026)
-- Date      : 2026-09-19
-- ============================================================================
-- Contexte : depuis le 5 janvier 2026, les clients des hôtels et résidences
-- meublées de Côte d'Ivoire doivent s'acquitter d'une "taxe de nuitée"
-- collectée par l'établissement et reversée à la mairie avant le 15 du mois
-- suivant. Barème légal (informatif, non appliqué automatiquement — le tarif
-- exact dépend de la taille de la commune / du classement, que seul le
-- gérant connaît avec certitude) :
--   Résidences meublées : 500 FCFA/nuitée (commune ≤ 20 000 habitants)
--                          1000 FCFA/nuitée (commune > 20 000 hab. ou
--                          District autonome d'Abidjan)
--   Hôtels : 500 FCFA (sans étoile) / 1000 FCFA (1 étoile) /
--            1500 FCFA (2 étoiles) / 2000 FCFA (3 étoiles et plus)
--
-- Cette taxe est collectée POUR le compte de la mairie — elle ne doit jamais
-- être comptée comme un revenu de l'établissement (bénéfice net, exports
-- comptables). Elle est donc stockée séparément à chaque réservation, pas
-- fondue dans negotiated_price / total_amount.
-- ============================================================================

-- ── 1. Configuration par établissement ──────────────────────────────────────
ALTER TABLE accommodations
  ADD COLUMN IF NOT EXISTS tourist_tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tourist_tax_rate INTEGER; -- FCFA par nuitée par occupant, configuré par le gérant

ALTER TABLE accommodations
  ADD CONSTRAINT chk_tourist_tax_rate_positive CHECK (tourist_tax_rate IS NULL OR tourist_tax_rate >= 0);

COMMENT ON COLUMN accommodations.tourist_tax_rate
  IS 'Tarif de la taxe de nuitée en FCFA, par nuitée et par occupant, configuré par le gérant selon sa commune (voir barème légal en tête de migration).';

-- ── 2. Montant figé par réservation ──────────────────────────────────────────
-- Calculé et stocké au moment de la réservation (nights_count × guests ×
-- tourist_tax_rate), pour rester stable même si le tarif de l'établissement
-- change ensuite, et pour rester éditable si le gérant doit l'ajuster.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tourist_tax_amount INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bookings
  ADD CONSTRAINT chk_tourist_tax_amount_positive CHECK (tourist_tax_amount >= 0);

COMMENT ON COLUMN bookings.tourist_tax_amount
  IS 'Taxe de nuitée collectée pour cette réservation (FCFA), à reverser à la mairie. Exclue du calcul de bénéfice net.';

CREATE INDEX IF NOT EXISTS idx_bookings_tourist_tax
  ON bookings(tenant_id, check_in_date)
  WHERE tourist_tax_amount > 0;

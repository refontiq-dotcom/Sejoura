-- Migration: Permettre les opérations manuelles de caisse (sans réservation)
-- Date: 2026-08-07

-- 1. Rendre booking_id optionnel dans payments pour les opérations manuelles
ALTER TABLE payments
  ALTER COLUMN booking_id DROP NOT NULL;

-- 2. Ajouter accommodation_id pour filtrer par shift/résidence
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS accommodation_id UUID REFERENCES accommodations(id) ON DELETE SET NULL;

-- 3. Ajouter type d'opération (réservation, entrée manuelle, sortie manuelle)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'booking';
  -- 'booking' = paiement lié à une réservation
  -- 'manual_in' = entrée manuelle de caisse
  -- 'manual_out' = sortie manuelle de caisse

-- 4. Ajouter index sur accommodation_id pour les requêtes shift
CREATE INDEX IF NOT EXISTS idx_payments_accommodation ON payments(accommodation_id);

-- 5. Mettre à jour les enregistrements existants
UPDATE payments p
SET accommodation_id = b.accommodation_id
FROM bookings b
WHERE p.booking_id = b.id
  AND p.accommodation_id IS NULL;

-- 6. Backfill operation_type
UPDATE payments SET operation_type = 'booking' WHERE booking_id IS NOT NULL;

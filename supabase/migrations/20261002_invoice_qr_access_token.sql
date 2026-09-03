-- Migration: QR Code de téléchargement sur les factures
-- Date: 2026-10-02
--
-- Ajoute un jeton d'accès public unique et imprévisible par facture, permettant
-- au client de télécharger son PDF de facture en scannant un QR Code imprimé
-- sur le document, sans avoir besoin de se connecter à l'application.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS access_token TEXT;

-- Index unique sur le token pour des lookups performants (et empêcher les doublons).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_access_token
  ON invoices (access_token)
  WHERE access_token IS NOT NULL;

-- Backfill : génère un token pour les factures existantes qui n'en ont pas,
-- afin que le QR Code puisse être ajouté rétroactivement.
UPDATE invoices
  SET access_token = encode(gen_random_bytes(24), 'hex')
  WHERE access_token IS NULL;

-- Politique RLS : autoriser le téléchargement via le bucket storage 'invoices'
-- pour toute requête authentifiée par la présence du token dans l'URL signée
-- (gérée côté API via service_role — pas de RLS storage supplémentaire ici).

-- Met à jour la fonction generate_invoice pour générer un token à la création.
CREATE OR REPLACE FUNCTION generate_invoice(
  p_booking_id UUID,
  p_user_id UUID,
  p_invoice_number TEXT
)
RETURNS invoices AS $$
DECLARE
  v_booking bookings;
  v_invoice invoices;
BEGIN
  SELECT b.* INTO v_booking FROM bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND: Réservation introuvable'; END IF;
  IF v_booking.tenant_id != (SELECT tenant_id FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Vous n''êtes pas autorisé à générer une facture pour cette réservation';
  END IF;

  INSERT INTO invoices (tenant_id, booking_id, invoice_number, amount, tax_amount, total_amount, status, created_by, access_token)
  VALUES (v_booking.tenant_id, v_booking.id, p_invoice_number, v_booking.total_amount, 0, v_booking.total_amount, 'draft', p_user_id, encode(gen_random_bytes(24), 'hex'))
  ON CONFLICT (tenant_id, booking_id) DO NOTHING
  RETURNING * INTO v_invoice;

  IF v_invoice.id IS NULL THEN
    SELECT * INTO v_invoice FROM invoices WHERE tenant_id = v_booking.tenant_id AND booking_id = v_booking.id;
  ELSE
    INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values)
    VALUES (v_booking.tenant_id, p_user_id, 'invoice_generated', 'invoice', v_invoice.id,
      jsonb_build_object('invoice_number', v_invoice.invoice_number, 'booking_id', v_booking.id, 'total_amount', v_booking.total_amount, 'tax_amount', 0));
  END IF;
  RETURN v_invoice;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

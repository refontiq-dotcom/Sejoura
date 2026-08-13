-- Factures : un document par réservation, montants alignés sur la réservation,
-- et fichiers privés servis uniquement par URL signée.

UPDATE storage.buckets SET public = false WHERE id = 'invoices';

DROP POLICY IF EXISTS "invoices_storage_select_public" ON storage.objects;

-- Les anciennes URL publiques deviennent des chemins d'objet afin que l'API
-- puisse désormais remettre une URL signée temporaire.
UPDATE invoices
SET pdf_url = regexp_replace(pdf_url, '^.*/invoices/', '')
WHERE pdf_url ~ '^https?://.*/invoices/';

-- Les brouillons n'ont pas encore été communiqués : on corrige leurs montants
-- et force une régénération du PDF. Les documents envoyés/payés restent figés.
UPDATE invoices
SET tax_amount = 0,
    total_amount = amount,
    pdf_url = NULL,
    updated_at = NOW()
WHERE status = 'draft' AND (tax_amount <> 0 OR total_amount <> amount);

-- Les anciennes tentatives interrompues pouvaient créer plusieurs brouillons.
-- On conserve le PDF existant en priorité, puis l'enregistrement le plus récent.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY tenant_id, booking_id
    ORDER BY (pdf_url IS NOT NULL) DESC, created_at DESC
  ) AS row_number
  FROM invoices
)
DELETE FROM invoices WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_booking
ON invoices (tenant_id, booking_id);

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

  INSERT INTO invoices (tenant_id, booking_id, invoice_number, amount, tax_amount, total_amount, status, created_by)
  VALUES (v_booking.tenant_id, v_booking.id, p_invoice_number, v_booking.total_amount, 0, v_booking.total_amount, 'draft', p_user_id)
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

-- Une facture suit le règlement de sa réservation, sans écraser le statut
-- "envoyée" tant que le solde n'est pas réglé.
CREATE OR REPLACE FUNCTION sync_invoice_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'paid' THEN
    UPDATE invoices SET status = 'paid', updated_at = NOW()
    WHERE booking_id = NEW.id AND tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_invoice_payment_status ON bookings;
CREATE TRIGGER trigger_sync_invoice_payment_status
AFTER UPDATE OF payment_status ON bookings
FOR EACH ROW
WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
EXECUTE FUNCTION sync_invoice_payment_status();

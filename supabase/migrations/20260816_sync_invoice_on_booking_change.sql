-- 20260816_sync_invoice_on_booking_change.sql
-- Factures et prolongations de séjour : quand le montant d'une réservation
-- change (prolongation via extend_booking, nuitées ajoutées par dépassement de
-- séjour, etc.), la facture associée doit suivre.
--
-- Règle (cohérente avec 20260813_secure_invoice_generation.sql) :
--   - facture « draft » : montants resynchronisés sur la réservation et PDF
--     invalidé (pdf_url = NULL) pour forcer une régénération au prochain clic ;
--   - facture « sent » / « paid » : figée (déjà communiquée / réglée).

-- ----------------------------------------------------------------------------
-- 1. FONCTION: sync_draft_invoice_on_booking_change()
--    Après modification du total / nuits / date de départ d'une réservation,
--    met à jour les factures brouillons correspondantes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_draft_invoice_on_booking_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF NEW.total_amount   IS DISTINCT FROM OLD.total_amount
     OR NEW.nights_count  IS DISTINCT FROM OLD.nights_count
     OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date THEN

    UPDATE invoices
    SET amount       = NEW.total_amount,
        tax_amount   = 0,
        total_amount = NEW.total_amount,
        pdf_url      = NULL,
        updated_at   = NOW()
    WHERE booking_id = NEW.id
      AND tenant_id  = NEW.tenant_id
      AND status     = 'draft'
      AND (amount IS DISTINCT FROM NEW.total_amount
           OR total_amount IS DISTINCT FROM NEW.total_amount
           OR pdf_url IS NOT NULL);

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
      INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, new_values, created_at)
      VALUES (
        NEW.tenant_id,
        'invoice_synced_on_booking_change',
        'booking',
        NEW.id,
        jsonb_build_object(
          'old_total_amount', OLD.total_amount,
          'new_total_amount', NEW.total_amount,
          'old_check_out_date', OLD.check_out_date,
          'new_check_out_date', NEW.check_out_date
        ),
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. TRIGGER sur bookings
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_sync_draft_invoice_on_booking_change ON bookings;
CREATE TRIGGER trg_sync_draft_invoice_on_booking_change
AFTER UPDATE OF total_amount, nights_count, check_out_date ON bookings
FOR EACH ROW
EXECUTE FUNCTION sync_draft_invoice_on_booking_change();

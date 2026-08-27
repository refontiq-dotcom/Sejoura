-- ============================================================================
-- 20260912_audit_journal_traceability.sql
--
-- Traçabilité du Journal d'audit : associer l'acteur (user_id) aux logs.
--
-- Problème : la plupart des fonctions SQL (check_in_booking, check_out_booking,
-- cancel_booking, generate_invoice, log_price_change...) insèrent dans
-- audit_logs SANS renseigner user_id. Le journal affiche donc « Le système »
-- au lieu du nom de la personne qui a réellement effectué l'action.
--
-- Solution : un trigger BEFORE INSERT sur audit_logs qui déduit l'utilisateur
-- à partir du JWT de la requête (auth.uid() -> users.id) lorsque user_id n'est
-- pas déjà fourni. Aucun changement des appels existants n'est nécessaire :
-- toutes les écritures passées par une session utilisateur (supabase.rpc côté
-- client) sont désormais tracées avec l'acteur réel. Les écritures faites en
-- service role (admin, automatismes) ne portent pas de JWT : user_id reste
-- NULL et le journal affiche « Le système », ce qui est correct.
--
-- Nota : les logs déjà écrits (user_id NULL) ne peuvent pas être rétroactifs —
-- l'acteur historique est inconnu. Seules les nouvelles actions sont tracées.
-- ============================================================================

CREATE OR REPLACE FUNCTION fill_audit_log_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT id INTO NEW.user_id
    FROM users
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_logs_fill_user ON audit_logs;
CREATE TRIGGER trg_audit_logs_fill_user
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION fill_audit_log_user();

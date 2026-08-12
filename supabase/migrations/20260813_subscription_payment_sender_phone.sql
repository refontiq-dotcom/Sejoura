-- 20260813_subscription_payment_sender_phone.sql
-- Ajoute le numéro de téléphone expéditeur du paiement Wave sur les demandes
-- de paiement. Utilisé par le Super Admin pour vérifier le transfert lors de la
-- validation (« Soumettre pour activation rapide »).
--
-- Idempotent : ré-exécutable sans erreur.

ALTER TABLE subscription_payment_requests
  ADD COLUMN IF NOT EXISTS sender_phone TEXT;

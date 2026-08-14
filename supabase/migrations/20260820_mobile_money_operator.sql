-- Migration: Opérateur Mobile Money sur les paiements
-- Date: 2026-08-20
--
-- 1. Ajoute la méthode générique 'mobile_money' à l'enum payment_method.
-- 2. Ajoute la colonne mobile_money_operator (TEXT, optionnelle) sur payments.
--    L'opérateur réel (wave, orange_money, mtn_money, moov_money, pi_spi) est
--    stocké ici afin de permettre le rapprochement de trésorerie par opérateur.
--    Un champ TEXT (et non un ENUM) laisse la porte ouverte aux futurs opérateurs.

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'mobile_money';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mobile_money_operator TEXT;

COMMENT ON COLUMN payments.mobile_money_operator IS
  'Opérateur Mobile Money (wave, orange_money, mtn_money, moov_money, pi_spi). Optionnel, NULL pour les autres modes de paiement.';

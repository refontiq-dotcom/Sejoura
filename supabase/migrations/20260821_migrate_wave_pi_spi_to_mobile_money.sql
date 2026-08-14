-- Migration: Bascule des anciens paiements Wave / Pi-SPI vers la méthode
-- générique 'mobile_money' avec opérateur dédié.
-- Date: 2026-08-21
--
-- Le libellé est désormais déduit de payments.mobile_money_operator pour le
-- rapprochement de trésorerie par opérateur.

UPDATE payments
SET payment_method = 'mobile_money',
    mobile_money_operator = 'wave'
WHERE payment_method = 'wave';

UPDATE payments
SET payment_method = 'mobile_money',
    mobile_money_operator = 'pi_spi'
WHERE payment_method = 'pi_spi';

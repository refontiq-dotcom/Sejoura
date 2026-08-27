-- ============================================================================
-- 20260911_drop_obsolete_create_system_notification_overloads.sql
--
-- Corrige l'erreur « function create_system_notification(...) is not unique » :
-- les anciennes signatures à 6 et 7 paramètres (20260819, 20260822) ont été
-- conservées en base par CREATE OR REPLACE (qui ne remplace qu'à signature
-- strictement identique), en plus de la version à 8 paramètres (20260910).
--
-- Résultat : un appel à 6 arguments (ex. dans extend_booking) devenait ambigu
-- car les surcharges à 7 et 8 paramètres ont des arguments par défaut.
-- On supprime les deux signatures obsolètes : seule la version à 8 paramètres
-- subsiste, et tous les appels (6, 7 ou 8 arguments) y résolvent sans ambiguïté.
-- ============================================================================

DROP FUNCTION IF EXISTS create_system_notification(uuid, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS create_system_notification(uuid, uuid, text, text, text, text, text);

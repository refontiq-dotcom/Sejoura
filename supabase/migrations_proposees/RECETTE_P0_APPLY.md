# Instructions d'application — garde-fou P0 en recette Supabase
# Date : 2026-10-15 — NE PAS exécuter en production. Ne pas committer/pousser.
# Fichiers : supabase/migrations_proposees/20261015_trial_expiry_effective_end.sql
#            supabase/migrations_proposees/20261016_p0_subscription_write_lock.sql

## 0. Prérequis (DBA)
# - [ ] Snapshot / sauvegarde récente de la base de recette, restauration testée.
# - [ ] Fenêtre de maintenance (pose de triggers = verrous ACCESS EXCLUSIVE brefs).
# - [ ] Accès SQL Editor Supabase (rôle postgres/service_role) sur le projet RECETTE.
# - [ ] Confirmer : \df+ public.generate_invoice  → noter les GRANT actuels
#       (attendu : EXECUTE PUBLIC par défaut, aucun GRANT versionné retrouvé).
#       AUCUN changement de privilèges appliqué par la migration (décision P0-5) :
#       ce diagnostic sert uniquement à consigner l'état avant/après.
# - [ ] Diagnostic privilèges (lecture seule) :
#       SELECT grantee, privilege_type FROM information_schema.role_routine_grants
#       WHERE routine_schema = 'public' AND routine_name = 'generate_invoice';
# - [ ] Confirmer : SELECT * FROM pg_extension WHERE extname = 'pgcrypto';
# - [ ] Jeu de test : 1 tenant trial valide, 1 trial expiré, 1 sans ligne
#       subscriptions, 1 pending avec échéance dépassée, 1 payant verrouillé.

## 1. Ordre d'application (SQL Editor, projet RECETTE uniquement)
# 1a. Coller puis exécuter 20261015_trial_expiry_effective_end.sql
#     → vérifie : SELECT proname FROM pg_proc WHERE proname='sync_subscription_statuses';
# 1b. Test à blanc : SELECT public.sync_subscription_statuses(); → note le nombre.
# 1c. Coller puis exécuter 20261016_p0_subscription_write_lock.sql
#     → vérifie : SELECT tgname FROM pg_trigger WHERE tgname='trg_subscription_writable'; (16 lignes : 15 tables + users)
#     → vérifie : SELECT has_function_privilege('authenticated',
#         'public.subscription_blocks_writes(uuid)', 'EXECUTE'); → false (P0-3a : pas d'oracle inter-tenant)
#     → vérifie : SELECT has_function_privilege('service_role',
#         'public.subscription_blocks_writes(uuid)', 'EXECUTE'); → true

## 2. Scénarios A1–P1 (exécuter en recette, rôle authenticated = JWT utilisateur test)
# A1. Trial valide : INSERT INTO bookings (...) → OK.
# A2. Trial expiré (échéance dépassée, sans soft-lock) : INSERT INTO bookings → ERREUR SUBSCRIPTION_LOCKED.
# A3. Sans ligne subscriptions : INSERT INTO clients → ERREUR SUBSCRIPTION_LOCKED (fail-closed).
# A4. subscription_status='pending', échéance dépassée : INSERT INTO payments → OK (rétablissement).
# R1. Webhook Wave (service_role), tenant expiré : UPDATE subscriptions → OK.
# R2. Cron subscription-renewal (service_role) : SELECT public.apply_subscription_period_end_transitions() → OK.
# R3. Super Admin via service_role → écritures OK.
# I1. Tenant A expiré écrivant chez tenant B (authenticated) → refusé par RLS (inchangées).
# P1. Portail client : SELECT public.get_client_stay(token) → OK (lecture) ;
#     SELECT public.request_stay_extension(token, ...) sur tenant expiré → ERREUR SUBSCRIPTION_LOCKED.
# T1. Changement de tenant : UPDATE bookings SET tenant_id = <autre> (authenticated, tenant valide) →
#     ERREUR (contrôle OLD+NEW ; le déplacement inter-tenant est refusé).
# T2. DELETE sur tenant expiré (authenticated) : DELETE FROM clients → ERREUR SUBSCRIPTION_LOCKED
#     (le trigger couvre aussi DELETE, pas seulement INSERT/UPDATE).
# T3. Super Admin sans tenant (authenticated, role super_admin, users.tenant_id NULL) :
#     INSERT INTO users (super_admin) → OK (exception explicite) ;
#     INSERT INTO users (admin_residence, tenant NULL) → ERREUR TENANT_REQUIRED.
# T4. Onboarding OAuth/Magic Link (authenticated, callback/confirm) :
#     INSERT INTO users (auth_user_id = soi-même, role admin_residence, tenant NULL) → OK (auto-provisionnement) ;
#     UPDATE promotion client → admin_residence (soi-même, tenant NULL) → OK ;
#     UPDATE promotion vers receptionniste/menagere/super_admin (soi-même) → ERREUR ROLE_IMMUTABLE ;
#     UPDATE tenant_id NULL → <tenant> (soi-même) → ERREUR TENANT_IMMUTABLE (rattachement via /api/register).
# T5. Anti-escalade générique (authenticated) :
#     UPDATE users SET tenant_id = <autre> sur ligne existante avec tenant → ERREUR TENANT_IMMUTABLE ;
#     UPDATE sa propre ligne users en changeant auth_user_id → ERREUR ROLE_IMMUTABLE.
# Consigner chaque résultat (OK / ERREUR + code). Tout écart = retour au §4.

## 3. Non-régression applicative (recette)
# - [ ] npm run build passe ; parcours dashboard : bookings, clients, rooms, invoices, cleaning, shifts, hr, ads.
# - [ ] Route /api/invoice/generate sur tenant valide → facture générée (service_role OK malgré le REVOKE).
# - [ ] Route /api/v1/external/bookings (POST, clé API) sur tenant expiré → 403 SUBSCRIPTION_LOCKED (garde TS).
# - [ ] Déclaration de paiement (notify-payment) sur tenant expiré → OK (chemin de rétablissement).

## 4. Retour arrière (si écart, sans perte de données — requêtes en fin de fichier SQL, §ROLLBACK)
# - [ ] DROP des 16 triggers trg_subscription_writable, puis des 2 fonctions.
# - [ ] is_tenant_locked : ré-appliquer 20260924150000_harden_tenant_and_identity_security.sql.
# - [ ] generate_invoice : AUCUN changement appliqué par cette migration (décision P0-5) → rien à restaurer.
#       Tout resserrement futur = migration dédiée avec ACL avant/après vérifiées par \df+.

## 5. Blocages connus signalés pour revue DBA
# - GRANT d'origine exacts de generate_invoice NON RETROUVÉS → DÉCISION P0-5 : aucun REVOKE appliqué.
#   Diagnostic \df+ / role_routine_grants à consigner avant/après (lecture seule).
# - subscription_blocks_writes : EXECUTE service_role seul (P0-3a, pas d'oracle inter-tenant).
# - Trigger : TENANT_REQUIRED si tenant indéterminable (P0-4, fail-closed) ; contrôle OLD+NEW si
#   changement de tenant_id en UPDATE ; exception explicite super_admin sans tenant sur users.
#   users.tenant_id NULL hors super_admin (ex. OWNER en création via service_role : register/callback/confirm)
#   : service_role contourne le trigger (auth.uid() NULL) — aucun faux positif démontré.
# - status est l'enum public.subscription_status (cast ::text dans le SQL) ; subscription_status est TEXT (pas de cast).

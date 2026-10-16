-- ============================================================================
-- PROPOSITION NON EXÉCUTÉE — garde-fou d'expiration côté base (P0)
-- Date de rédaction : 2026-10-15 — NE PAS APPLIQUER sans revue DBA.
--
-- Contexte : les gardes TypeScript (requireActiveSubscription,
-- subscriptionWriteError) protègent les routes API servies par Next.js, mais
-- les écritures directes via le client Supabase (dashboard) et les RPC
-- SECURITY DEFINER appelées par le rôle `authenticated`
-- (create_booking, cancel_booking, check_in_booking, generate_invoice,
-- claim/complete_cleaning_task) contournent ces gardes. De plus
-- is_tenant_locked() est en fail-open (ligne absente => false) et ses droits
-- EXECUTE sont révoqués à `authenticated`, elle n'est donc utilisable ni par
-- le client ni par les RPC.
--
-- Cette migration est ADDITIVE et IDEMPOTENTE (CREATE OR REPLACE, DROP IF
-- EXISTS) : elle ne supprime ni table, ni colonne, ni donnée, ni politique
-- RLS existante. Elle AJOUTE uniquement :
--   1. public.subscription_blocks_writes(uuid) : décision unique d'écriture
--      (même règle que evaluateSubscriptionWriteAccess côté TS).
--   2. Un trigger BEFORE INSERT/UPDATE/DELETE sur les tables métier qui lève
--      une exception quand l'écriture provient du rôle `authenticated` et que
--      l'abonnement du tenant bloque les écritures.
--   3. Durcissement GRANT/REVOKE sur generate_invoice (service_role seul :
--      la route /api/invoice/generate est déjà gardée) et conservation des
--      EXECUTE existants là où l'UI en a besoin — le trigger §2 fait foi.
--
-- PRÉREQUIS (à vérifier par le DBA avant application) :
--   a. Le rôle `authenticated` est le rôle effectif des appels dashboard.
--   b. Aucune tâche cron applicative n'écrit en `authenticated` sur les
--      tables métier (vérifié : crons en service_role via createAdminClient).
--   c. Sauvegarde récente + fenêtre de maintenance (pose de triggers =
--      verrous ACCESS EXCLUSIVE brefs sur chaque table).
--
-- ORDRE D'APPLICATION :
--   1. Appliquer 20261015_trial_expiry_effective_end.sql (déjà proposée).
--   2. Appliquer CE fichier.
--   3. Valider avec les scénarios §VALIDATION (recette uniquement).
--
-- RETOUR ARRIÈRE : bloc ROLLBACK en fin de fichier (sans perte de données).
-- ============================================================================

-- ── 1. Décision unique d'écriture ───────────────────────────────────────────
-- Miroir de evaluateSubscriptionWriteAccess côté TS :
--   ligne absente => TRUE (fail-closed) ; pending => FALSE ;
--   soft-lock/expired/statut terminal/échéance dépassée => TRUE ; sinon FALSE.
CREATE OR REPLACE FUNCTION public.subscription_blocks_writes(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.subscriptions%ROWTYPE;
  v_effective_end timestamptz;
BEGIN
  SELECT * INTO v_row
  FROM public.subscriptions
  WHERE tenant_id = p_tenant_id;

  IF NOT FOUND OR v_row.tenant_id IS NULL THEN
    RETURN TRUE; -- fail-closed : pas de ligne = pas d'écriture
  END IF;

  -- NOTE : subscription_status est TEXT (pas l'enum) — comparaisons directes OK.
  IF v_row.subscription_status = 'pending' THEN
    RETURN FALSE; -- paiement en validation : jamais bloqué
  END IF;

  IF COALESCE(v_row.is_soft_locked, FALSE) THEN
    RETURN TRUE;
  END IF;

  IF v_row.subscription_status = 'expired' THEN
    RETURN TRUE;
  END IF;

  -- NOTE : status est l'enum public.subscription_status — cast explicite
  -- requis (comparaison enum = text échouerait selon la config).
  IF v_row.status::text IN ('suspended', 'cancelled', 'overdue') THEN
    RETURN TRUE;
  END IF;

  v_effective_end := COALESCE(
    v_row.subscription_end_date,
    v_row.current_period_end,
    v_row.trial_ends_at
  );

  IF v_effective_end IS NOT NULL AND v_effective_end < NOW() THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$function$;

-- ── 2. Trigger générique de garde ───────────────────────────────────────────
-- Ne bloque que les écritures du rôle applicatif authentifié (auth.uid()
-- présent). service_role (webhooks, crons, routes admin gardées côté TS),
-- postgres et superuser : autorisés — les routes API portent déjà
-- requireActiveSubscription / subscriptionWriteError, le DB-guard est une
-- seconde barrière. Lève SUBSCRIPTION_LOCKED avec message actionnable.
CREATE OR REPLACE FUNCTION public.assert_subscription_writable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant uuid;
  v_rec record;
BEGIN
  -- Bypass service_role / systeme : seules les ecritures du role applicatif
  -- authentifie sont filtrees. NOTE BLOQUANTE CORRIGEE : auth.uid() est
  -- schema-qualifie car search_path = '' - une reference nue uth`r
  -- leverait une erreur d'execution et casserait TOUTES les ecritures.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Résolution du tenant : NEW/OLD direct, sinon via la réservation ou
  -- l'établissement parent pour les tables sans tenant_id propre.
  v_rec := COALESCE(NEW, OLD);
  BEGIN
    v_tenant := (v_rec).tenant_id;
  EXCEPTION WHEN OTHERS THEN
    v_tenant := NULL;
  END;

  IF v_tenant IS NULL AND TG_TABLE_NAME IN ('rooms', 'room_types') THEN
    SELECT a.tenant_id INTO v_tenant FROM public.accommodations a
      WHERE a.id = (v_rec).accommodation_id;
  ELSIF v_tenant IS NULL AND TG_TABLE_NAME IN ('payments', 'invoices', 'cleaning_tasks') THEN
    -- NOTE : branches conserv�es en filet uniquement ; le schema reel montre
    -- que ces tables ONT un tenant_id direct (NEW/OLD suffit).
    SELECT b.tenant_id INTO v_tenant FROM public.bookings b
      WHERE b.id = (v_rec).booking_id;
  ELSIF v_tenant IS NULL AND TG_TABLE_NAME = 'shifts' THEN
    SELECT a.tenant_id INTO v_tenant FROM public.accommodations a
      WHERE a.id = (v_rec).accommodation_id;
  END IF;
  -- CORRECTIF P0-4 (2026-10-15) : fail-closed + changement de tenant +
  -- exception super_admin explicite. Constats : (1) laisser passer quand le
  -- tenant est indeterminee ouvre un contournement (ligne orpheline
  -- inseree par authenticated) ; (2) un UPDATE qui change tenant_id
  -- deplacerait une ligne vers un autre tenant sans controle ; (3) les
  -- super_admin (users.tenant_id NULL, constate schema) et les creations
  -- via service_role (register/callback/confirm, constate code) doivent
  -- rester possibles sans ouvrir authenticated.
  -- CORRECTIF P0-6 (2026-10-15) : auto-provisionnement + anti-escalade.
  -- Constats (code) : callback/confirm INSERT via client serveur AVEC session
  -- un profil admin_residence SANS tenant ; la promotion Google UPDATE le role
  -- client vers admin_residence SANS tenant. Sans exception, TENANT_REQUIRED
  -- casserait l onboarding OAuth/Magic Link.
  -- Regle users :
  -- (a) super_admin SANS tenant => passe (exception demontree) ;
  -- (b) auto-provisionnement : la ligne concerne l appelant lui-meme
  --     ET n attribue AUCUN tenant => passe (INSERT onboarding, UPDATE
  --     promotion client vers admin_residence) ;
  -- (c) sinon : tenant NULL => TENANT_REQUIRED ; changement de tenant_id
  --     par authenticated => TENANT_IMMUTABLE (aucune escalade) ;
  -- (d) pas d elevation de role par authenticated sur sa propre ligne
  --     au-dela de client/admin_residence (tout autre changement via
  --     service_role : register, employee-pin).
  -- CORRECTIF P0-7 (2026-10-15) : REGLE ROLE_IMMUTABLE COMPLETE.
  -- Constats (code) : les changements de role legitimes passent TOUS par
  -- service_role — /api/register (upsert profil admin_residence, constate
  -- ligne 151-155), /api/employee-pin (liaison auth_user_id + PIN, constate),
  -- trigger handle_new_user (INSERT initial, constate migrations 20260815 /
  -- 20260822 / 20260919). AUCUN parcours legitime ne change `role` via
  -- authenticated, SAUF la promotion callback client -> admin_residence
  -- (SANS tenant, deja autorisee ci-dessus). Donc : sur users, TOUT UPDATE
  -- de `role` par authenticated est REFUSE, sauf client -> admin_residence
  -- sur sa propre ligne SANS tenant (onboarding Google).
  -- service_role (auth.uid() NULL) contourne le trigger : register,
  -- employee-pin, handle_new_user restent possibles.
  IF TG_TABLE_NAME = 'users' AND TG_OP = 'UPDATE' THEN
    IF (OLD).role IS DISTINCT FROM (NEW).role THEN
      IF NOT (
        (OLD).auth_user_id IS NOT NULL
        AND (NEW).auth_user_id IS NOT NULL
        AND (OLD).auth_user_id = auth.uid()
        AND (NEW).auth_user_id = auth.uid()
        AND (OLD).tenant_id IS NULL
        AND (NEW).tenant_id IS NULL
        AND (OLD).role = 'client'
        AND (NEW).role = 'admin_residence'
      ) THEN
        RAISE EXCEPTION 'ROLE_IMMUTABLE: changement de role via administration.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'users' THEN
    IF (v_rec).role = 'super_admin' AND (v_rec).tenant_id IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    IF (NEW).auth_user_id = auth.uid() AND (NEW).tenant_id IS NULL THEN
      IF TG_OP = 'UPDATE' THEN
        IF (OLD).auth_user_id IS DISTINCT FROM (NEW).auth_user_id THEN
          RAISE EXCEPTION 'ROLE_IMMUTABLE: liaison Auth non transferable.'
            USING ERRCODE = 'P0001';
        END IF;
        IF (OLD).tenant_id IS DISTINCT FROM (NEW).tenant_id THEN
          RAISE EXCEPTION 'TENANT_IMMUTABLE: rattachement via register.'
            USING ERRCODE = 'P0001';
        END IF;
        IF (OLD).role IS DISTINCT FROM (NEW).role
           AND (NEW).role <> 'admin_residence'
           AND (NEW).role <> 'client' THEN
          RAISE EXCEPTION 'ROLE_IMMUTABLE: elevation de role interdite.'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
      RETURN COALESCE(NEW, OLD);
    END IF;
    IF v_tenant IS NULL THEN
      RAISE EXCEPTION 'TENANT_REQUIRED: compte sans etablissement.'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_tenant IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: etablissement indeterminable.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (OLD).tenant_id IS DISTINCT FROM (NEW).tenant_id THEN
      IF (OLD).tenant_id IS NOT NULL THEN
        IF public.subscription_blocks_writes((OLD).tenant_id) THEN
          RAISE EXCEPTION 'SUBSCRIPTION_LOCKED: tenant origine verrouille.'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
      RAISE EXCEPTION 'TENANT_IMMUTABLE: changement etablissement interdit.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF public.subscription_blocks_writes(v_tenant) THEN
    RAISE EXCEPTION 'SUBSCRIPTION_LOCKED: Votre essai gratuit ou abonnement a expiré. Rendez-vous sur la page Abonnement pour le renouveler — vos données sont conservées.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_subscription_writable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_subscription_writable() TO service_role;

-- ── 3. Pose des triggers (tables métier à écriture directe) ────────────────
-- Constatées par audit du code applicatif (dashboard via client Supabase,
-- rôle authenticated). Chaque bloc est idempotent.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bookings', 'clients', 'rooms', 'room_types', 'accommodations',
    'payments', 'invoices', 'shifts', 'cleaning_tasks',
    'client_sessions', 'client_stay_extension_requests',
    'client_service_requests', 'advertisements', 'expenses', 'hr_employees'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_subscription_writable ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_subscription_writable
         BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.assert_subscription_writable()',
      t
    );
  END LOOP;
END;
$$;

-- Cas `users` : garde active quand le tenant est renseigné (création
-- d'employés par un admin). La création du OWNER à l'inscription reste
-- autorisée car /api/register crée une ligne trial valide ; les inscriptions
-- legacy sans ligne seraient bloquées en fail-closed (comportement P0 voulu,
-- récupération via page Abonnement / support).
DROP TRIGGER IF EXISTS trg_subscription_writable ON public.users;
CREATE TRIGGER trg_subscription_writable
  BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.assert_subscription_writable();


COMMENT ON FUNCTION public.subscription_blocks_writes(uuid)
  IS 'P0 : TRUE si les écritures métier du tenant doivent être refusées (expiré/verrouillé/ligne absente). Miroir SQL de evaluateSubscriptionWriteAccess.';

REVOKE ALL ON FUNCTION public.subscription_blocks_writes(uuid) FROM PUBLIC, anon;

-- CORRECTIF P0-3a (2026-10-15) : pas d'EXECUTE `authenticated` ici.
-- Constate demontre : GRANT EXECUTE a `authenticated` transformerait la
-- fonction en oracle inter-tenant (tout utilisateur authentifie pourrait
-- tester l'etat d'abonnement d'un tenant arbitraire). Seuls les triggers
-- SECURITY DEFINER (internes) et service_role l'appellent. Les routes API
-- gardent leur propre lecture via le client admin (service_role).
GRANT EXECUTE ON FUNCTION public.subscription_blocks_writes(uuid) TO service_role;


-- ── 4. Durcissement RPC ─────────────────────────────────────────────────────
-- generate_invoice : appelée UNIQUEMENT par /api/invoice/generate (constaté
-- CORRECTIF P0-5 (2026-10-15) : PAS de REVOKE ici.
-- Constats demontres : (1) appelant unique = /api/invoice/generate via
-- service_role (grep : un seul admin.rpc dans tout le depot) ; (2) AUCUN
-- GRANT versionne dans les migrations => droits initiaux = EXECUTE PUBLIC
-- par defaut, NON RESTAURABLES exactement apres un REVOKE (PostgreSQL ne
-- memorise pas les ACL d origine) ; (3) la fonction ecrit dans invoices
-- (table couverte par le trigger P0-4) : un appel direct authenticated
-- sur un tenant expire est DEJA bloque par le trigger sur INSERT invoices.
-- DECISION : aucun changement de privil�ges ici. Le DBA DOIT executer
-- en recette AVANT application : \df+ public.generate_invoice
-- et consigner les ACL. Tout resserrement futur fera l objet d une
-- migration dediee avec ACL avant/apres verifiees.
-- Requete de diagnostic (lecture seule) :
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_schema = 'public'
--     AND routine_name = 'generate_invoice';

-- RPC conservées en EXECUTE `authenticated` (UI dashboard / portail client) :
-- l'expiration est appliquée par le trigger §3 sur les tables qu'elles
-- écrivent. AUCUN REVOKE ici (revue DBA requise avant resserrement) :
-- create_booking, cancel_booking, check_in_booking, check_out_booking,
-- check_overstays, claim/complete/reopen_cleaning_task, get_client_stay
-- (lecture), request_stay_extension, create_service_request,
-- sync_room_type_checkout_time, open_shift, close_shift,
-- check_double_booking (lecture), request_subscription_cancellation,
-- submit_subscription_payment_request (paiement : écrit dans des tables NON
-- couvertes — jamais bloqué, chemin de rétablissement préservé).

-- ── 5. is_tenant_locked : alignement fail-closed ────────────────────────────
-- Version actuelle : COALESCE(v_locked, false) => fail-open. On aligne sur la
-- règle P0 (ligne absente => verrouillé), garde anti-inter-tenant conservée.
CREATE OR REPLACE FUNCTION public.is_tenant_locked(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_locked boolean;
  v_current_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Connexion requise';
  END IF;

  v_current_tenant := public.get_current_user_tenant_id();

  IF v_current_tenant IS NULL OR p_tenant_id IS DISTINCT FROM v_current_tenant THEN
    RAISE EXCEPTION 'FORBIDDEN: Tenant hors périmètre';
  END IF;

  SELECT s.is_soft_locked INTO v_locked
  FROM public.subscriptions s
  WHERE s.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN TRUE; -- P0 fail-closed : pas de ligne = verrouillé
  END IF;

  RETURN COALESCE(v_locked, FALSE);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_tenant_locked(uuid) FROM anon, authenticated, public;

-- ============================================================================
-- VALIDATION (recette uniquement, jamais en production directement) :
--  A1. Trial valide : INSERT bookings via authenticated => OK.
--  A2. Trial expiré (échéance dépassée, sans soft-lock) : INSERT bookings
--      via authenticated => ERREUR SUBSCRIPTION_LOCKED.
--  A3. Sans ligne subscriptions : INSERT clients via authenticated =>
--      ERREUR SUBSCRIPTION_LOCKED (fail-closed).
--  A4. subscription_status='pending', échéance dépassée : INSERT payments
--      via authenticated => OK (rétablissement possible).
--  R1. Webhook Wave (service_role), tenant expiré : UPDATE subscriptions
--      => OK (jamais bloqué).
--  R2. Cron subscription-renewal (service_role) => OK (jamais bloqué).
--  R3. Super Admin via service_role => OK.
--  I1. Tenant A expiré écrivant chez tenant B via authenticated => refusé
--      par RLS existantes (inchangées).
--  P1. Portail client : get_client_stay (lecture) OK ; request_stay_extension
--      sur tenant expiré => ERREUR SUBSCRIPTION_LOCKED.
-- ============================================================================

-- ============================================================================
-- ROLLBACK (ordre inverse, sans perte de données) :
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.users;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.bookings;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.clients;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.rooms;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.room_types;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.accommodations;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.payments;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.invoices;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.shifts;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.cleaning_tasks;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.client_sessions;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.client_stay_extension_requests;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.client_service_requests;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.advertisements;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.expenses;
--   DROP TRIGGER IF EXISTS trg_subscription_writable ON public.hr_employees;
--   DROP FUNCTION IF EXISTS public.assert_subscription_writable();
--   DROP FUNCTION IF EXISTS public.subscription_blocks_writes(uuid);
--   -- is_tenant_locked : ré-appliquer
--   -- 20260924150000_harden_tenant_and_identity_security.sql (version
--   -- d'origine, fail-open).
--   -- generate_invoice : GRANT d'origine EXACTS NON RETROUVÉS dans les
--   -- migrations auditées (fonction créée hors migrations versionnées ou
--   -- sans GRANT explicite => EXECUTE PUBLIC par défaut). NE RESTAURER
--   -- QU'APRÈS VÉRIFICATION DBA de \\df+ public.generate_invoice.
-- ============================================================================

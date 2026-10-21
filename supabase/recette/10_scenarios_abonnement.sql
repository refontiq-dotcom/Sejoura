-- ============================================================================
-- RECETTE P0 — Scénarios ABONNEMENT (20261015 + 20261016)
-- Fichier : supabase/recette/10_scenarios_abonnement.sql
--
-- PSL : psql -X -v ON_ERROR_STOP=1 -f ce fichier (voir scripts/recette-p0-run.sh).
-- Chaque scénario passe par recette.expect_ok / expect_error / expect_true :
--   - erreur INATTENDUE, erreur NON conforme (SQLSTATE/message) ou condition
--     d'état fausse => RAISE EXCEPTION => psql => exit != 0 (job en echec) ;
--   - conforme => NOTICE 'SCEN [...] OK' (compte dans le rapport du runner).
--
-- Sessions simulées : SET request.jwt.claim.sub = '<uuid>' (avant SET ROLE)
--   puis SET ROLE authenticated — auth.uid() du shim lit cette GUC.
--   Sans GUC => auth.uid() NULL => bypass service_role (miroir production).
-- ============================================================================

\echo '=== RECETTE P0/1 : preflight + unites ==='

-- Préflight des contrats de la migration 20261016 (etat post-application).
SELECT recette.expect_true('preflight: 16 triggers trg_subscription_writable (15 tables metier + users)',
  (SELECT count(*)
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'trg_subscription_writable'
      AND NOT t.tgisinternal
      AND n.nspname = 'public') = 16);

SELECT recette.expect_true('preflight: subscription_blocks_writes INEXECUTABLE par authenticated (P0-3a)',
  NOT has_function_privilege('authenticated', 'public.subscription_blocks_writes(uuid)', 'EXECUTE'));

SELECT recette.expect_true('preflight: subscription_blocks_writes EXECUTABLE par service_role',
  has_function_privilege('service_role', 'public.subscription_blocks_writes(uuid)', 'EXECUTE'));

SELECT recette.expect_true('preflight: assert_subscription_writable INEXECUTABLE par authenticated',
  NOT has_function_privilege('authenticated', 'public.assert_subscription_writable()', 'EXECUTE'));

SELECT recette.expect_true('preflight: assert_subscription_writable EXECUTABLE par service_role',
  has_function_privilege('service_role', 'public.assert_subscription_writable()', 'EXECUTE'));

SELECT recette.expect_true('preflight: sync_subscription_statuses (20261015) present',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = 'sync_subscription_statuses' AND n.nspname = 'public'));

-- Unites de subscription_blocks_writes (miroir TS evaluateSubscriptionWriteAccess).
SELECT recette.expect_true('U1 tenant valide : ecritures AUTORISEES (FALSE)',
  public.subscription_blocks_writes('aaaaaaaa-0000-4000-8000-000000000001') IS FALSE);
SELECT recette.expect_true('U2 tenant expire+soft-lock : ecritures BLOQUEES (TRUE)',
  public.subscription_blocks_writes('aaaaaaaa-0000-4000-8000-000000000002') IS TRUE);
SELECT recette.expect_true('U3 sans ligne subscriptions : fail-closed (TRUE)',
  public.subscription_blocks_writes('aaaaaaaa-0000-4000-8000-000000000003') IS TRUE);
SELECT recette.expect_true('U4 pending + echeance passee : jamais bloque (FALSE)',
  public.subscription_blocks_writes('aaaaaaaa-0000-4000-8000-000000000004') IS FALSE);
SELECT recette.expect_true('U5 active + echeance passee non verrouillee : bloque par la date (TRUE)',
  public.subscription_blocks_writes('aaaaaaaa-0000-4000-8000-000000000005') IS TRUE);

\echo '=== RECETTE P0/2 : scénarios A (authenticated, rôle réel) ==='

-- A1 — Trial valide : INSERT bookings via authenticated => OK.
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111101';
SET ROLE authenticated;
SELECT recette.expect_ok('A1 INSERT bookings tenant valide', $sql$
  INSERT INTO public.bookings (tenant_id, accommodation_id, room_id, client_id, booking_code,
    check_in_date, check_out_date, base_price, negotiated_price, nights_count, total_amount, created_by)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
    'eeeeeeee-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001',
    'REC-A1-0001', (NOW() + INTERVAL '34 days')::date, (NOW() + INTERVAL '36 days')::date,
    15000, 15000, 2, 30000, 'bbbbbbbb-0000-4000-8000-000000000001')
$sql$);
RESET ROLE;
RESET request.jwt.claim.sub;

-- A2 — Trial expire : INSERT bookings via authenticated => SUBSCRIPTION_LOCKED.
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111102';
SET ROLE authenticated;
SELECT recette.expect_error('A2 INSERT bookings tenant expire', $sql$
  INSERT INTO public.bookings (tenant_id, accommodation_id, room_id, client_id, booking_code,
    check_in_date, check_out_date, base_price, negotiated_price, nights_count, total_amount, created_by)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002',
    'eeeeeeee-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000002',
    'REC-A2-0001', (NOW() + INTERVAL '44 days')::date, (NOW() + INTERVAL '46 days')::date,
    15000, 15000, 2, 30000, 'bbbbbbbb-0000-4000-8000-000000000002')
$sql$, 'P0001', 'SUBSCRIPTION_LOCKED%');
RESET ROLE;
RESET request.jwt.claim.sub;

-- A3 — Sans ligne subscriptions : INSERT clients => SUBSCRIPTION_LOCKED (fail-closed).
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111103';
SET ROLE authenticated;
SELECT recette.expect_error('A3 INSERT clients sans abonnement (fail-closed)', $sql$
  INSERT INTO public.clients (tenant_id, full_name, phone)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000003', 'Client A3 Recette', '+22501060601')
$sql$, 'P0001', 'SUBSCRIPTION_LOCKED%');
RESET ROLE;
RESET request.jwt.claim.sub;

-- A4 — Pending + echeance passee : INSERT payments => OK (jamais bloque).
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111104';
SET ROLE authenticated;
SELECT recette.expect_ok('A4 INSERT payments tenant pending', $sql$
  INSERT INTO public.payments (tenant_id, booking_id, accommodation_id, amount, payment_method, received_by)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000004', 'a1111111-0000-4000-8000-000000000003',
    'cccccccc-0000-4000-8000-000000000004', 15000, 'cash', 'bbbbbbbb-0000-4000-8000-000000000004')
$sql$);
RESET ROLE;
RESET request.jwt.claim.sub;

SELECT recette.expect_true('A1 ecrit effectivement une reservation (4 au total)',
  (SELECT count(*) FROM public.bookings) = 4);
SELECT recette.expect_true('A4 ecrit effectivement un paiement (2 au total)',
  (SELECT count(*) FROM public.payments) = 2);

-- S15 — Migration 20261015 : sync verrouille exactement T_STALE (pas le valide,
-- ni pending, ni deja expire) et bascule expire + soft-lock.
SELECT recette.expect_true('S15 sync_subscription_statuses verrouille exactement T_STALE',
  public.sync_subscription_statuses() = 1);
SELECT recette.expect_true('S15 T_STALE devient expired + soft-lock',
  (SELECT subscription_status = 'expired' AND is_soft_locked = TRUE
     FROM public.subscriptions
    WHERE tenant_id = 'aaaaaaaa-0000-4000-8000-000000000005'));
SELECT recette.expect_true('S15 T_VALID intact apres sync',
  (SELECT subscription_status = 'active' AND is_soft_locked = FALSE
     FROM public.subscriptions
    WHERE tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'));

\echo '=== RECETTE P0/3 : scénarios I / T / P1 ==='

-- I1 — Tenant expire qui ecrit CHEZ UN AUTRE tenant => refuse par RLS (42501).
--   RLS existante (inchangee par P0) qui refuse => SQLSTATE 42501.
--   (message ignoré : SQLSTATE exact + contrôle d'état « 0 ligne » portent
--   la vérification — robuste à la locale du serveur.)
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111102';
SET ROLE authenticated;
SELECT recette.expect_error('I1 INSERT clients du tenant valide par le tenant expire (RLS)', $sql$
  INSERT INTO public.clients (tenant_id, full_name, phone)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'Client I1 Cross', '+22501060602')
$sql$, '42501', NULL);
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT recette.expect_true('I1 aucune ligne ecrite chez le tenant valide',
  NOT EXISTS (SELECT 1 FROM public.clients
               WHERE tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'
                 AND full_name = 'Client I1 Cross'));

-- T1 — Changement de tenant d'une reservation (tenant valide) => TENANT_IMMUTABLE.
--   Declencheurs AVANT ordonnes alphabetiquement : 'trg_subscription_writable'
--   < 'trg_validate_...' => le garde P0 leve avant l'integrite referentielle.
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111101';
SET ROLE authenticated;
SELECT recette.expect_error('T1 UPDATE bookings SET tenant_id autre tenant', $sql$
  UPDATE public.bookings
     SET tenant_id = 'aaaaaaaa-0000-4000-8000-000000000002'
   WHERE id = 'a1111111-0000-4000-8000-000000000001'
$sql$, 'P0001', 'TENANT_IMMUTABLE%');
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT recette.expect_true('T1 reservation inchangee (toujours chez T_VALID)',
  (SELECT tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     FROM public.bookings WHERE id = 'a1111111-0000-4000-8000-000000000001'));

-- T2 — DELETE sur tenant expire => SUBSCRIPTION_LOCKED (le trigger couvre DELETE).
--   Sur public.clients, aucune politique DELETE n'existerait pour authenticated
--   (0 ligne, silencieux) : on teste via payments (payments_delete_own existe,
--   la ligne est visible) pour exercer reellement le declencheur sur DELETE.
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111102';
SET ROLE authenticated;
SELECT recette.expect_error('T2 DELETE payments sur tenant expire', $sql$
  DELETE FROM public.payments WHERE id = 'b2222222-0000-4000-8000-000000000001'
$sql$, 'P0001', 'SUBSCRIPTION_LOCKED%');
RESET ROLE;
RESET request.jwt.claim.sub;
SELECT recette.expect_true('T2 paiement toujours present',
  EXISTS (SELECT 1 FROM public.payments WHERE id = 'b2222222-0000-4000-8000-000000000001'));

-- P1a — Portail client : get_client_stay (lecture) sur tenant expire => OK.
SELECT recette.expect_true('P1a get_client_stay (lecture tenant expire) valide',
  (public.get_client_stay('recette-token-expired-2026') ->> 'valid')::boolean IS TRUE);

-- P1b — Route reelle /api/stay/extend (createAdminClient = service_role) :
--   le declencheur P0 bypasse auth.uid() NULL => la demande reussit.
--   DIVERGENCE DOCUMENTEE vs RECETTE_P0_APPLY.md §P1 (« ERREUR
--   SUBSCRIPTION_LOCKED ») : la route passe par service_role, voie de confiance
--   explicitement exclue du filtre P0. La garde P0 existe pour le role
--   authentifie : prouve par P1c ci-dessous. Aucun contournement de migration.
SET ROLE service_role;
SELECT recette.expect_ok('P1b request_stay_extension via service_role (route reelle)', $sql$
  SELECT public.request_stay_extension('recette-token-expired-2026',
           (NOW() + INTERVAL '45 days')::date, 'P1b recette')
$sql$);
RESET ROLE;

-- P1c — Meme appel sous session authentifiee => le garde P0 s'applique.
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111102';
SET ROLE authenticated;
SELECT recette.expect_error('P1c request_stay_extension sous session authentifiee', $sql$
  SELECT public.request_stay_extension('recette-token-expired-2026',
           (NOW() + INTERVAL '45 days')::date, 'P1c recette')
$sql$, 'P0001', 'SUBSCRIPTION_LOCKED%');
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== RECETTE P0/4 : scénarios R (voies de confiance service_role) ==='

-- R1  — UPDATE subscriptions sur tenant expire => OK.
-- R1b — INSERT clients sur tenant expire => OK (bypass P0 prouve).
-- R3  — UPDATE users sur tenant expire => OK (registre, PIN…).
--   Note R3 : le role super_admin n'est plus creable localement depuis
--   20260919 (prevent_local_super_admin leve FORBIDDEN pour TOUS les roles,
--   service_role inclus — constate dans le fichier 20, scénario T3) : R3 est
--   donc exprime comme ecriture service_role sur tenant expire.
SET ROLE service_role;
SELECT recette.expect_ok('R1 UPDATE subscriptions tenant expire (service_role)', $sql$
  UPDATE public.subscriptions SET updated_at = NOW()
   WHERE tenant_id = 'aaaaaaaa-0000-4000-8000-000000000002'
$sql$);
SELECT recette.expect_ok('R1b INSERT clients sur tenant expire (service_role, bypass P0)', $sql$
  INSERT INTO public.clients (tenant_id, full_name, phone)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000002', 'Client R1b Recette', '+22501060603')
$sql$);
SELECT recette.expect_ok('R3 UPDATE users sur tenant expire (service_role)', $sql$
  UPDATE public.users SET full_name = full_name
   WHERE id = 'bbbbbbbb-0000-4000-8000-000000000002'
$sql$);
-- R2 — Cron renewal : fonction executee en service_role => OK.
SELECT recette.expect_ok('R2 apply_subscription_period_end_transitions (service_role)', $sql$
  SELECT public.apply_subscription_period_end_transitions()
$sql$);
RESET ROLE;

SELECT recette.expect_true('R1b ecrit effectivement (contourne le P0 en service_role)',
  EXISTS (SELECT 1 FROM public.clients WHERE full_name = 'Client R1b Recette'));
-- Contre-preuve post-R2 : le cron n'a pas bascule le tenant valide.
SELECT recette.expect_true('post-R2 : T_VALID toujours writable',
  public.subscription_blocks_writes('aaaaaaaa-0000-4000-8000-000000000001') IS FALSE);
SELECT recette.expect_true('post-R2 : T_NO_SUB toujours fail-closed',
  public.subscription_blocks_writes('aaaaaaaa-0000-4000-8000-000000000003') IS TRUE);

\echo '=== RECETTE P0 : fichier 10 termine ==='



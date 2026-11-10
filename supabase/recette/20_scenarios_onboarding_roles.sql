-- ============================================================================
-- RECETTE P0 — Scénarios ONBOARDING / ROLES (contrats P0-6, P0-7, 20260919)
-- Fichier : supabase/recette/20_scenarios_onboarding_roles.sql
--
-- Mêmes helpers d'assertion que le fichier 10 (voir 00_shims §7).
-- Sessions : GUC `request.jwt.claim.sub` + SET ROLE authenticated ; sans GUC =>
--   auth.uid() NULL (bypass service_role / contexte GoTrue sans JWT).
--
-- Couverture :
--   T4a  signup OAuth/Magic Link (handle_new_user) — sans et avec session ;
--   T4b  promotion client -> admin_residence (seule promotion autorisee) ;
--   T4c  promotion vers receptionniste refusee (P0-7) ;
--   T4d  promotion vers super_admin refusee (prevent_local_super_admin, 20260919) ;
--   T4e  rattachement tenant refuse (TENANT_IMMUTABLE) ;
--   P0-7 escalade de role SUR LIGNE AVEC tenant (self + croisee) refusee ;
--   T5   transferts auth_user_id / changement de tenant refusee ;
--   service_role : voies de confiance (role change, owner/employe) toujours OK.
-- ============================================================================

\echo '=== RECETTE P0/5 : T4a signup OAuth / Magic Link ==='

-- T4a-1 : GoTrue sans JWT (auth.uid() NULL) + metadata role admin_residence.
--         handle_new_user cree le profil SANS tenant => P0 ne doit pas bloquer.
SELECT recette.expect_ok('T4a-1 INSERT auth.users (signup Magic Link, metadata role)', $sql$
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('22222222-2222-4222-8222-222222222201', 'oauth-magic@test.invalid',
          '{"role": "admin_residence", "full_name": "Recette Magic"}'::jsonb)
$sql$);
SELECT recette.expect_true('T4a-1 profil public.users cree : admin_residence, tenant NULL, actif',
  EXISTS (SELECT 1 FROM public.users
           WHERE auth_user_id = '22222222-2222-4222-8222-222222222201'
             AND role = 'admin_residence' AND tenant_id IS NULL AND is_active));

-- T4a-2 : signup Google (aucun role en metadata) => profil par defaut 'client'.
SELECT recette.expect_ok('T4a-2 INSERT auth.users (signup Google sans metadata role)', $sql$
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('22222222-2222-4222-8222-222222222202', 'oauth-google@test.invalid',
          '{"full_name": "Recette Google"}'::jsonb)
$sql$);
SELECT recette.expect_true('T4a-2 profil public.users cree : role client, tenant NULL',
  EXISTS (SELECT 1 FROM public.users
           WHERE auth_user_id = '22222222-2222-4222-8222-222222222202'
             AND role = 'client' AND tenant_id IS NULL));

-- T4a-3 : contrat d'auto-provisionnement P0-6 BRANCHE (b) — INSERT onboarding
--         avec session (GUC posee sur l'UUID meme que la ligne creee).
SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222203';
SELECT recette.expect_ok('T4a-3 INSERT auth.users en contexte session (auto-provisionnement P0-6)', $sql$
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('22222222-2222-4222-8222-222222222203', 'oauth-session@test.invalid',
          '{"role": "admin_residence", "full_name": "Recette Session"}'::jsonb)
$sql$);
SELECT recette.expect_true('T4a-3 profil cree malgre session (bypass auto-provisionnement actif)',
  EXISTS (SELECT 1 FROM public.users
           WHERE auth_user_id = '22222222-2222-4222-8222-222222222203'
             AND role = 'admin_residence' AND tenant_id IS NULL));
RESET request.jwt.claim.sub;

\echo '=== RECETTE P0/6 : T4b-T4e promotions (client sans tenant) ==='

-- T4b — Promotion client -> admin_residence, SOI-MEME, SANS tenant, sous RLS
--        (politique users_update_self) => AUTORISEE (seule promotion legale).
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111105';
SET ROLE authenticated;
SELECT recette.expect_ok('T4b promotion client -> admin_residence (onboarding Google)', $sql$
  UPDATE public.users SET role = 'admin_residence'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111105'
$sql$);
SELECT recette.expect_true('T4b role effectivement promu, tenant toujours NULL',
  (SELECT role = 'admin_residence' AND tenant_id IS NULL
     FROM public.users
    WHERE auth_user_id = '11111111-1111-4111-8111-111111111105'));
RESET ROLE;
RESET request.jwt.claim.sub;

-- T4c — Promotion vers receptionniste (ligne sans tenant) => P0-7 refuse.
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111106';
SET ROLE authenticated;
SELECT recette.expect_error('T4c promotion client -> receptionniste refusee (P0-7)', $sql$
  UPDATE public.users SET role = 'receptionniste'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111106'
$sql$, 'P0001', 'ROLE_IMMUTABLE%');
SELECT recette.expect_true('T4c role toujours client apres tentative',
  (SELECT role = 'client'
     FROM public.users WHERE auth_user_id = '11111111-1111-4111-8111-111111111106'));

-- T4d — Promotion vers super_admin => refuse par prevent_local_super_admin
--        (trigger AVANT, ordre alphabetique 'p' < 't') — DIVERGENCE DOCUMENTEE
--        vs RECETTE_P0_APPLY.md §T3 (« INSERT super_admin => OK ») : la
--        migration 20260919 interdit TOUTE creation/elevation super_admin
--        locale, pour tout role, service_role inclus. Aucun contournement.
SELECT recette.expect_error('T4d promotion client -> super_admin refusee (20260919)', $sql$
  UPDATE public.users SET role = 'super_admin'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111106'
$sql$, 'P0001', 'FORBIDDEN%');
SELECT recette.expect_true('T4d role toujours client apres tentative super_admin',
  (SELECT role = 'client'
     FROM public.users WHERE auth_user_id = '11111111-1111-4111-8111-111111111106'));

-- T4e — Rattachement tenant sur SOI-MEME (ligne sans tenant) => TENANT_IMMUTABLE
--        ('changement etablissement interdit' : le declencheur P0 empeche de
--        passer de NULL a un tenant hors /api/register).
SELECT recette.expect_error('T4e rattachement tenant par soi-meme refuse (TENANT_IMMUTABLE)', $sql$
  UPDATE public.users SET tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111106'
$sql$, 'P0001', 'TENANT_IMMUTABLE%');
SELECT recette.expect_true('T4e tenant toujours NULL apres tentative',
  (SELECT tenant_id IS NULL
     FROM public.users WHERE auth_user_id = '11111111-1111-4111-8111-111111111106'));
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== RECETTE P0/7 : P0-7 escalade sur ligne AVEC tenant ==='

-- P0-7a — SOI-MEME avec tenant : tout changement de role => ROLE_IMMUTABLE
--          (c'est le trou historique : escalade intra-tenant sur sa propre ligne).
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111101';
SET ROLE authenticated;
SELECT recette.expect_error('P0-7a auto-escalade admin_residence -> receptionniste sur ligne AVEC tenant', $sql$
  UPDATE public.users SET role = 'receptionniste'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111101'
$sql$, 'P0001', 'ROLE_IMMUTABLE%');
SELECT recette.expect_true('P0-7a role admin_residence inchange',
  (SELECT role = 'admin_residence'
     FROM public.users WHERE auth_user_id = '11111111-1111-4111-8111-111111111101'));

-- P0-7b — Croisee : un admin change le role d'un EMPLOYE du meme tenant
--          (RLS users_update_admin autorise la ligne) => ROLE_IMMUTABLE.
SELECT recette.expect_error('P0-7b admin change le role de l employe du meme tenant', $sql$
  UPDATE public.users SET role = 'menagere'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111107'
$sql$, 'P0001', 'ROLE_IMMUTABLE%');
SELECT recette.expect_true('P0-7b role employe inchange (receptionniste)',
  (SELECT role = 'receptionniste'
     FROM public.users WHERE auth_user_id = '11111111-1111-4111-8111-111111111107'));
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== RECETTE P0/8 : T5 transferts liaison / tenant ==='

SELECT recette.expect_true('T3-pre: trigger prevent_local_super_admin actif (20260919)',
  EXISTS (SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid = t.tgrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE t.tgname = 'prevent_local_super_admin'
             AND NOT t.tgisinternal AND n.nspname = 'public'));

-- T5a — Transfert ENTRANT d'une liaison sur ligne orpheline : isole du
--        declencheur (postgres + GUC posee, RLS court-circuitee) => le garde
--        'liaison Auth non transferable' (P0-6) doit lever.
SET request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SELECT recette.expect_error('T5a transfert entrant auth_user_id (declencheur isole)', $sql$
  UPDATE public.users SET auth_user_id = '33333333-3333-4333-8333-333333333333'
   WHERE id = 'bbbbbbbb-0000-4000-8000-000000000008'
$sql$, 'P0001', 'ROLE_IMMUTABLE: liaison Auth%');
SELECT recette.expect_true('T5a ligne orpheline toujours sans liaison',
  (SELECT auth_user_id IS NULL FROM public.users
    WHERE id = 'bbbbbbbb-0000-4000-8000-000000000008'));
RESET request.jwt.claim.sub;

-- T5b — Sortie de liaison sur SOI-MEME (ligne sans tenant, sous RLS) :
--        la branche auto-provisionnement n'est plus remplie => TENANT_REQUIRED
--        (blocage effectif ; libelle ≠ ROLE_IMMUTABLE : DIVERGENCE DOCUMENTEE
--        vs RECETTE §T5 — le refus reste garanti, le libelle differe).
SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111106';
SET ROLE authenticated;
SELECT recette.expect_error('T5b transfert sortie auth_user_id (ligne sans tenant)', $sql$
  UPDATE public.users SET auth_user_id = '33333333-3333-4333-8333-333333333333'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111106'
$sql$, 'P0001', 'TENANT_REQUIRED%');
SELECT recette.expect_true('T5b liaison inchangee apres tentative',
  (SELECT auth_user_id = '11111111-1111-4111-8111-111111111106'
     FROM public.users WHERE id = 'bbbbbbbb-0000-4000-8000-000000000006'));

-- T5c — Changement de tenant sur SOI-MEME avec tenant (tenant valide) :
--        TENANT_IMMUTABLE (deplacement interdit, meme sans perte d'abonnement).
SELECT recette.expect_error('T5c changement de tenant sur soi-meme avec tenant', $sql$
  UPDATE public.users SET tenant_id = 'aaaaaaaa-0000-4000-8000-000000000002'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111101'
$sql$, 'P0001', 'TENANT_IMMUTABLE%');
SELECT recette.expect_true('T5c tenant toujours T_VALID apres tentative',
  (SELECT tenant_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     FROM public.users WHERE id = 'bbbbbbbb-0000-4000-8000-000000000001'));
RESET ROLE;
RESET request.jwt.claim.sub;

\echo '=== RECETTE P0/9 : service_role — voies de confiance (register, PIN) ==='

-- Aucune GUC posee ici : auth.uid() NULL => bypass P0 + BYPASSRLS.
SET ROLE service_role;
-- S13a — Changement de role legitime (ex. /api/employee-pin, /api/register).
SELECT recette.expect_ok('S13a service_role change le role d un employe', $sql$
  UPDATE public.users SET role = 'menagere'
   WHERE auth_user_id = '11111111-1111-4111-8111-111111111107'
$sql$);
-- S13b — Creation d un OWNER/employe SANS tenant (INSERT onboarding service_role).
SELECT recette.expect_ok('S13b service_role cree un profil admin_residence sans tenant', $sql$
  INSERT INTO public.users (tenant_id, auth_user_id, role, full_name, phone, email, is_active)
  VALUES (NULL, NULL, 'admin_residence', 'Owner Service Recette',
          '+22501010109', 'owner-service@test.invalid', TRUE)
$sql$);
-- S13c — Promotion client -> admin_residence via service_role (voie legale).
SELECT recette.expect_ok('S13c service_role promeut client -> admin_residence', $sql$
  UPDATE public.users SET role = 'admin_residence'
   WHERE auth_user_id = '22222222-2222-4222-8222-222222222202'
$sql$);
RESET ROLE;

SELECT recette.expect_true('S13a role employe devenu menagere (voie service_role)',
  (SELECT role = 'menagere'
     FROM public.users WHERE auth_user_id = '11111111-1111-4111-8111-111111111107'));
SELECT recette.expect_true('S13b profil owner cree sans tenant',
  EXISTS (SELECT 1 FROM public.users WHERE email = 'owner-service@test.invalid'
           AND role = 'admin_residence' AND tenant_id IS NULL));
SELECT recette.expect_true('S13c profil Google promu par service_role',
  (SELECT role = 'admin_residence'
     FROM public.users WHERE auth_user_id = '22222222-2222-4222-8222-222222222202'));

-- Invariant global : AUCUN super_admin n existe localement (20260919).
SELECT recette.expect_true('invariant: aucune ligne super_admin en base',
  (SELECT count(*) FROM public.users WHERE role = 'super_admin') = 0);
-- Compte final : 8 seed + 3 signup T4a + 1 owner S13b = 12.
SELECT recette.expect_true('bilan: 12 utilisateurs au total',
  (SELECT count(*) FROM public.users) = 12);

\echo '=== RECETTE P0 : fichier 20 termine ==='


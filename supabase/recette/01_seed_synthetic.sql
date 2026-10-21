-- ============================================================================
-- RECETTE P0 — Jeu de données 100 % SYNTHÉTIQUE (aucune donnée de production)
-- Fichier : supabase/recette/01_seed_synthetic.sql
--
-- Exécution : en tant que postgres, SANS GUC `request.jwt.claim.sub`
--   => auth.uid() NULL => bypass du déclencheur P0, identique à un import
--   système / service_role. Les scénarios jouent eux les contextes réels.
--
-- Tenants :
--   T_VALID   : abonnement actif, échéance future    (écritures autorisées)
--   T_EXPIRED : expired + soft-lock + échéance passée (écritures bloquées)
--   T_NO_SUB  : AUCUNE ligne subscriptions            (fail-closed)
--   T_PENDING : subscription_status='pending', échéance passée (jamais bloqué)
--   T_STALE   : 'active' mais échéance passée, non verrouillée
--               (cas 20261015 sync_subscription_statuses)
-- Toutes les adresses @test.invalid, téléphones factices, UUID déterministes.
-- ============================================================================
BEGIN;

-- ── Tenants ──────────────────────────────────────────────────────────────────
INSERT INTO public.tenants (id, company_name, contact_name, contact_email, contact_phone, city)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Recette Valid SARL',    'Gérant Valid',   'contact-valid@test.invalid',   '+22501000001', 'Abidjan'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Recette Expired SARL',  'Gérant Expired', 'contact-expired@test.invalid', '+22501000002', 'Abidjan'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'Recette NoSub SARL',    'Gérant NoSub',   'contact-nosub@test.invalid',   '+22501000003', 'Bouaké'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'Recette Pending SARL',  'Gérant Pending', 'contact-pending@test.invalid', '+22501000004', 'Yamoussoukro'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'Recette Stale SARL',    'Gérant Stale',   'contact-stale@test.invalid',   '+22501000005', 'San-Pédro');

-- ── Abonnements (4 sur 5 tenants ; T_NO_SUB volontairement sans ligne) ───────
INSERT INTO public.subscriptions (
  id, tenant_id, plan, status, subscription_status,
  trial_ends_at, current_period_start, current_period_end,
  subscription_end_date, monthly_price, is_soft_locked
) VALUES
  -- Valide : écritures autorisées (A1, T1, P1 lecture, scénarios users)
  ('d4444444-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'entreprise', 'active', 'active',
   now() + interval '30 days', now() - interval '1 day', now() + interval '30 days',
   now() + interval '30 days', 55000, FALSE),
  -- Expiré + soft-lock : écritures bloquées (A2, I1, R1, T2, P1b/P1c)
  ('d4444444-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   'entreprise', 'suspended', 'expired',
   now() - interval '10 days', now() - interval '40 days', now() - interval '5 days',
   now() - interval '5 days', 55000, TRUE),
  -- Pending : jamais bloqué même avec échéance passée (A4)
  ('d4444444-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004',
   'entreprise', 'trial', 'pending',
   now() - interval '5 days', NULL, NULL,
   NULL, 55000, FALSE),
  -- Stale : 'active' non verrouillée mais échéance dépassée => bloqué par la
  -- date ; sync_subscription_statuses (20261015) doit le basculer (1 ligne).
  ('d4444444-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000005',
   'standard', 'trial', 'active',
   now() - interval '3 days', NULL, NULL,
   now() - interval '3 days', 15000, FALSE);

-- ── Utilisateurs (is_active TRUE : requis par get_current_user_tenant_id) ────
INSERT INTO public.users (id, tenant_id, auth_user_id, role, full_name, phone, email, is_active) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111101', 'admin_residence', 'Admin Valid',   '+22501010101', 'admin-valid@test.invalid',   TRUE),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111102', 'admin_residence', 'Admin Expired', '+22501010102', 'admin-expired@test.invalid', TRUE),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003',
   '11111111-1111-4111-8111-111111111103', 'admin_residence', 'Admin NoSub',   '+22501010103', 'admin-nosub@test.invalid',   TRUE),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111104', 'admin_residence', 'Admin Pending', '+22501010104', 'admin-pending@test.invalid', TRUE),
  -- Profils issus d'un signup OAuth/Magic Link (SANS tenant)
  ('bbbbbbbb-0000-4000-8000-000000000005', NULL,
   '11111111-1111-4111-8111-111111111105', 'client', 'Google Un', '+22501010105', 'google1@test.invalid', TRUE),
  ('bbbbbbbb-0000-4000-8000-000000000006', NULL,
   '11111111-1111-4111-8111-111111111106', 'client', 'Google Deux', '+22501010106', 'google2@test.invalid', TRUE),
  -- Employé du tenant valide (cible des tests d'anti-escalade P0-7)
  ('bbbbbbbb-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111107', 'receptionniste', 'Emp Recette', '+22501010107', 'emp@test.invalid', TRUE),
  -- Ligne ORPHELINE (auth_user_id NULL, sans tenant) : garde 'liaison Auth'
  ('bbbbbbbb-0000-4000-8000-000000000008', NULL,
   NULL, 'client', 'Orphelin Recette', '+22501010108', 'orphelin@test.invalid', TRUE);

-- ── Établissements / types / chambres (cohérents pour l'intégrité FK) ────────
INSERT INTO public.accommodations (id, tenant_id, name, city, total_rooms)
VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Résidence Valid',   'Abidjan',     1),
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'Résidence Expired', 'Abidjan',     1),
  ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003', 'Résidence NoSub',   'Bouaké',      1),
  ('cccccccc-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000004', 'Résidence Pending', 'Yamoussoukro', 1);

INSERT INTO public.room_types (id, accommodation_id, name, base_price, capacity)
VALUES
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Standard', 15000, 2),
  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'Standard', 15000, 2),
  ('dddddddd-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'Standard', 15000, 2),
  ('dddddddd-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000004', 'Standard', 15000, 2);

INSERT INTO public.rooms (id, accommodation_id, room_type_id, room_number, status)
VALUES
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', '101', 'available'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', '101', 'occupied'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000003', '101', 'available'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', '101', 'available');

-- ── Clients ──────────────────────────────────────────────────────────────────
INSERT INTO public.clients (id, tenant_id, accommodation_id, full_name, phone, email)
VALUES
  ('ffffffff-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Client Valid',   '+22501020201', 'client-valid@test.invalid'),
  ('ffffffff-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'Client Expired', '+22501020202', 'client-expired@test.invalid'),
  ('ffffffff-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000004', 'Client Pending', '+22501020204', 'client-pending@test.invalid');

-- ── Réservations (dates futures, salles distinctes : contrainte anti-chevauch.) ─
INSERT INTO public.bookings (
  id, tenant_id, accommodation_id, room_id, client_id, booking_code,
  check_in_date, check_out_date, base_price, negotiated_price,
  nights_count, total_amount, status, created_by
) VALUES
  ('a1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'cccccccc-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001',
   'ffffffff-0000-4000-8000-000000000001', 'REC-SEED-0001',
   (now() + interval '30 days')::date, (now() + interval '32 days')::date,
   15000, 15000, 2, 30000, 'confirmed', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('a1111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   'cccccccc-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000002',
   'ffffffff-0000-4000-8000-000000000002', 'REC-SEED-0002',
   (now() + interval '40 days')::date, (now() + interval '42 days')::date,
   15000, 15000, 2, 30000, 'confirmed', 'bbbbbbbb-0000-4000-8000-000000000002'),
  ('a1111111-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000004',
   'cccccccc-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-000000000004',
   'ffffffff-0000-4000-8000-000000000004', 'REC-SEED-0003',
   (now() + interval '50 days')::date, (now() + interval '52 days')::date,
   15000, 15000, 2, 30000, 'confirmed', 'bbbbbbbb-0000-4000-8000-000000000004');

-- ── Paiement existant sur tenant expiré (cible du DELETE T2) ─────────────────
INSERT INTO public.payments (id, tenant_id, booking_id, accommodation_id, amount, payment_method, received_by)
VALUES
  ('b2222222-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
   'a1111111-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002',
   30000, 'cash', 'bbbbbbbb-0000-4000-8000-000000000002');

-- ── Sessions portail client (P1) ─────────────────────────────────────────────
INSERT INTO public.client_sessions (id, tenant_id, booking_id, client_id, access_token, expires_at, is_active)
VALUES
  ('c3333333-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'a1111111-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001',
   'recette-token-valid-2026', now() + interval '35 days', TRUE),
  ('c3333333-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002',
   'a1111111-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000002',
   'recette-token-expired-2026', now() + interval '45 days', TRUE);

-- ── Contrôle d'intégrité du seed (échec = job en erreur) ─────────────────────
SELECT recette.expect_true('seed: 5 tenants',
  (SELECT count(*) FROM public.tenants) = 5);
SELECT recette.expect_true('seed: 4 subscriptions (T_NO_SUB sans ligne)',
  (SELECT count(*) FROM public.subscriptions) = 4);
SELECT recette.expect_true('seed: 8 utilisateurs actifs',
  (SELECT count(*) FROM public.users WHERE is_active) = 8);
SELECT recette.expect_true('seed: 3 réservations + 1 paiement + 2 sessions',
  (SELECT count(*) FROM public.bookings) = 3
  AND (SELECT count(*) FROM public.payments) = 1
  AND (SELECT count(*) FROM public.client_sessions) = 2);

COMMIT;


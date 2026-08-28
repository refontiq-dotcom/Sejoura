import { describe, it, expect } from "vitest";
import pg from "pg";

// ──────────────────────────────────────────────────────────────────────────────
// Tests E2E du badge "Réservations en ligne" (compteur GLOBAL) — exécutés
// uniquement si une base est disponible (variable DATABASE_URL définie).
// Sinon, tests ignorés.
//
// Scénario couvert (de bout en bout) :
//   1. Une réservation en ligne (booking_source = 'external', créée comme le
//      ferait Trouvetou via POST /api/v1/external/bookings) est insérée.
//   2. Le compteur du badge (requête exacte du hook useOnlineBookingBadge)
//      la compte comme NON vue.
//   3. Un employé consulte le module Réservations → markAsViewed upsert une
//      ligne GLOBALE par tenant (staff_notification_states sans user_id).
//   4. Le compteur repasse à 0, pour TOUS les employés (suivi par tenant).
//   5. Une réservation annulée est exclue du compteur.
// ──────────────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

// Constantes de test (écartées des données réelles)
const TEST_PREFIX = "e2e-badge";
const TEST_TENANT_NAME = `${TEST_PREFIX}-${Date.now()}`;

async function run(client: pg.Client, query: string, params?: unknown[]) {
  return client.query(query, params);
}

async function countExternalBookings(client: pg.Client, tenantId: string, lastViewed: string) {
  // Reproduit EXACTEMENT la requête du hook useOnlineBookingBadge
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM bookings
     WHERE tenant_id = $1
       AND booking_source = 'external'
       AND created_at > $2
       AND status NOT IN ('cancelled', 'no_show')`,
    [tenantId, lastViewed]
  );
  return rows[0].n as number;
}

describeDb("Badge réservations en ligne — compteur global (base réelle)", () => {
  let client: pg.Client;
  let tenantId: string;
  let userId: string;
  let accommodationId: string;
  let roomTypeId: string;
  let roomId: string;
  let clientId: string;
  let bookingId: string;

  it("prépare la connexion", async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
  });

  it("crée un environnement de test isolé", async () => {
    // Tenant
    const t = await run(
      client,
      `INSERT INTO tenants (id, company_name)
       VALUES (gen_random_uuid(), $1) RETURNING id`,
      [TEST_TENANT_NAME]
    );
    tenantId = t.rows[0].id;

    // Utilisateur admin (created_by obligatoire)
    const u = await run(
      client,
      `INSERT INTO users (id, tenant_id, role, full_name, phone, email, is_active)
       VALUES (gen_random_uuid(), $1, 'admin_residence', 'Test Badge', $2, $3, true)
       RETURNING id`,
      [tenantId, `${TEST_PREFIX}-phone-${Date.now()}`, `${TEST_PREFIX}-user-${Date.now()}@example.com`]
    );
    userId = u.rows[0].id;

    // Résidence + type de chambre + chambre
    const a = await run(
      client,
      `INSERT INTO accommodations (id, tenant_id, name, is_active)
       VALUES (gen_random_uuid(), $1, 'Test Résidence Badge', true) RETURNING id`,
      [tenantId]
    );
    accommodationId = a.rows[0].id;

    const rt = await run(
      client,
      `INSERT INTO room_types (id, accommodation_id, name, base_price, capacity)
       VALUES (gen_random_uuid(), $1, 'Chambre Test', 25000, 2) RETURNING id`,
      [accommodationId]
    );
    roomTypeId = rt.rows[0].id;

    const r = await run(
      client,
      `INSERT INTO rooms (id, accommodation_id, room_type_id, room_number, status)
       VALUES (gen_random_uuid(), $1, $2, 'CH-01', 'available') RETURNING id`,
      [accommodationId, roomTypeId]
    );
    roomId = r.rows[0].id;

    // Client
    const c = await run(
      client,
      `INSERT INTO clients (id, tenant_id, full_name, phone)
       VALUES (gen_random_uuid(), $1, 'Client Test', $2) RETURNING id`,
      [tenantId, `${TEST_PREFIX}-${Date.now()}`]
    );
    clientId = c.rows[0].id;
  });

  it("la table staff_notification_states est GLOBALE (pas de user_id, unique tenant)", async () => {
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'staff_notification_states' AND column_name = 'user_id'
    `);
    expect(rows.length).toBe(0);

    const { rows: constraints } = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'staff_notification_states'::regclass AND contype = 'u'
    `);
    expect(constraints.some((c) => c.def.includes("tenant_id"))).toBe(true);
  });

  it("insère une réservation en ligne (source Trouvetou) via create_booking", async () => {
    const { rows } = await client.query(
      `SELECT create_booking(
         p_tenant_id := $1,
         p_accommodation_id := $2,
         p_room_id := $3,
         p_client_id := $4,
         p_check_in_date := CURRENT_DATE + 7,
         p_check_out_date := CURRENT_DATE + 9,
         p_base_price := 25000,
         p_negotiated_price := 25000,
         p_nights_count := 2,
         p_total_amount := 50000,
         p_created_by := $5,
         p_booking_source := 'external'
       ) AS booking_id`,
      [tenantId, accommodationId, roomId, clientId, userId]
    );
    bookingId = rows[0].booking_id;
    expect(bookingId).toBeTruthy();
  });

  it("le compteur la compte comme NON vue", async () => {
    // Jamais consulté → la ligne globale n'existe pas → défaut 2024-01-01
    const count = await countExternalBookings(client, tenantId, "2024-01-01T00:00:00Z");
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("markAsViewed upsert une ligne GLOBALE par tenant (sans user_id)", async () => {
    await run(
      client,
      `INSERT INTO staff_notification_states (tenant_id, last_viewed_at)
       VALUES ($1, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET last_viewed_at = NOW()`,
      [tenantId]
    );

    const { rows } = await run(
      client,
      `SELECT tenant_id, last_viewed_at FROM staff_notification_states WHERE tenant_id = $1`,
      [tenantId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantId);

    // Le compteur repasse à 0 pour tout le monde
    const count = await countExternalBookings(client, tenantId, rows[0].last_viewed_at);
    expect(count).toBe(0);
  });

  it("une réservation en ligne annulée est exclue du compteur", async () => {
    const { rows } = await client.query(
      `SELECT create_booking(
         p_tenant_id := $1,
         p_accommodation_id := $2,
         p_room_id := $3,
         p_client_id := $4,
         p_check_in_date := CURRENT_DATE + 14,
         p_check_out_date := CURRENT_DATE + 16,
         p_base_price := 25000,
         p_negotiated_price := 25000,
         p_nights_count := 2,
         p_total_amount := 50000,
         p_created_by := $5,
         p_booking_source := 'external'
       ) AS booking_id`,
      [tenantId, accommodationId, roomId, clientId, userId]
    );
    const cancelledId = rows[0].booking_id;
    await run(client, `UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [cancelledId]);

    // Re-consulter → seule la réservation active (non annulée) compte
    const { rows: state } = await run(
      client,
      `SELECT last_viewed_at FROM staff_notification_states WHERE tenant_id = $1`,
      [tenantId]
    );
    const count = await countExternalBookings(client, tenantId, state[0].last_viewed_at);
    expect(count).toBe(1);
  });

  it("nettoie l'environnement de test", async () => {
    await run(client, `DELETE FROM bookings WHERE tenant_id = $1`, [tenantId]);
    await run(client, `DELETE FROM staff_notification_states WHERE tenant_id = $1`, [tenantId]);
    await run(client, `DELETE FROM clients WHERE tenant_id = $1`, [tenantId]);
    await run(client, `DELETE FROM rooms WHERE accommodation_id = $1`, [accommodationId]);
    await run(client, `DELETE FROM room_types WHERE accommodation_id = $1`, [accommodationId]);
    await run(client, `DELETE FROM accommodations WHERE id = $1`, [accommodationId]);
    await run(client, `DELETE FROM users WHERE id = $1`, [userId]);
    await run(client, `DELETE FROM tenants WHERE id = $1`, [tenantId]);
  });

  it("ferme la connexion", async () => {
    await client.end();
  });
});

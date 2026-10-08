import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { isDoubleBookingError } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Tests d'intégrité anti double-booking (scénarios A→F) — exécutés uniquement
// si une base est disponible (variable DATABASE_URL définie). Sinon, ignorés.
//
// Scénarios :
//   A. 1re réservation confirmed + 2e identique sur la même chambre → refus (P0001)
//   B. 1re réservation pending_payment → la 2e est refusée (statut bloquant)
//   C. pending_payment confirmée puis 2e identique → refus
//   D. statut cancelled → la chambre se libère, la 2e passe
//   E. statut checked_out → la chambre se libère, la 2e passe
//   F. deux créations simultanées → une seule réussit (perdant : contrainte 23P01)
//   G. la contrainte EXCLUDE no_double_booking couvre bien pending_payment
//      (lecture seule — invariants vérifiés, aucun schéma modifié)
//
// A–E s'exécutent dans une transaction ROLLBACK (aucune donnée persistée).
// F engage réellement une écriture engagée puis la supprime (marqueur unique).
// ──────────────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const MARKER = "e2e-double-booking-test";

type Fixture = {
  tenantId: string;
  accommodationId: string;
  roomId: string;
  clientId: string;
  userId: string;
};

type RpcError = Error & { code?: string };

describeDb("Anti double-booking — create_booking (base réelle)", () => {
  let client: pg.Client;
  let fixture: Fixture;
  let checkIn: string;
  let checkOut: string;

  async function createBooking(
    c: pg.Client,
    initialStatus: "confirmed" | "pending_payment" = "confirmed"
  ): Promise<{ id: string }> {
    const { rows } = await c.query(
      `SELECT create_booking(
         p_tenant_id := $1,
         p_accommodation_id := $2,
         p_room_id := $3,
         p_client_id := $4,
         p_check_in_date := $5::date,
         p_check_out_date := $6::date,
         p_base_price := 10000,
         p_negotiated_price := 10000,
         p_nights_count := 2,
         p_total_amount := 20000,
         p_created_by := $7,
         p_number_of_guests := 2,
         p_special_requests := $8,
         p_booking_source := 'external',
         p_initial_status := $9::booking_status
       ) AS booking`,
      [
        fixture.tenantId,
        fixture.accommodationId,
        fixture.roomId,
        fixture.clientId,
        checkIn,
        checkOut,
        fixture.userId,
        MARKER,
        initialStatus,
      ]
    );
    return rows[0].booking as { id: string };
  }

  async function expectCreateRejected(c: pg.Client): Promise<RpcError> {
    try {
      await createBooking(c);
    } catch (error) {
      return error as RpcError;
    }
    throw new Error("create_booking aurait dû être refusé");
  }

  async function withinRollback(fn: () => Promise<void>): Promise<void> {
    await client.query("BEGIN");
    try {
      await fn();
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
    }
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    const { rows } = await client.query(`
      SELECT
        u.tenant_id,
        a.id AS accommodation_id,
        r.id AS room_id,
        c.id AS client_id,
        u.id AS user_id
      FROM public.users u
      JOIN public.accommodations a ON a.tenant_id = u.tenant_id
      JOIN public.rooms r ON r.accommodation_id = a.id
      JOIN public.clients c ON c.tenant_id = u.tenant_id
      WHERE u.tenant_id IS NOT NULL
        AND u.role = 'admin_residence'
        AND u.is_active = true
      ORDER BY u.created_at
      LIMIT 1
    `);
    if (rows.length === 0) {
      throw new Error(
        "Aucun jeu de données (tenant/chambre/client) utilisable trouvé — ensemencer la base avant de lancer ces tests."
      );
    }
    fixture = {
      tenantId: rows[0].tenant_id,
      accommodationId: rows[0].accommodation_id,
      roomId: rows[0].room_id,
      clientId: rows[0].client_id,
      userId: rows[0].user_id,
    };

    // Fenêtre de dates sans conflit sur la chambre fixture
    const { rows: dateRows } = await client.query(
      `SELECT (COALESCE(MAX(check_out_date), CURRENT_DATE) + INTERVAL '30 days')::date AS start
       FROM public.bookings
       WHERE room_id = $1
         AND status IN ('pending_payment', 'confirmed', 'checked_in')`,
      [fixture.roomId]
    );
    const start = new Date(`${String(dateRows[0].start)}T00:00:00Z`);
    checkIn = start.toISOString().slice(0, 10);
    checkOut = new Date(start.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);

    const { rows: okRows } = await client.query(
      `SELECT check_double_booking($1, $2::date, $3::date) AS ok`,
      [fixture.roomId, checkIn, checkOut]
    );
    expect(okRows[0].ok).toBe(true);
  });

  afterAll(async () => {
    if (!client) return;
    // Filet de sécurité : supprime toute réservation porteuse du marqueur
    // (utile si le scénario F est interrompu avant son nettoyage).
    await client
      .query(`DELETE FROM public.bookings WHERE special_requests = $1`, [MARKER])
      .catch(() => undefined);
    await client.end();
  });

  it("A — une seconde réservation confirmed sur la même chambre est refusée", async () => {
    await withinRollback(async () => {
      // Act
      await createBooking(client, "confirmed");
      const err = await expectCreateRejected(client);

      // Assert
      expect(err.code).toBe("P0001");
      expect(isDoubleBookingError(err)).toBe(true);
    });
  });

  it("B — une réservation pending_payment bloque la seconde création", async () => {
    await withinRollback(async () => {
      // Act
      await createBooking(client, "pending_payment");
      const err = await expectCreateRejected(client);

      // Assert
      expect(err.code).toBe("P0001");
      expect(isDoubleBookingError(err)).toBe(true);
    });
  });

  it("C — pending_payment confirmée puis seconde création → refus", async () => {
    await withinRollback(async () => {
      // Act
      const first = await createBooking(client, "pending_payment");
      await client.query(`UPDATE public.bookings SET status = 'confirmed' WHERE id = $1`, [
        first.id,
      ]);
      const err = await expectCreateRejected(client);

      // Assert
      expect(err.code).toBe("P0001");
      expect(isDoubleBookingError(err)).toBe(true);
    });
  });

  it("D — une réservation cancelled libère la chambre", async () => {
    await withinRollback(async () => {
      // Act
      const first = await createBooking(client, "confirmed");
      await client.query(`UPDATE public.bookings SET status = 'cancelled' WHERE id = $1`, [
        first.id,
      ]);
      const second = await createBooking(client, "confirmed");

      // Assert
      expect(second.id).toBeTruthy();
      expect(second.id).not.toBe(first.id);
    });
  });

  it("E — une réservation checked_out libère la chambre", async () => {
    await withinRollback(async () => {
      // Act
      const first = await createBooking(client, "confirmed");
      await client.query(`UPDATE public.bookings SET status = 'checked_out' WHERE id = $1`, [
        first.id,
      ]);
      const second = await createBooking(client, "confirmed");

      // Assert
      expect(second.id).toBeTruthy();
      expect(second.id).not.toBe(first.id);
    });
  });

  it(
    "F — deux créations simultanées : une seule réussit, le perdant est bloqué par la contrainte",
    async () => {
      const clientB = new pg.Client({ connectionString: DATABASE_URL });
      await clientB.connect();
      let loserError: RpcError | null = null;

      try {
        // Act
        await client.query("BEGIN");
        const winner = await createBooking(client, "confirmed");

        const { rows: pidRows } = await clientB.query("SELECT pg_backend_pid() AS pid");
        const pidB: number = pidRows[0].pid;

        const loserPromise = createBooking(clientB, "confirmed").catch((error) => {
          loserError = error as RpcError;
        });

        // Attendre que B soit réellement bloqué sur la contrainte EXCLUDE
        let blocked = false;
        for (let i = 0; i < 50 && !blocked; i++) {
          const { rows } = await client.query(
            `SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1`,
            [pidB]
          );
          if (rows[0]?.wait_event_type === "Lock") {
            blocked = true;
          } else {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        await client.query("COMMIT");
        await loserPromise;

        // Assert
        expect(loserError).not.toBeNull();
        expect(isDoubleBookingError(loserError)).toBe(true);
        if (blocked) {
          // B attendait sur la contrainte EXCLUDE → échec 23P01 (chemin corrigé)
          expect(loserError?.code).toBe("23P01");
        } else {
          // Repli : B a pris connaissance de l'engagement de A → RAISE P0001
          expect(["23P01", "P0001"]).toContain(loserError?.code);
        }

        // Nettoyage de la réservation engagée
        const { rowCount } = await client.query(`DELETE FROM public.bookings WHERE id = $1`, [
          winner.id,
        ]);
        expect(rowCount).toBe(1);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        await clientB.query("ROLLBACK").catch(() => undefined);
        await clientB.end();
      }
    },
    30_000
  );

  it("G — la contrainte EXCLUDE no_double_booking couvre pending_payment (lecture seule)", async () => {
    // Act
    const { rows } = await client.query(`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'no_double_booking'
        AND conrelid = 'public.bookings'::regclass
    `);

    // Assert
    expect(rows.length).toBe(1);
    expect(rows[0].definition).toContain("pending_payment");
  });
});


#!/usr/bin/env node
import pg from "pg";

const { Client } = pg;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for database regression tests.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query("BEGIN");

  const context = await client.query(`
    select
      u.id as user_id,
      u.auth_user_id,
      u.tenant_id,
      u.role,
      a.id as accommodation_id,
      r.id as room_id,
      c.id as client_id
    from public.users u
    join public.accommodations a on a.tenant_id = u.tenant_id
    join public.rooms r on r.accommodation_id = a.id
    join public.clients c on c.tenant_id = u.tenant_id
    where u.tenant_id is not null
      and u.role = 'admin_residence'
      and u.is_active = true
      and r.status = 'available'
    order by u.created_at
    limit 1
  `);
  assert(context.rowCount === 1, "No usable tenant fixture found.");

  const fixture = context.rows[0];

  const otherTenant = await client.query(
    `select id from public.tenants where id <> $1 limit 1`,
    [fixture.tenant_id],
  );
  assert(otherTenant.rowCount === 1, "No second tenant fixture found.");

  await client.query(
    "select set_config('request.jwt.claim.sub', $1, true)",
    [fixture.auth_user_id],
  );
  await client.query("SET LOCAL ROLE authenticated");

  const own = await client.query(
    "select count(*)::int as count from public.accommodations",
  );
  const other = await client.query(
    "select count(*)::int as count from public.accommodations where tenant_id = $1",
    [otherTenant.rows[0].id],
  );
  assert(own.rows[0].count >= 1, "RLS hides the authenticated user's own tenant.");
  assert(other.rows[0].count === 0, "RLS exposes another tenant's accommodation.");

  const bookingArgs = [
    fixture.tenant_id,
    fixture.accommodation_id,
    fixture.room_id,
    fixture.client_id,
    "2099-01-10",
    "2099-01-12",
    10000,
    10000,
    2,
    20000,
    fixture.user_id,
  ];

  const first = await client.query(
    `select * from public.create_booking(
      $1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,
      '14:00'::time,'11:00'::time,1,NULL,'manual'::public.booking_source,
      'confirmed'::public.booking_status,false,NULL,NULL,NULL,NULL,NULL,NULL,'not_required'
    )`,
    bookingArgs,
  );
  assert(first.rowCount === 1, "First booking creation failed.");

  let doubleBookingRejected = false;
  try {
    await client.query(
      `select * from public.create_booking(
        $1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,
        '14:00'::time,'11:00'::time,1,NULL,'manual'::public.booking_source,
        'confirmed'::public.booking_status,false,NULL,NULL,NULL,NULL,NULL,NULL,'not_required'
      )`,
      bookingArgs,
    );
  } catch (error) {
    doubleBookingRejected = String(error?.message ?? error).includes("DOUBLE_BOOKING");
  }
  assert(doubleBookingRejected, "Overlapping booking was not rejected.");

  const transitionBooking = await client.query(
    `select * from public.create_booking(
      $1,$2,$3,$4,current_date,(current_date + 1),
      $5,$5,1,$5,$6,
      '14:00'::time,'11:00'::time,1,NULL,'manual'::public.booking_source,
      'confirmed'::public.booking_status,false,NULL,NULL,NULL,NULL,NULL,NULL,'not_required'
    )`,
    [
      fixture.tenant_id,
      fixture.accommodation_id,
      fixture.room_id,
      fixture.client_id,
      12000,
      fixture.user_id,
    ],
  );
  const bookingId = transitionBooking.rows[0].id;

  const checkedIn = await client.query(
    "select status from public.check_in_booking($1,$2,true,false)",
    [bookingId, fixture.user_id],
  );
  assert(checkedIn.rows[0].status === "checked_in", "Check-in transition failed.");

  const checkedOut = await client.query(
    "select status from public.check_out_booking($1,$2)",
    [bookingId, fixture.user_id],
  );
  assert(checkedOut.rows[0].status === "checked_out", "Check-out transition failed.");

  const unauthorized = await client.query(
    `select id from public.users
     where id <> $1 and tenant_id is not null and is_active = true
     order by created_at limit 1`,
    [fixture.user_id],
  );
  if (unauthorized.rowCount === 1) {
    let rejected = false;
    try {
      await client.query(
        "select * from public.request_subscription_cancellation($1)",
        [unauthorized.rows[0].id],
      );
    } catch {
      rejected = true;
    }
    assert(rejected, "Sensitive cancellation RPC accepted another user's identity.");
  }

  let invalidPaymentRejected = false;
  try {
    await client.query(
      "select * from public.submit_subscription_payment_request($1,$2,$3,$4)",
      [fixture.user_id, "invalid_plan", 1, "000000000"],
    );
  } catch {
    invalidPaymentRejected = true;
  }
  assert(invalidPaymentRejected, "Sensitive payment RPC accepted an invalid plan/amount.");

  await client.query("ROLLBACK");
  console.log("Sejoura database regression suite: PASS");
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Sejoura database regression suite: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end();
}

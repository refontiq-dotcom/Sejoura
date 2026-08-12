#!/usr/bin/env node
// ============================================================================
// SÉJOURA — db:push
// Applique les migrations SQL de supabase/migrations/ en ordre, de façon
// idempotente (tracking dans la table schema_migrations).
//
// Prérequis : variable d'environnement DATABASE_URL (ex: URL de connexion
// PostgreSQL Supabase : postgresql://postgres:password@db.x.supabase.co:5432/postgres)
//
// Usage :
//   DATABASE_URL="postgresql://..." npm run db:push
// ============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = resolve("supabase/migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ La variable DATABASE_URL est requise.");
    console.error('   Exemple : DATABASE_URL="postgresql://postgres:****@db.xxx.supabase.co:5432/postgres" npm run db:push');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Table de suivi des migrations (idempotence)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("Aucune migration trouvée.");
      return;
    }

    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.version));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        skippedCount++;
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`▶ ${file} ... `);

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
          [version, file]
        );
        await client.query("COMMIT");
        console.log("OK");
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("ÉCHEC");
        console.error(`\n❌ Erreur dans ${file}:`);
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }

    console.log(
      `\n✅ Terminé : ${appliedCount} migration(s) appliquée(s), ${skippedCount} déjà en place.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

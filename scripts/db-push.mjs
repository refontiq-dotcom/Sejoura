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
//   DATABASE_URL="postgresql://..." npm run db:push                 applique les migrations manquantes
//   DATABASE_URL="postgresql://..." npm run db:push -- --dry-run    liste ce qui serait appliqué, sans rien exécuter
//   DATABASE_URL="postgresql://..." npm run db:push -- --baseline <version>
//        enregistre comme « déjà appliquées » (SANS les exécuter) toutes les migrations
//        jusqu'à <version> incluse. À utiliser une seule fois sur une base dont le schéma
//        a été appliqué à la main, après avoir vérifié qu'elles y sont bien.
//   --allow-gaps   désactive le garde-fou ci-dessous (déconseillé)
//
// GARDE-FOU : si la base suit des migrations plus récentes que certains fichiers qui,
// eux, ne sont pas suivis, ces fichiers ont presque sûrement été appliqués hors de cet
// outil. Les rejouer pourrait modifier des données ; le script refuse donc de continuer.
// ============================================================================
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = resolve(process.env.MIGRATIONS_DIR ?? "supabase/migrations");

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

    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const allowGaps = args.includes("--allow-gaps");
    const baselineIdx = args.indexOf("--baseline");
    const baselineVersion = baselineIdx >= 0 ? args[baselineIdx + 1] : null;

    // Mode baseline : on enregistre, on n'exécute rien.
    if (baselineIdx >= 0) {
      if (!baselineVersion || baselineVersion.startsWith("--")) {
        console.error("❌ --baseline attend une version, ex. --baseline 20261005_trouvetou_free_all_plans");
        process.exit(1);
      }
      const toRecord = files
        .map((f) => f.replace(/\.sql$/, ""))
        .filter((v) => v <= baselineVersion && !applied.has(v));
      for (const version of toRecord) {
        await client.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [version, `${version}.sql`]
        );
      }
      console.log(
        `✅ Baseline : ${toRecord.length} migration(s) enregistrée(s) comme déjà appliquées (rien n'a été exécuté), jusqu'à ${baselineVersion}.`
      );
      return;
    }

    // Garde-fou : fichiers non suivis mais antérieurs à la dernière version suivie.
    if (applied.size > 0 && !allowGaps) {
      const latestTracked = [...applied].sort().at(-1);
      const gaps = files
        .map((f) => f.replace(/\.sql$/, ""))
        .filter((v) => !applied.has(v) && v < latestTracked);
      if (gaps.length > 0) {
        console.error(
          `\n⛔ ${gaps.length} migration(s) ne sont pas suivies alors que la base en suit de plus récentes (jusqu'à ${latestTracked}).`
        );
        console.error("   Elles ont sans doute été appliquées à la main. Les rejouer pourrait modifier ou effacer des données.");
        console.error(`   Exemples : ${gaps.slice(0, 5).join(", ")}${gaps.length > 5 ? ", …" : ""}`);
        console.error("\n   1. Vérifiez qu'elles sont bien déjà dans la base.");
        console.error("   2. Enregistrez-les sans les exécuter, jusqu'à la dernière réellement appliquée :");
        console.error("        npm run db:push -- --baseline <dernière_version_déjà_appliquée>");
        console.error("   3. Relancez npm run db:push (ou --dry-run pour voir ce qui serait appliqué).");
        process.exit(1);
      }
    }

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      if (applied.has(version)) {
        skippedCount++;
        continue;
      }

      if (dryRun) {
        console.log(`• à appliquer : ${file}`);
        appliedCount++;
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
      dryRun
        ? `\n(dry-run) ${appliedCount} migration(s) seraient appliquée(s), ${skippedCount} déjà en place. Rien n'a été modifié.`
        : `\n✅ Terminé : ${appliedCount} migration(s) appliquée(s), ${skippedCount} déjà en place.`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

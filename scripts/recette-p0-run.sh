#!/usr/bin/env bash
# ============================================================================
# RECETTE P0 — orchestrateur PostgreSQL ISOLE (poste local ou GitHub Actions)
# Fichier : scripts/recette-p0-run.sh
#
# Déroulé : shims -> rejeu intégral des migrations -> 20261015 (test à blanc
#   RECETTE 1b) -> 20261016 -> seed synthétique -> scénarios 10 puis 20.
#
# Garanties :
#   - psql -X -v ON_ERROR_STOP=1 partout : toute erreur SQL = exit != 0 ;
#   - les scénarios lèvent eux-mêmes 'SCEN [...] NON CONFORME' en cas
#     d'écart (voir 00_shims_supabase.sql §7) — détection réelle, pas de grep ;
#   - AUCUNE migration n'est modifiée ni sautée : un échec de rejeu stoppe
#     tout et affiche le fichier fautif (condition 6 du cahier des charges) ;
#   - aucune donnée de production, aucun secret de production : tout vient
#     de supabase/recette/*.sql (UUID/factices @test.invalid).
#
# Variables d'environnement : PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD
#   (le workflow CI fournit un mot de passe éphémère du service postgres:16).
# ============================================================================
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-sejoura_recette}"
export PGHOST PGPORT PGUSER PGDATABASE

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$ROOT/.recette-logs}"
mkdir -p "$LOG_DIR"
SUMMARY="$LOG_DIR/summary.log"
: > "$SUMMARY"

# Exécute un fichier SQL ; journalise ; retourne 1 en cas d'échec.
run_file() {
  local label="$1" file="$2"
  echo "== [$label] $(basename "$file")"
  if psql -X -v ON_ERROR_STOP=1 -f "$file" \
       > "$LOG_DIR/$label.log" 2>&1; then
    cat "$LOG_DIR/$label.log"
    echo "RUNNER $label : OK" >> "$SUMMARY"
    return 0
  fi
  cat "$LOG_DIR/$label.log"
  echo "RUNNER $label : ECHEC (voir .recette-logs/$label.log)" >> "$SUMMARY"
  return 1
}

# ── 0. Préflight connexion ───────────────────────────────────────────────────
echo "== préflight PostgreSQL sur $PGHOST:$PGPORT (base $PGDATABASE)"
ready=0
for _ in $(seq 1 60); do
  if psql -X -q -c 'SELECT 1' >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
if [ "$ready" != "1" ]; then
  echo "BLOQUAGE : PostgreSQL indisponible (psql -h $PGHOST -p $PGPORT -U $PGUSER $PGDATABASE)."
  exit 1
fi
psql -X -q -c 'SELECT version();' | tee "$LOG_DIR/00-version.log"

# ── 1. Shims Supabase (objets de service : auth, storage, rôles, helpers) ────
run_file "01-shims" "$ROOT/supabase/recette/00_shims_supabase.sql" || exit 1

# ── 2. Rejeu INTÉGRAL de supabase/migrations/ (ordre lexical des noms) ──────
#   En cas d'échec : on AFFICHE et on STOPPE. Jamais de saut, jamais de
#   commentaires, jamais de << continue >>. Objets Supabase manquants =>
#   les ajouter au shim 00 (objets de service), pas contourner la migration.
replayed=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  replayed=$((replayed + 1))
  if ! run_file "migration-$(basename "$f" .sql)" "$f"; then
    echo "!!! BLOQUAGE REJEU — migration en échec : $f"
    echo "!!! Ne modifier/sauter/commenter AUCUNE migration (interdiction)."
    echo "!!! Cause la plus probable : objet Supabase absent => l'ajouter à"
    echo "!!! supabase/recette/00_shims_supabase.sql (objet de service)."
    echo "!!! Référence : supabase/migrations_proposees/RECETTE_P0_APPLY.md §5."
    exit 1
  fi
  # Fichier de compatibilité recette : recrée les politiques RLS françaises
  # sur public.users détruites par le DROP TABLE ... CASCADE de
  # 20260701_initial_schema.sql, avant qu'ALTER POLICY de
  # 20260923161234_optimize_p1_indexes_and_rls_policies.sql ne les modifie.
  if [ "$(basename "$f")" = "20260701_initial_schema.sql" ]; then
    run_file "compat-users-rls-fr" "$ROOT/supabase/recette/30-compat-users-rls-fr.sql" || exit 1
  fi
done
echo "== $replayed migrations historiques rejouées sans erreur"

# ── 3. Migration proposée 20261015 (trial expiry) + test à blanc RECETTE 1b ─
run_file "10-p0-20261015" \
  "$ROOT/supabase/migrations_proposees/20261015_trial_expiry_effective_end.sql" || exit 1
echo "== RECETTE 1b : test à blanc sync (base encore sans tenants => 0 attendu)"
psql -X -v ON_ERROR_STOP=1 -q \
  -c "SELECT public.sync_subscription_statuses() AS sync_blanc;" \
  | tee "$LOG_DIR/11-sync-blanc.log"

# ── 4. Migration proposée 20261016 (write lock) + contrôle des triggers ─────
run_file "20-p0-20261016" \
  "$ROOT/supabase/migrations_proposees/20261016_p0_subscription_write_lock.sql" || exit 1
echo "== RECETTE 1c : triggers trg_subscription_writable posés (16 attendus)"
psql -X -v ON_ERROR_STOP=1 -q \
  -c "SELECT count(*) AS nb_trg FROM pg_trigger WHERE tgname = 'trg_subscription_writable' AND NOT tgisinternal;" \
  | tee "$LOG_DIR/21-nb-triggers.log"

# ── 5. Seed 100 % synthétique ────────────────────────────────────────────────
run_file "30-seed" "$ROOT/supabase/recette/01_seed_synthetic.sql" || exit 1

# ── 6. Scénarios : abonnement puis onboarding/rôles ─────────────────────────
run_file "40-scenarios-abonnement" \
  "$ROOT/supabase/recette/10_scenarios_abonnement.sql" || exit 1
run_file "50-scenarios-onboarding-roles" \
  "$ROOT/supabase/recette/20_scenarios_onboarding_roles.sql" || exit 1

# ── 7. Bilan : comptage des assertions + garde anti-« NON CONFORME » ────────
if grep -rq "NON CONFORME" "$LOG_DIR"; then
  echo "BLOQUAGE : au moins un scénario NON CONFORME détecté (logs $LOG_DIR)."
  exit 1
fi
ok_count=$(grep -rho "SCEN \[[^]]*\] OK" "$LOG_DIR" | wc -l | tr -d ' ')
echo "== RECETTE P0 TERMINÉE : $ok_count assertions conformes, 0 non conforme."
echo "RECETTE P0 TERMINEE : $ok_count assertions conformes" >> "$SUMMARY"

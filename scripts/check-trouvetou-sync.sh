#!/usr/bin/env bash
# ============================================================================
# Séjour@ — Diagnostic de la chaîne Séjour@ → Trouvetou (LECTURE SEULE)
#
#   bash scripts/check-trouvetou-sync.sh
#
# N'écrit rien : ni dans Séjour@ ni dans Trouvetou. Le test d'authentification
# utilise un payload volontairement vide, refusé par l'API avant tout Upsert.
#
# Le .env.local est lu par PARSING (pas par `source`) : cela évite d'exécuter
# son contenu et supprime toute interaction avec `set -u`.
# ============================================================================
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

TROUVERTOU_APP="${TROUVERTOU_APP:-https://trouvetou.vercel.app}"
SEJOURA_APP="${SEJOURA_APP:-https://sejoura-lemon.vercel.app}"
ENV_FILE="${ENV_FILE:-.env.local}"

# Valeur brute d'une variable du .env, sans l'interpréter.
env_value() {
  local name="$1" line
  [ -f "$ENV_FILE" ] || return 1
  line="$(grep -m1 -E "^[[:space:]]*${name}[[:space:]]*=" "$ENV_FILE" 2>/dev/null || true)"
  [ -n "$line" ] || return 1
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  line="${line%"${line##*[![:space:]]}"}"
  printf '%s' "$line"
}

ok()   { printf '  \033[32mOK\033[0m      %s\n' "$1"; }
ko()   { printf '  \033[31mECHEC\033[0m   %s\n' "$1"; }
warn() { printf '  \033[33mATTENTION\033[0m %s\n' "$1"; }

API_KEY="$(env_value TROUVETOU_API_KEY || true)"
SYNC_URL="$(env_value TROUVETOU_SYNC_URL || true)"
SYNC_SECRET="$(env_value TROUVETOU_SYNC_SECRET || true)"
DB_URL="$(env_value SEJOURA_SUPABASE_URL || true)"
[ -n "$DB_URL" ] || DB_URL="$(env_value NEXT_PUBLIC_SUPABASE_URL || true)"
DB_KEY="$(env_value SEJOURA_SUPABASE_SERVICE_ROLE_KEY || true)"
[ -n "$DB_KEY" ] || DB_KEY="$(env_value SUPABASE_SERVICE_ROLE_KEY || true)"

echo "═══ 1. Variables locales ($ENV_FILE) ═══"
[ -n "$SYNC_URL" ]    && ok "TROUVETOU_SYNC_URL est définie"    || ko "TROUVETOU_SYNC_URL est ABSENTE (requis pour une sync locale)"
[ -n "$API_KEY" ]     && ok "TROUVETOU_API_KEY est définie"     || ko "TROUVETOU_API_KEY est ABSENTE"
[ -n "$SYNC_SECRET" ] && ok "TROUVETOU_SYNC_SECRET est définie" || warn "TROUVETOU_SYNC_SECRET est ABSENTE (seul le cron peut déclencher)"

echo
echo "═══ 2. Clé API acceptée par Trouvetou ═══"
SYNC_ENDPOINT="${SYNC_URL:-$TROUVERTOU_APP/api/v1/sync}"
if [ -z "$API_KEY" ]; then
  ko "Impossible de tester : aucune clé"
else
  auth_response="$(timeout 20 curl -s -m 15 -X POST "$SYNC_ENDPOINT" \
    -H 'Content-Type: application/json' \
    -H "x-trouvetou-api-key: $API_KEY" \
    -d '{"items":[]}' 2>/dev/null || true)"
  case "$auth_response" in
    *INVALID_API_KEY*)
      ko "Clé REFUSÉE par Trouvetou (401 INVALID_API_KEY)"
      echo "          → clé jamais alignée, régénérée, ou pepper modifié."
      echo "          → pivoter : Trouvetou/scripts/rotate-sejoura-key.sh" ;;
    *"items"*|*"non vide"*)
      ok "Clé acceptée (le payload vide est refusé, comme attendu)" ;;
    *MISSING_API_KEY*)
      ko "En-tête non transmis — variable incohérente" ;;
    *)
      warn "Réponse inattendue : ${auth_response:0:150}" ;;
  esac
fi

echo
echo "═══ 3. Déploiement Séjour@ (endpoint de sync) ═══"
config_response="$(timeout 20 curl -s -m 15 "$SEJOURA_APP/api/trouvetou/sync" 2>/dev/null || true)"
case "$config_response" in
  *'"configured":true'*)  ok "Déploiement configuré (endpoint présent, variables posées)" ;;
  *'"configured":false'*) ko "Déploiement NON configuré (env vars manquantes sur Vercel)" ;;
  *) warn "Endpoint inaccessible : ${config_response:0:120}" ;;
esac

echo
echo "═══ 4. Types de chambre éligibles dans Séjour@ ═══"
if [ -n "$DB_URL" ] && [ -n "$DB_KEY" ]; then
  eligible="$(timeout 25 curl -s -m 20 -G \
    -H "apikey: $DB_KEY" -H "Authorization: Bearer $DB_KEY" \
    --data-urlencode 'select=id,name,is_listed_on_trouvetou,accommodations(is_active,tenant_id,tenants(subscriptions(status)))' \
    --data-urlencode 'is_listed_on_trouvetou=eq.true' \
    "$DB_URL/rest/v1/room_types" 2>/dev/null | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const rows=JSON.parse(d);
    if(!Array.isArray(rows)){console.log('?');process.exit(0)}
    // PostgREST renvoie un objet quand l'embed ne correspond qu'a une ligne.
    const active=(t)=>{const s=t&&t.subscriptions;if(!s)return false;
      return (Array.isArray(s)?s:[s]).some(x=>x&&x.status==='active');};
    console.log(rows.filter(r=>r.is_listed_on_trouvetou===true
      && r.accommodations&&r.accommodations.is_active===true
      && active(r.accommodations.tenants)).length);
  } catch(e){console.log('?')}
})" 2>/dev/null || true)"
  case "$eligible" in
    '?') warn "Comptage illisible (réponse inattendue)" ;;
    0)  warn "0 type éligible : rien à publier pour l'instant" ;;
    *)  ok "$eligible type(s) de chambre éligible(s) à la diffusion" ;;
  esac
else
  warn "Base Séjour@ inaccessible (variables manquantes) — étape ignorée"
fi

echo
echo "═══ 5. Annonces visibles sur Trouvetou ═══"
visible="$(timeout 20 curl -s -m 15 "$TROUVERTOU_APP/api/catalog/listings?categories=hotel,residence&limit=100" 2>/dev/null \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log((JSON.parse(d).data||[]).length)}catch(e){console.log('?')}})" 2>/dev/null || true)"
if [ "$visible" = "0" ]; then
  warn "0 hôtel/résidence visible — attendu tant que la clé est refusée (étape 2)"
elif [ "$visible" = "?" ]; then
  warn "Catalogue Trouvetou illisible"
else
  ok "$visible annonce(s) hôtel/résidence visibles sur Trouvetou"
fi

echo
echo "═══ Prochaine action ═══"
echo "  Étape 2 en ÉCHEC ? Pivoter la clé, puis la poser à DEUX endroits :"
echo "    1. /home/dukoua/Projets/Séjoura/.env.local"
echo "    2. Vercel → projet sejoura-lemon → TROUVETOU_API_KEY, puis redeployer"
echo "  Rotation (nécessite REFONTIQ_CONTROL_CENTER_SECRET, dans Vercel projet"
echo "  Trouvetou, absent de tout .env local) :"
echo "    cd /home/dukoua/Projets/Trouvetou"
echo "    REFONTIQ_CONTROL_CENTER_SECRET='…' bash scripts/rotate-sejourra-key.sh"
echo "  Puis déclencher et recontrôler :"
echo "    curl -X POST $SEJOURA_APP/api/trouvetou/sync -H \"x-sync-secret: <SECRET>\""
echo "    bash scripts/check-trouvetou-sync.sh"
exit 0


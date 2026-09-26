# Migration des médias : Supabase Storage → Cloudflare R2

**Date** : 25/09/2026 — **Projet** : Séjoura (Next.js 16 / React 19 / Supabase / bun)
**Statut** : plan validé côté audit — implémentation en attente des credentials R2.

## 1. Architecture cible

| Composant | Rôle après migration |
|---|---|
| **Supabase** | Base de données, Auth, données métier, factures PDF (bucket privé `invoices`) |
| **Cloudflare R2** | Photos de chambres, logos d'établissement, affiches publicitaires, captures d'écran de suggestions |
| **Séjoura** | Stocke uniquement des **URLs/références** vers les médias (aucune donnée binaire) |

Choix R2 : stockage S3-compatible (`@aws-sdk/client-s3`, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, région `auto`), **zéro frais de sortie**, URL publique via domaine R2.

## 2. État des lieux (audit du code, 25/09/2026)

### Flux médias utilisateurs → à migrer vers R2

| Flux | Route | Bucket Supabase | Colonne cible | Accès |
|---|---|---|---|---|
| Logo établissement | `POST /api/upload-logo` | `logos` (public) | `tenants.logo_url` | admin_residence |
| Photos de chambres | `POST /api/v1/trouvetou/upload-photo` | `room-photos` (public) | `room_types.featured_images` (jsonb array) | session + tenant |
| Affiches publicitaires | `POST /api/ads/upload` | `room-photos` (public) | `advertisements.image_url` | admin_residence |
| Captures boîte à idées | `POST /api/feature-requests/upload` | `feature-screenshots` (public) | `feature_requests.screenshot_url` | session |

Points notables :
- Le code actuel écrit toujours l'**URL publique** Supabase (`getPublicUrl`) dans la colonne → la migration se limite à remplacer la destination d'écriture et à réécrire les URLs existantes en base.
- `POST /api/feature-requests/upload` crée le bucket à la volée (`createBucket` idempotent) — côté R2 le bucket doit être créé une fois manuellement.
- Les avatars (`users.avatar_url`) viennent des métadonnées OAuth (Google etc.) : **aucun objet Storage, rien à migrer**.

### Flux qui reste dans Supabase

- **Factures PDF** : `POST /api/invoice/generate` écrit le PDF dans le bucket **privé** `invoices`, `GET /api/invoice/download/[token]` le sert en flux via le client admin (service_role). `invoices.pdf_url` contient un **chemin relatif** (pas une URL). Conforme à la règle « factures PDF si nécessaire → Supabase » : on ne touche pas à ce flux.

### Validation avant toute modification (baseline)

| Contrôle | Résultat |
|---|---|
| TypeScript (`bun tsc -b --noEmit`) | ✅ 0 erreur |
| ESLint (`bun run lint`) | ✅ 0 erreur, 51 warnings pré-existants |
| Tests unitaires (`bun run test`) | ✅ 108 passés / 16 e2e ignorés (13 fichiers) |

## 3. Plan de migration (sans rupture)

### Phase 1 — Infrastructure de code (aucun impact utilisateur) — ✅ FAIT
1. ✅ Installer `@aws-sdk/client-s3` (aucune autre dépendance).
2. ✅ Créer `src/lib/storage/r2.ts` : client S3 configuré pour R2 (endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, région `auto`) + helpers `uploadToR2Media({ key, file })` et `publicMediaUrl(key)` (base = `R2_PUBLIC_BASE_URL`), plus helpers purs `extensionFromMime`, `joinMediaKey`, `normalizeMime`, `buildPublicMediaUrl`, `getMediaStorageDriver`, `isR2Configured`. Fail-safe : sans variables d'environnement, le driver `r2` répond une erreur explicite (500) au lieu de basculer silencieusement.
3. Variables d'environnement (Settings → Environment, jamais dans les fichiers .env du dépôt) :
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_R2_ACCESS_KEY_ID`
   - `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_MEDIA` (bucket public médias)
   - `R2_PUBLIC_BASE_URL` (URL publique du bucket/domaine R2)
4. ✅ **Feature flag** `MEDIA_STORAGE_DRIVER` (`supabase` par défaut, `r2` pour basculer) : chaque route d'upload choisit le driver au runtime. Rien ne change tant que le flag n'est pas positionné → zéro risque de déploiement.

### Phase 2 — Bascule des 4 routes d'upload — ✅ FAIT (code branché, en attente de credentials pour tester en réel)
- ✅ `upload-logo`, `trouvetou/upload-photo`, `ads/upload`, `feature-requests/upload` : même validation (types MIME, tailles), même forme de clé (`{tenantId}/.../{uuid}.{ext}`), seule la destination change.
- ✅ Réponses HTTP **identiques** (`{ logoUrl }`, `{ url }`) → aucun changement côté client, aucun changement d'UI.
- Les nouveaux objets R2 reprennent `Cache-Control: 3600`, fidèle au comportement Supabase historique. (Un cache long `immutable` serait possible pour les clés UUID, mais dangereux pour `logo.{ext}` qui est réécrit en upsert — optimisation à reconsidérer en Phase 4 si besoin.)

### Phase 3 — Migration des objets existants (script one-shot)
1. `scripts/migrate-storage-to-r2.mjs` : parcourt chaque bucket Supabase, copie chaque objet vers R2 (lecture admin → `PutObject`), journal ligne par ligne, **ne supprime rien**.
2. Idempotent (reprise possible), dry-run par défaut (`--dry-run`), exécution réelle sur confirmation.
3. Réécriture des URLs en base (SQL exécuté après copie vérifiée) :
   ```sql
   -- Exemple tenants.logo_url (idem pour featured_images, image_url, screenshot_url)
   UPDATE tenants
     SET logo_url = regexp_replace(logo_url, '^https://[^/]+/storage/v1/object/public/logos/', '<R2_PUBLIC_BASE_URL>/')
     WHERE logo_url LIKE 'https://%supabase.co/storage/v1/object/public/logos/%';
   ```
   Backup des colonnes avant (`CREATE TABLE ... AS SELECT` ou dump) — obligatoire.
4. **Re-synchronisation Trouvetou** : `advertisements.image_url` est déjà synchronisée vers l'API Trouvetou externe. Après réécriture, relancer la resync des pubs actives pour que la vitrine affiche les nouvelles URLs.

### Phase 4 — Validation puis retrait (jamais automatique)
- Test de chaque URL réécrite (échantillon 100 % si volume faible) : HTTP 200 + Content-Type correct.
- Période d'observation : driver `r2` en prod, buckets Supabase **conservés intacts**.
- Suppression des buckets Supabase **uniquement** après confirmation explicite du propriétaire + preuve d'absence d'usage (logs Storage à 0 requête). Rien n'est supprimé par cet agent.

## 4. Checklist de validation

| Élément | État | Note |
|---|---|---|
| TypeScript | ✅ fait (baseline) | `bun tsc -b --noEmit` : 0 erreur ; revalidé après Phases 1+2 |
| ESLint | ✅ fait (baseline) | 0 erreur / 51 warnings pré-existants ; pas de nouvelle erreur tolérée ; revalidé après Phases 1+2 |
| Unit tests | ✅ fait (baseline + Phase 1) | 123 tests verts dont 15 nouveaux tests des helpers R2 (`tests/r2-helpers.test.ts`) |
| Phases 1+2 (code) | ✅ fait | `@aws-sdk/client-s3` installé, `src/lib/storage/r2.ts` créé, flag `MEDIA_STORAGE_DRIVER` branché dans les 4 routes, réponses inchangées |
| Build | ⏳ à la demande | `bun run build` lancé uniquement sur demande explicite (règle projet) |
| Migration tests | ⏳ prévu | dry-run script Phase 3 : objets listés = objets copiés, checksums, journal |
| Upload tests | ⏳ bloqué (credentials) | les 4 routes avec flag `r2` : 200 + URL joignable + colonne mise à jour — nécessite les 5 variables d'environnement R2 |
| Delete tests | ⏳ prévu | logo remplacé (upsert logo.{ext}) et suppression de type de chambre : aucun objet orphelin critique constaté — à instrumenter |

## 5. Risques restants (à résoudre explicitement)

1. **Credentials R2 absents** : la Phase 1 (code + tests unitaires) est réalisable immédiatement ; les Phases 2-4 exigent `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `R2_BUCKET_MEDIA`, `R2_PUBLIC_BASE_URL`. Sans eux, le driver `r2` ne peut pas être testé en réel — le code reste derrière le flag `supabase`, aucun risque.
2. **Compatibilité Vercel/Next.js** : `@aws-sdk/client-s3` fonctionne dans les Route Handlers Node.js. Vérifier que les 4 routes ne sont pas déclarées en Edge runtime (elles ne le sont pas aujourd'hui).
3. **URLs synchronisées vers Trouvetou** : les affiches publiées pointent l'URL stockée côté Trouvetou → re-sync obligatoire après réécriture (Phase 3.4), sinon vitrine avec URLs mortes.
4. **Cache CDN/navigateur des anciennes URLs** : après réécriture, les navigateurs peuvent servir l'ancienne image (cache-control 3600 côté Supabase) → fenêtre de décalage ~1 h, sans perte de donnée.
5. **Bucket `feature-screenshots` créé à la volée** : côté R2, création manuelle une fois + règle d'accès public lecture.
6. **Delete tests partiellement couverts** : le code actuel ne supprime pas les anciens objets lors d'un remplacement (logo : upsert même chemin ; photos : ajout seulement). Les orphelins existent déjà côté Supabase — la migration ne les corrige pas par défaut (nettoyage optionnel Phase 4, sur décision).
7. **Factures** : flux volontairement laissé dans Supabase (bucket privé + service via service_role). Si une migration vers R2 privé était souhaitée plus tard, elle nécessiterait un proxy signé — hors périmètre actuel.

# Système média de Séjoura — photos classiques et visites 360°

**Date** : 06/10/2026 — **Projet** : Séjoura (Next.js 16 / React 19 / Supabase / sharp)
**Statut** : implémenté (branche `feat/sejoura-photo-360`)

Ce document décrit le fonctionnement réel du système média. Il complète
`migration-medias-r2.md` (qui traite du *driver* de stockage R2 vs Supabase).

---

## 1. Vue d'ensemble

Séjoura gère **deux catégories de médias distinctes**, qui ne se mélangent
jamais :

```text
Photos classiques            Visite 360°
──────────────────           ───────────
room_types.featured_images   room_type_panoramas
champ `images`                champ `attributes.panoramas`
vignette d'annonce            visionneuse immersive
ratio libre                   ratio 2:1 imposé
optimisées (WebP)             stockées BIT POUR BIT
```

**Invariant central** : un panorama ne devient jamais une photo classique.
`photo_360 → images[0]` n'existe nulle part dans le code.

---

## 2. Photos classiques (inchangées)

| Étape | Implémentation |
|---|---|
| Upload | `POST /api/v1/trouvetou/upload-photo` |
| Pipeline | `src/lib/media/index.ts` → `handleMediaUpload({ kind: "photo" })` |
| Validation | magic bytes + taille (12 Mo) + décodage sharp |
| Optimisation | redimensionnement 1920 px + **WebP q80** |
| Stockage | `{tenantId}/room-types/{uuid}.webp` |
| Base | `room_types.featured_images TEXT[]` (max 4, `CHECK`) |
| Publication | gating `is_listed_on_trouvetou` + `isTrouvetouEligible` |
| Trouvetou | `images: string[]` |

Aucune modification de ce chemin. Les tests de non-régression
(`tests/media-pipeline.test.ts`, `tests/room-type-schema.test.ts`) continuent de
couvrir ce flux.

---

## 3. Visites 360°

### 3.1 Principe : Séjoura ne fabrique pas de panorama

```text
Caméra 360° / app mobile / logiciel externe
        ↓
   image équirectangulaire 2:1
        ↓
      Séjoura
        ↓
  validation serveur
        ↓
  stockage (octets d'origine)
        ↓
    publication
        ↓
    Trouvetou
        ↓
  PanoramaViewer
```

Il n'y a **ni stitching, ni IA d'amélioration d'image, ni réencodage** dans
Séjoura. Le système reçoit une image déjà panoramique et la sert telle quelle.

### 3.2 Format accepté

| Contrainte | Valeur |
|---|---|
| Format réel | JPEG, PNG, WebP (GIF et SVG exclus) |
| Ratio | 2:1, tolérance ± 0,02 |
| Résolution minimale | 3000 × 1500 px |
| Taille maximale | 40 Mo |

### 3.3 Validation serveur

`src/lib/media/panorama.ts` — fonction pure `validatePanoramaBytes()` :

1. **Taille** — rejette fichier vide / tronqué / > 40 Mo, avant tout décodage.
2. **Magic bytes** — format réel déduit des octets. Le `Content-Type` du
   navigateur et le **nom du fichier sont ignorés** : un fichier nommé `360.jpg`
   n'est pas un panorama pour autant.
3. **Décodage réel** — `sharp(input, { failOn: "error" }).raw()` parcourt tous
   les pixels : un fichier tronqué échoue même si ses en-têtes sont valides.
4. **Ratio 2:1** — même tolérance que l'ingestion Trouvetou
   (`|w/h - 2| <= 0.02`), pour qu'aucun fichier accepté ici ne soit refusé là-bas.
5. **Résolution minimale** — 3000 × 1500.

> **Limite assumée et documentée** : le système vérifie qu'un fichier respecte
> les caractéristiques techniques attendues d'un panorama équirectangulaire,
> mais **ne peut pas prouver mathématiquement que l'image provient réellement
> d'une caméra 360°**. Une photo plate recadrée en 2:1 passerait tous ces
> contrôles. Le ratio 2:1 est une condition *nécessaire*, pas une *preuve*.

### 3.4 Continuité de jointure (indicateur, non bloquant)

`computeSeamDelta()` mesure l'écart moyen entre la colonne de droite et la
colonne de gauche (l'azimut boucle sur 360°, elles doivent se ressembler).
Échantillonné sur 200 lignes maximum : coût constant, même en 6000 × 3000.

La valeur est **enregistrée et affichée, mais ne bloque jamais la publication** :
une couture imparfaitement raccordée est un défaut de qualité, pas un motif de
rejet. Bloquer sur ce critère rejetterait de bons panoramas.

### 3.5 Machine d'état

```text
uploaded ──► validated ──► published
   │             │
   └─────────────┴──► rejected
                      published ──► superseded
```

| Depuis | Vers |
|---|---|
| `uploaded` | `validated`, `rejected` |
| `validated` | `published`, `rejected`, `superseded` |
| `published` | `superseded` |
| `rejected` | *(aucune)* |
| `superseded` | *(aucune)* |

Un panorama **rejeté ne peut jamais être publié** : garanti par la table des
transitions, par la contrainte SQL `chk_room_type_panoramas_status` et par le
filtre `status = 'published'` de la synchronisation.

### 3.6 Stockage

- Driver : `resolveMediaStorage()` — **R2 si configuré, sinon Supabase**
  (aucun nouveau système de stockage, aucun nouveau bucket).
- Bucket partagé `room-photos`, préfixe de clé `panoramas/` : espaces de noms
  disjoints, migration de stockage inutile.
- Clé : `{tenantId}/panoramas/{uuid}.{ext}` — extension issue des magic bytes.
- **Aucun réencodage** : les octets écrits sont ceux reçus. C'est délibérément
  différent du pipeline classique, qui optimise en WebP : réencoder fausserait
  la projection équirectangulaire et modifierait l'image de l'utilisateur.

### 3.7 Remplacement sûr

`publishPanorama()` — l'ancien panorama n'est jamais retiré avant que le
nouveau soit effectivement en place :

1. l'ancien passe `published` → `superseded` ;
2. le nouveau passe `validated` → `published` ;
3. **si l'étape 2 échoue, l'ancien est remis en `published`** ;
4. le fichier de l'ancien n'est supprimé qu'ensuite, en best-effort.

Conséquence : un échec d'upload ne peut pas laisser l'annonce sans visite 360°.

### 3.8 Règle de publication

**Un établissement ne peut pas être publié sur Trouvetou avec un panorama seul.**
La règle métier existante est conservée : `chk_trouvetou_requires_photo` exige
au moins une photo **classique**. Raison : côté Trouvetou, `room-card.tsx` prend
`images[0]` comme vignette — une annonce sans image classique s'afficherait avec
une image de substitution. Cette règle n'a **pas** été modifiée.

---

## 4. Base de données

Migration : `supabase/migrations/20261006_room_type_panoramas.sql`

### Table `room_type_panoramas`

| Colonne | Type | Rôle |
|---|---|---|
| `id` | UUID PK | identifiant stable du média |
| `room_type_id` | UUID | type de chambre |
| `accommodation_id` | UUID | établissement |
| `tenant_id` | UUID | propriétaire |
| `media_type` | TEXT | toujours `photo_360` |
| `projection` | TEXT | toujours `equirectangular_2_1` |
| `storage_driver` | TEXT | `r2` ou `supabase` |
| `storage_bucket` / `storage_key` | TEXT | stockage |
| `public_url` | TEXT | URL publique |
| `content_type` | TEXT | **issu des magic bytes** |
| `byte_size` | BIGINT | poids |
| `width` / `height` | INTEGER | dimensions mesurées |
| `seam_delta` | DOUBLE | indicateur de couture (non bloquant) |
| `status` | TEXT | machine d'état |
| `validation_error` | TEXT | motif de rejet |
| `validated_at`, `published_at`, `superseded_at` | TIMESTAMPTZ | horodatages |
| `original_filename` | TEXT | traçabilité uniquement |

### Contraintes

- `chk_room_type_panoramas_ratio` — `100*width BETWEEN 198*height AND 202*height`
  (tolérance identique à Trouvetou ; seuls `uploaded`/`rejected` en sont exemptés)
- `chk_room_type_panoramas_min_resolution` — `width >= 3000 AND height >= 1500`
- `chk_room_type_panoramas_status` — liste blanche des statuts
- `chk_room_type_panoramas_timestamps` — cohérence `validated_at` / `status`
- `chk_room_type_panoramas_rejected_reason` — un rejet porte toujours un motif
- `chk_room_type_panoramas_seam_delta` — plage 0–255

### Index

| Index | Rôle |
|---|---|
| `idx_room_type_panoramas_room_type` | liste des visites d'un type |
| `idx_room_type_panoramas_published` | panoramas publiés du tenant |
| `idx_room_type_panoramas_one_published` **(UNIQUE, partiel)** | au plus **un** panorama publié par type de chambre |
| `idx_room_type_panoramas_rejected` | nettoyage des rejetés |

### Intégrité multi-tenant

Deux clés étrangères **composites** garantissent au niveau base qu'un panorama
ne peut pas être rattaché à un autre établissement :

```sql
FOREIGN KEY (room_type_id, accommodation_id) → room_types (id, accommodation_id)
FOREIGN KEY (accommodation_id, tenant_id)   → accommodations (id, tenant_id)
```

Substituer un identifiant par celui d'un autre tenant viole la contrainte : la
tentative est bloquée par PostgreSQL, pas seulement par l'API. Les cibles
`(id, tenant_id)` et `(id, accommodation_id)` sont des unicités plus larges que
les clés primaires existantes : elles sont donc toujours satisfaites, sans
réécriture de table.

### RLS

`ENABLE ROW LEVEL SECURITY` + 5 policies calquées sur `accommodations` :
`select` (tenant + super admin), `insert` / `update` / `delete`
(`tenant_id = get_current_user_tenant_id()` **ET** rôle `admin_residence`).

Les routes API utilisent le client `service_role` (RLS contourné) : ces policies
protègent les accès directs via le client navigateur, qui est le vrai périmètre
d'attaque.

### Ce que la migration ne fait PAS

- Elle ne supprime pas `room_types.panorama_tour` (colonne existante en
  production, toujours transmise dans `attributes.panorama_tour`).
- Elle ne touche pas aux photos classiques ni à `chk_trouvetou_requires_photo`.
- Elle ne crée aucun bucket.


---

## 5. Synchronisation Trouvetou

`src/lib/trouvetou/sync.ts`

### Bug corrigé

Le code sélectionnait quatre colonnes **qui n'existaient dans aucune migration** :

```ts
panorama_360_url, panorama_360_preview_url,
panorama_360_mobile_url, panorama_360_hd_url
```

PostgREST répondait `42703 column does not exist` et **toute la synchronisation
Trouvetou échouait**, sans rien envoyer. Ces colonnes ont été retirées du SELECT,
du type `SyncRow`, des attributs du payload et de `src/types/database.ts`.
Un test de non-régression (`tests/panorama-media.test.ts`) empêche leur retour.

### Payload généré

```jsonc
{
  "items": [
    {
      "external_id": "rt:<room_type_id>",
      "title": "Deluxe — Hôtel Exemple",
      "base_price": 25000,
      "images": ["https://…/chambre.webp"],   // photos CLASSIQUES uniquement
      "attributes": {
        "capacity": 2,
        "amenities": ["wifi"],
        "total_rooms": 4,
        "panoramas": [                          // champ DÉDIÉ
          {
            "id": "11111111-2222-4333-8444-555555555555",
            "media_type": "photo_360",
            "projection": "equirectangular_2_1",
            "url": "https://…/panoramas/abc.jpg",
            "width": 6000,
            "height": 3000,
            "content_type": "image/jpeg",
            "room_id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            "validated_at": "2026-10-06T10:00:00.000Z"
          }
        ],
        "available_rooms_now": 2
      },
      "is_available": true,
      "category_slug": "hotel"
    }
  ]
}
```

Côté Trouvetou, `parsePanoramas()` valide ce payload et `room-card.tsx` affiche
`room.panoramas[0]` dans `PanoramaViewer`. **Aucune modification de Trouvetou
n'a été nécessaire.**

### Fonction de séparation

`splitTrouvetouMedia()` (`src/lib/media/panorama.ts`) est le point unique de
vérité :

- nettoie et déduplique les photos classiques, plafonne à 4 ;
- construit les panoramas publiés ;
- **retire de la galerie toute URL de panorama** (défense en profondeur) ;
- repli historique sur le logo si aucune photo de chambre.

---

## 6. API

| Route | Méthode | Rôle |
|---|---|---|
| `/api/v1/trouvetou/room-panoramas` | `POST` | upload + validation (`panorama`, `roomTypeId`) |
| `/api/v1/trouvetou/room-panoramas` | `GET` | état des visites (`?roomTypeId=`) |
| `/api/v1/trouvetou/room-panoramas` | `DELETE` | suppression (`?id=&roomTypeId=`) |
| `/api/v1/trouvetou/room-panoramas/publish` | `POST` | publication (`panoramaId`, `roomTypeId`) |

Sécurité : authentification par session Supabase ; le `tenantId` vient toujours
de la base, jamais du client ; un identifiant appartenant à un autre
établissement répond **404** (et non 403, qui confirmerait son existence).

---

## 7. Performance

- **Aucun panorama n'est jamais chargé automatiquement.** Le composant
  `PanoramaManager` ne rend **aucune balise `<img>`** : il n'affiche que des
  métadonnées (dimensions, poids, statut). La visite n'est consultable qu'au
  travers de la visionneuse de Trouvetou, à la demande.
- Les photos classiques ne sont donc jamais ralenties par le système 360°.
- `computeSeamDelta` est échantillonné (200 lignes) : coût constant.
- Les clés de stockage contiennent un UUID → `Cache-Control` immuable long
  (`31536000`) sur R2.

---

## 8. Limites connues

1. **Le ratio 2:1 n'est pas une preuve d'origine 360°** (voir §3.3).
2. `seam_delta` est informatif : une mauvaise couture n'est pas bloquante.
3. Pas de rate limiting sur la route d'upload, par cohérence avec les routes
   d'upload existantes (`upload-photo`, `ads/upload`). La protection repose sur
   l'authentification, le contrôle de propriété et la validation.
4. Un panorama rejeté n'est jamais stocké : il n'y a donc pas de trace en base
   des fichiers refusés, seulement un message utilisateur.
5. La migration **n'a pas été appliquée** sur une base Supabase réelle (pas
   d'accès `DATABASE_URL` dans cet environnement).


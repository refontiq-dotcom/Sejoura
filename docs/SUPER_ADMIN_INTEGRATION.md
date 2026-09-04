# 🚀 Guide d'Intégration Standard Multi-Projets (Super Admin REFONTIQ)

Ce document définit la norme pour connecter tout nouveau SaaS de l'écosystème REFONTIQ (Séjoura, Schooly, Trouvetou, Docly, PronoMaster, etc.) au Dashboard Super Admin central.

---

## 🛠️ Architecture en 5 Étapes "Plug & Play"

Pour chaque nouveau projet SaaS à intégrer dans le Super Admin, respecter strictement ces 5 étapes :

### 1. Variables d'Environnement (`.env.local` & Vercel)

Nommer systématiquement les variables avec le préfixe du projet en MAJUSCULES :

- `[PROJET]_SUPABASE_URL`
- `[PROJET]_SUPABASE_SERVICE_ROLE_KEY`

---

### 2. Client Supabase Dédié (`src/lib/supabase/[projet]-admin.ts`)

Créer un client server-side isolé utilisant la Service Role Key pour contourner le RLS de manière contrôlée :

```ts
import { createClient } from '@supabase/supabase-js';

export const [projet]AdminDb = createClient(
  process.env.[PROJET]_SUPABASE_URL!,
  process.env.[PROJET]_SUPABASE_SERVICE_ROLE_KEY!
);
```

---

### 3. Route API Métriques (`src/app/api/admin/[projet]/stats/route.ts`)

Exposer un endpoint GET sécurisé qui interroge la base de données du projet :

```ts
import { NextResponse } from 'next/server';
import { [projet]AdminDb } from '@/lib/supabase/[projet]-admin';

export async function GET() {
  try {
    const [stat1, stat2, stat3] = await Promise.all([
      [projet]AdminDb.from('table_1').select('id', { count: 'exact', head: true }),
      [projet]AdminDb.from('table_2').select('id', { count: 'exact', head: true }),
      [projet]AdminDb.from('table_3').select('id', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      total_items_1: stat1.count || 0,
      total_items_2: stat2.count || 0,
      total_items_3: stat3.count || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### 4. Composant UI Carte KPI (`src/components/admin/[Projet]StatsCard.tsx`)

Créer la carte d'affichage avec l'identité visuelle du projet (couleur accent, icônes Lucide, Skeleton loading) :

- Exécuter un `fetch('/api/admin/[projet]/stats')`
- Rendre les cartes de statistiques
- Afficher un état d'erreur et de chargement gracieux

---

### 5. Intégration sur la Page Super Admin (`src/app/admin/dashboard/page.tsx`)

- Déclarer le projet dans le registre des projets (`projects.ts`)
- Importer et placer `<[Projet]StatsCard />` sur le tableau de bord.

---

## 📋 Projets actuellement intégrés

- [x] **Séjoura** (Gestion hôtelière)
- [x] **Schooly** (Gestion scolaire)
- [x] **Trouvetou** (Portail & synchronisation des offres)
- [ ] **Docly** (À venir)

---

## 📢 Configuration Telegram Globale (Bot & Admin uniques)

Toutes les applications de l'écosystème (Séjoura, Schooly, Trouvetou, Docly, PronoMaster, etc.) utilisent les **MÊMES** identifiants Telegram :

- **`TELEGRAM_BOT_TOKEN`** : `8882268453:AAGNSyYytK2Wyo57sKAlw2Vps1HNBg11ZvE`
- **`TELEGRAM_ADMIN_CHAT_ID`** : `8958821599`

---

### Règle de formatage des messages

Pour distinguer la provenance des alertes dans le canal Telegram unique, **TOUS** les messages générés par `lib/telegram.ts` doivent inclure le nom du SaaS en préfixe :

- **Schooly** : `[Schooly] NOUVEL ABONNEMENT ...`
- **Séjoura** : `[Séjoura] NOUVELLE RÉSERVATION ...`
- **Trouvetou** : `[Trouvetou] SYNCHRO EFFECTUÉE ...`
- **Docly** : `[Docly] NOUVEAU PATIENT ...`
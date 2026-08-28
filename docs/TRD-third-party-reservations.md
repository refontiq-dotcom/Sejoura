# Document des Exigences Techniques (DET)
## Gestion des Réservations Tiers
**Projet :** Séjoura — SaaS de Gestion Hôtelière  
**Fonctionnalité :** Séparation Payeur/Occupant pour Réservations Tiers  
**Statut :** Brouillon  
**Dernière mise à jour :** 2026-08-28  

---

## 1. Aperçu Fonctionnel

### 1.1 Concept Fondamental

Le modèle de données actuel de Séjoura confond le **Client** (occupant physique) et le **Payeur** (responsabilité financière) en un seul enregistrement `clients` lié via `bookings.client_id`. Cette conception est suffisante pour les réservations directes des clients, mais elle est inadéquate pour les scénarios de réservation tiers où :

- Un **client corporate**, une **agence de voyage** ou une **plateforme en ligne** (OTA) paie le séjour
- L'**occupant physique** est un individu différent qui n'a peut-être pas d'enregistrement `clients` au moment de la réservation
- Les **réglementations d'hospitalité et de sécurité** (ex: enregistrement police ivoirien) exigent la capture de l'identité de la personne occupant physiquement la chambre

### 1.2 Séparation des Responsabilités

Cette fonctionnalité introduit une séparation formelle entre :

| Rôle | Définition | Source de Données |
|------|-----------|-------------------|
| **Payeur** | Entité ayant la responsabilité financière de la réservation. Les factures et reçus sont émis à cette partie. | Enregistrement `clients` existant via `bookings.client_id` |
| **Occupant** | Individu séjournant physiquement dans la chambre. Son identité doit être enregistrée pour la conformité police/sécurité. | Nouveaux champs inline sur `bookings` lorsque `is_third_party = true` |

### 1.3 Exigences de Conformité

- **Registre d'Occupation :** Doit capturer le nom légal complet de l'Occupant, le type de pièce d'identité, le numéro de pièce, la nationalité et (lorsque disponible) une photo de la pièce d'identité.
- **Registres Police :** L'identité de l'Occupant doit être soumise aux autorités locales. Un champ `id_registration_status` suit si l'ID de l'Occupant a été formellement enregistré.
- **Réservations Prépayées :** Pour les réservations tiers en ligne prépayées, l'ID de l'Occupant peut ne pas être disponible au moment de la création. Le système doit supporter un état **"Enregistrement ID en attente"** qui déclenche un flux de travail du personnel à l'arrivée.

---

## 2. Exigences de l'Interface Utilisateur (UI)

### 2.1 Formulaire de Réservation — Toggle Tiers

**Emplacement :** `src/app/dashboard/bookings/page.tsx` (dans le modal de création/modification de réservation)

**Composant :** Un interrupteur bascule (toggle switch) étiqueté **"Réservation tiers (payeur ≠ occupant)"** ajouté au formulaire de réservation, près de la section de sélection du client.

**Comportement :**
- **État par Défaut (DÉSACTIVÉ) :** Flux standard. Le client sélectionné est implicitement à la fois Payeur et Occupant. Aucun champ supplémentaire n'est affiché.
- **État Actif (ACTIVÉ) :** Révèle deux blocs de données distincts :
  1. **Bloc Payeur** (réutilise la logique existante de sélection de client)
  2. **Bloc Occupant** (nouvelle section de formulaire)

### 2.2 Bloc Payeur (Lorsque le Toggle Tiers est Actif)

- Réutilise la liste déroulante de recherche/sélection de client existante (`<Select>` avec recherche par nom/téléphone du client).
- Si aucun payeur client existant n'est sélectionné, le personnel peut créer un nouveau client corporate/agence inline en utilisant les mêmes champs que `clients` (`full_name`, `phone`, `email`, `address`).
- **Validation :** La sélection du Payeur est **obligatoire** lorsque `is_third_party = true`.

### 2.3 Bloc Occupant (Lorsque le Toggle Tiers est Actif)

Une nouvelle section de formulaire avec les champs suivants :

| Champ | Type | Composant | Validation |
|-------|------|-----------|------------|
| `occupant_full_name` | Texte | Input | Requis |
| `occupant_phone` | Texte | Input | Optionnel |
| `occupant_id_type` | Select | Liste déroulante | Requis (options: `CNI`, `PASSPORT`, `DRIVER_LICENSE`, `OTHER`) |
| `occupant_id_number` | Texte | Input | Requis |
| `occupant_id_photo_url` | Téléchargement de fichier | Upload d'image (Supabase Storage) | Optionnel à la réservation; fortement recommandé à l'arrivée |
| `occupant_nationality` | Texte | Input | Requis |
| `occupant_address` | Texte | Textarea | Optionnel |

**Logique de Rendu Conditionnel (React/TypeScript) :**
```tsx
const isThirdParty = formData.is_third_party;

return (
  <>
    {/* Bloc Payeur — toujours visible */}
    <ClientSelect ... />

    {/* Toggle Tiers */}
    <Toggle
      label="Réservation tiers (payeur ≠ occupant)"
      checked={formData.is_third_party}
      onChange={(checked) => setFormData({ ...formData, is_third_party: checked })}
    />

    {/* Bloc Occupant — conditionnel */}
    {isThirdParty && (
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold">Informations de l'occupant</h3>
        <Input name="occupant_full_name" required label="Nom complet" />
        {/* ... autres champs occupant ... */}
      </div>
    )}
  </>
);
```

### 2.4 Contraintes de Modification

- Le statut tiers (`is_third_party`) **ne peut pas être basculé** après qu'une réservation passe à `checked_in`, `checked_out` ou `cancelled`.
- Les champs d'identité de l'Occupant **peuvent être modifiés** tant que le statut est `confirmed` ou `pending_payment`.
- Une fois `id_registration_status` défini sur `registered`, les champs d'ID deviennent en lecture seule (protection de la piste d'audit).

---

## 3. Flux Opérationnels

### 3.1 Facturation & Comptabilité

**Règle :** Tous les documents financiers sont adressés exclusivement au **Payeur** (`bookings.client_id`), indépendamment de la personne occupant physiquement la chambre.

**Génération de Facture (`src/lib/invoice-pdf.ts`) :**
- **Émetteur :** Détails de l'entreprise du tenant (inchangé).
- **Destinataire (`FACTURÉ À`) :** DOIT utiliser `booking.client.full_name`, `client.phone`, `client.email`, `client.nationality`.
- **Les informations de l'Occupant NE DOIVENT PAS apparaître** sur la facture. L'Occupant n'est pas partie au contrat financier.
- **Numérotation des factures et génération PDF** restent inchangées.

**Enregistrement des Paiements :**
- Tous les paiements (table `payments`) restent liés à `booking_id` et sont implicitement attribués au Payeur.
- Aucun changement du schéma `payments` ou du trigger `update_booking_payment_status`.

**Rapports Comptables :**
- Les rapports de revenus continuent d'agréger par `client_id` (Payeur).
- Un nouveau filtre optionnel `is_third_party` permet au personnel d'isoler les réservations tiers pour la réconciliation avec les OTA ou clients corporates.

### 3.2 Sécurité & Conformité

**Registre d'Occupation :**
- Le système de réception doit afficher le **nom de l'Occupant** dans le registre d'occupation, et non le nom du Payeur.
- Pour les réservations tiers, l'entrée du registre inclut :
  - Code de réservation
  - Nom complet de l'Occupant
  - Type et numéro de pièce d'identité de l'Occupant
  - Nationalité de l'Occupant
  - Statut d'enregistrement d'identité

**États d'Enregistrement d'Identité :**

| État | Valeur | Déclencheur | Action du Personnel |
|-------|-------|-------------|-------------------|
| En attente | `pending` | Réservation créée en ligne (prépayée) avec `booking_source = 'external'` et `is_third_party = true` | Le personnel doit collecter et télécharger l'ID à l'arrivée |
| Enregistré | `registered` | Le personnel met à jour manuellement après vérification de l'ID à l'arrivée | Télécharger la photo de l'ID, confirmer le numéro d'ID, définir le statut |
| Non requis | `not_required` | Réservation créée hors ligne avec paiement espèces et occupant local connu | Utilisé pour les clients walk-in ou locaux de dernière minute |

**Flux de Travail d'Enregistrement d'ID en Attente :**
1. L'API externe reçoit une réservation tiers avec les détails de l'Occupant (si fournis) ou des détails partiels.
2. La réservation est créée avec `id_registration_status = 'pending'`.
3. Le tableau de bord de la réception met en évidence la réservation avec un badge **"ID à enregistrer"**.
4. À l'arrivée, le personnel est invité à :
   - Vérifier l'identité physique de l'Occupant correspond à `occupant_full_name`
   - Capturer/télécharger la photo de l'ID vers `occupant_id_photo_url`
   - Confirmer le type et le numéro de l'ID
   - Définir `id_registration_status = 'registered'`
5. Si l'arrivée se poursuit sans enregistrement d'ID, le système enregistre un avertissement de conformité dans `audit_logs` (fonctionnalité future).

**Export des Registres Police :**
- Tout traitement nocturne ou export à la demande des données d'occupation pour soumission à la police DOIT utiliser les champs d'identité de l'Occupant, et non ceux du Payeur.

### 3.3 Opérations de la Réception

**Tableau de Bord des Chambres (`src/app/dashboard/bookings/page.tsx` — Vues Carte/Tableau) :**

- **Nom d'Affichage Principal :** Afficher `occupant_full_name` lorsque `is_third_party = true`; sinon afficher `client.full_name`.
- **Indicateur Visuel :** Un badge ou icône distinct (ex: icône `Building2` ou badge `ThirdParty`) apparaît sur les cartes/lignes de réservation tiers.
- **Info-bulle :** Le survol de l'indicateur affiche : *"Payé par [Nom du Payeur]"*.

**Flux d'Arrivée (Check-in) :**
- Si `is_third_party = true` ET `id_registration_status = 'pending'` :
  - Afficher un modal d'avertissement avant de permettre l'arrivée : *"ID de l'occupant non enregistré. Veuillez scanner ou saisir les pièces d'identité avant de procéder."*
  - Le modal inclut le formulaire de capture de l'ID de l'Occupant.
  - L'arrivée est **bloquée** jusqu'à ce que `id_registration_status` soit mis à jour vers `registered` ou `not_required`.

**Menu d'Actions Rapides :**
- Les actions existantes (`Compléter fiche client`, `Modifier dates/tarifs`) restent masquées pour `booking_source = 'external'`.
- Une nouvelle action **"Enregistrer ID occupant"** apparaît uniquement lorsque `is_third_party = true` ET `id_registration_status = 'pending'`.

---

## 4. Modèle de Données & Conception du Schéma

### 4.1 Modifications du Schéma — Table `bookings`

**Fichier de Migration :** `supabase/migrations/YYYYMMDD_third_party_reservations.sql`

```sql
-- Ajout du support des réservations tiers à bookings

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_third_party BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS occupant_full_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_phone TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_id_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_id_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_id_photo_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_nationality TEXT NULL,
  ADD COLUMN IF NOT EXISTS occupant_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS id_registration_status TEXT NOT NULL DEFAULT 'not_required';

-- Ajout de la contrainte de vérification pour id_registration_status
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_id_registration_status_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_id_registration_status_check
  CHECK (id_registration_status IN ('pending', 'registered', 'not_required'));

-- Index pour le filtrage de la réception
CREATE INDEX IF NOT EXISTS idx_bookings_is_third_party
  ON bookings (tenant_id, is_third_party)
  WHERE is_third_party = TRUE;

CREATE INDEX IF NOT EXISTS idx_bookings_id_registration_status
  ON bookings (tenant_id, id_registration_status)
  WHERE id_registration_status = 'pending';

-- Commentaires
COMMENT ON COLUMN bookings.is_third_party IS 'Indique si la réservation est payée par un tiers différent de l''occupant';
COMMENT ON COLUMN bookings.occupant_full_name IS 'Nom légal complet de la personne occupant physiquement la chambre';
COMMENT ON COLUMN bookings.occupant_id_number IS 'Numéro de pièce d''identité gouvernementale de l''occupant';
COMMENT ON COLUMN bookings.occupant_id_photo_url IS 'URL Supabase Storage de la photo de la pièce d''identité de l''occupant';
COMMENT ON COLUMN bookings.id_registration_status IS 'Suit si l''ID de l''occupant a été enregistré pour la conformité sécurité';
```

### 4.2 Mises à Jour des Types TypeScript

**Fichier :** `src/types/database.ts`

```typescript
// Ajouter aux enums existants ou créer une union inline
export type IdRegistrationStatus = 'pending' | 'registered' | 'not_required';

// Étendre l'interface Booking (autour de la ligne 325)
export interface Booking {
  // ... champs existants ...
  is_third_party: boolean;
  occupant_full_name: string | null;
  occupant_phone: string | null;
  occupant_id_type: string | null;
  occupant_id_number: string | null;
  occupant_id_photo_url: string | null;
  occupant_nationality: string | null;
  occupant_address: string | null;
  id_registration_status: IdRegistrationStatus;
}
```

### 4.3 Schéma de Relation

```
tenants
  └── accommodations
        └── rooms
              └── bookings  [FK: client_id → clients.id = PAYEUR]
                    ├── is_third_party (BOOLEAN)
                    ├── occupant_full_name (TEXT) — identité OCCUPANT
                    ├── occupant_phone (TEXT)
                    ├── occupant_id_type (TEXT)
                    ├── occupant_id_number (TEXT)
                    ├── occupant_id_photo_url (TEXT)
                    ├── occupant_nationality (TEXT)
                    ├── occupant_address (TEXT)
                    └── id_registration_status (TEXT)
              └── invoices (liées à bookings → PAYEUR implicite)
              └── payments (liés à bookings → PAYEUR implicite)
```

**Justification de la Conception :** Champs inline sur `bookings` plutôt qu'une table séparée `booking_guests` car :
- Le cas d'usage actuel nécessite une **identité occupant unique** par réservation (simplifie les rapports police)
- Évite la complexité des JOIN dans les requêtes fréquentes de la réception
- S'aligne sur le modèle existant (`number_of_guests` entier + détails occupant)

### 4.4 Mises à Jour des RPC

**RPC `create_booking`** doit être mise à jour pour accepter :
```typescript
p_is_third_party: BOOLEAN
p_occupant_full_name: TEXT
p_occupant_phone: TEXT
p_occupant_id_type: TEXT
p_occupant_id_number: TEXT
p_occupant_id_photo_url: TEXT
p_occupant_nationality: TEXT
p_occupant_address: TEXT
p_id_registration_status: TEXT
```

**RPC `update_booking`** doit accepter les mêmes paramètres, avec une garde supplémentaire :
```sql
-- Empêcher le basculement du statut tiers après arrivée
IF p_is_third_party IS DISTINCT FROM OLD.is_third_party AND OLD.status IN ('checked_in', 'checked_out', 'cancelled') THEN
  RAISE EXCEPTION 'Cannot change third-party status after check-in';
END IF;
```

---

## 5. Règles Métier & Cas Limites

### 5.1 Réservation Standard (Non-Tiers)

| Condition | Logique |
|-----------|---------|
| `is_third_party = false` | `client_id` (Payeur) = Occupant |
| Champs `occupant_*` | DOIVENT être `NULL` |
| `id_registration_status` | DOIT être `not_required` |
| Destinataire facture | `client.full_name` |
| Affichage tableau de bord | Afficher `client.full_name` |
| Création API externe | Si non explicitement flagué comme tiers, valeur par défaut `false` |

**Application :** Trigger de base de données ou validation au niveau application qui définit tous les champs `occupant_*` à `NULL` et `id_registration_status` à `'not_required'` lorsque `is_third_party = false`.

### 5.2 Réservation Tiers (Hors Ligne/Espèces)

| Condition | Logique |
|-----------|---------|
| `is_third_party = true` | Payeur est un client corporate/agence de voyage |
| Champs `occupant_*` | DOIVENT être renseignés à la création |
| `id_registration_status` | Défini sur `registered` immédiatement si l'ID est fourni; sinon `pending` |
| Destinataire facture | `client.full_name` (Payeur, pas l'Occupant) |
| Affichage tableau de bord | Afficher `occupant_full_name` avec badge tiers |

### 5.3 Réservation Tiers (En Ligne/Prépayée)

| Condition | Logique |
|-----------|---------|
| `is_third_party = true` | Créée via `/api/v1/external/bookings` avec `is_third_party: true` dans le payload |
| Champs `occupant_*` | Peuvent être partiellement renseignés depuis le payload OTA; les lacunes sont autorisées |
| `id_registration_status` | **DOIT être `pending`** à la création |
| Arrivée | **Bloquée** jusqu'à ce que le personnel enregistre l'ID |
| Destinataire facture | `client.full_name` (Payeur — l'OTA ou le compte corporate) |

### 5.4 Cas Limites

| Cas Limite | Résolution |
|-----------|------------|
| **Le Payeur est aussi l'Occupant** (faux positif du toggle) | Le personnel doit laisser le toggle DÉSACTIVÉ. Si activé par erreur, le personnel doit soit remplir les champs occupant avec les données du payeur, soit désactiver le toggle (autorisé uniquement avant l'arrivée). |
| **Échec du téléchargement de la photo de l'ID de l'Occupant** | `occupant_id_photo_url` reste `NULL`. Le système enregistre un avertissement mais ne bloque pas l'arrivée si `id_registration_status` est défini manuellement sur `registered`. |
| **L'API externe crée une réservation sans données occupant** | Si `is_third_party = true` mais `occupant_full_name` est manquant, la RPC retourne `400 Bad Request` avec le message : *"Le nom complet de l'occupant est requis pour les réservations tiers."* |
| **Facture générée pour une réservation tiers** | Le PDF de la facture utilise exclusivement les données du Payeur. Une petite note de bas de page peut être ajoutée : *"Réservation effectuée pour le compte de [Nom de l'Occupant]"* — mais ceci est optionnel et ne doit pas remplacer le destinataire légal. |
| **Annulation de réservation (tiers)** | Toutes les données de l'occupant sont archivées. Le flag `is_third_party` reste `true` pour les enregistrements historiques. Aucune donnée Payeur/Occupant n'est supprimée. |
| **Migration des données** | Les réservations existantes (créées avant cette fonctionnalité) doivent être remplies : `is_third_party = false`, tous les `occupant_* = NULL`, `id_registration_status = 'not_required'`. |

### 5.5 Matrice de Validation

| Champ | Quand Requis | Quand Nullable | Règle de Validation |
|-------|--------------|---------------|-------------------|
| `is_third_party` | Toujours (défaut `false`) | Jamais | Booléen |
| `client_id` (Payeur) | Toujours | Jamais | FK vers `clients`, NOT NULL |
| `occupant_full_name` | `is_third_party = true` | `is_third_party = false` | Texte, min 2 caractères |
| `occupant_id_type` | `is_third_party = true` | `is_third_party = false` | Enum: `CNI`, `PASSPORT`, `DRIVER_LICENSE`, `OTHER` |
| `occupant_id_number` | `is_third_party = true` | `is_third_party = false` | Texte, min 1 caractère |
| `occupant_nationality` | `is_third_party = true` | `is_third_party = false` | Texte, min 2 caractères |
| `occupant_id_photo_url` | Recommandé | Autorisé | URL chaîne |
| `id_registration_status` | Toujours (défaut `not_required`) | Jamais | Enum: `pending`, `registered`, `not_required` |

---

## 6. Notes d'Implémentation

### 6.1 Ordre de Migration

1. Créer `docs/TRD-third-party-reservations.md` (ce document).
2. Générer la migration : `supabase/migrations/YYYYMMDD_third_party_reservations.sql`.
3. Mettre à jour `src/types/database.ts` avec les nouveaux champs et le type `IdRegistrationStatus`.
4. Mettre à jour l'UI du formulaire de réservation dans `src/app/dashboard/bookings/page.tsx` :
   - Ajouter l'interrupteur bascule.
   - Ajouter le Bloc Occupant conditionnel.
   - Mettre à jour `handleSave` et `handleSaveEdit` pour transmettre les nouveaux champs.
5. Mettre à jour les RPC `create_booking` et `update_booking`.
6. Mettre à jour l'API de réservation externe (`src/app/api/v1/external/bookings/route.ts`) pour accepter et valider les champs de payload tiers.
7. Mettre à jour `src/lib/invoice-pdf.ts` pour garantir qu'aucune donnée occupant ne fuite dans les factures.
8. Mettre à jour la logique d'affichage du tableau de bord des chambres pour afficher le nom de l'Occupant + badge pour les réservations tiers.
9. Ajouter le modal de garde à l'arrivée pour l'enregistrement d'ID en attente.
10. Mettre à jour `REMAINING-TASKS.md` avec la liste de contrôle d'implémentation.

### 6.2 Compatibilité Ascendante

- Toutes les réservations existantes restent valides. Les valeurs par défaut assurent le comportement `is_third_party = false`.
- Les API existantes restent fonctionnelles; les champs tiers sont des extensions optionnelles.
- Aucun changement cassant pour le type `BookingWithRelations` (les nouveaux champs sont additifs).

### 6.3 Considérations de Sécurité

- `occupant_id_photo_url` pointe vers Supabase Storage (bucket privé `id-documents` recommandé). L'accès doit être restreint aux rôles personnel (`admin_residence`, `receptionniste`).
- Les photos de pièce d'identité doivent être servies via des URLs signées avec expiration courte (15 minutes).
- Les changements de `id_registration_status` doivent être journalisés dans `audit_logs` (lorsque implémenté) pour tracer la conformité.

---

## 7. Critères d'Acceptation

1. Le personnel peut basculer "Réservation tiers" lors de la création ou modification d'une réservation.
2. Lorsque activé, le Bloc Occupant apparaît et applique les champs requis.
3. Lorsque désactivé, tous les champs occupant sont effacés/nullifiés.
4. Les factures affichent uniquement l'identité du Payeur (jamais celle de l'Occupant).
5. Le tableau de bord des chambres affiche le nom de l'Occupant pour les réservations tiers avec un badge visuel.
6. L'arrivée est bloquée pour les réservations tiers avec `id_registration_status = 'pending'` jusqu'à ce que le personnel enregistre l'ID.
7. L'API externe peut créer des réservations tiers avec `is_third_party: true` et des données occupant partielles.
8. Les réservations existantes ne sont pas affectées par la migration.
9. Les contraintes de base de données appliquent des valeurs `id_registration_status` valides.
10. La compilation TypeScript réussit sans erreurs de type liées aux nouveaux champs.

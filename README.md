# Séjoura — Plateforme de gestion de résidences meublées

## 🧾 Paiement d'abonnement Wave

Le gérant effectue son paiement via Wave depuis `/dashboard/subscription`, puis
déclare le paiement avec son numéro Wave expéditeur.

La demande reste en attente jusqu'à sa validation par **Refontiq Control Center**.
Séjoura ne contient plus de console Super Admin locale.

Les tables et RPC historiques de paiement restent présentes pour compatibilité
avec les données existantes ; les opérations globales de validation doivent être
pilotées par le Control Center.

## 🧾 Facture intelligente (trace des prolongations)

Chaque prolongation de séjour est enregistrée dans la table `booking_extensions`
(migration `20260902_booking_extensions.sql`) :

- **Prolongation manuelle ou acceptée** : `extend_booking()` écrit une ligne
  (dates avant/après, nombre de nuits ajoutées, utilisateur).
- **Dépassement de séjour (auto check-out)** : `check_overstays()` écrit une
  ligne `source = 'overstay'`.

La facture générée (`/api/invoice/generate`) affiche alors le détail ligne par
ligne : « Nuitée initiale · du A au B », « Prolongation 1 · du B au C »,
« Prolongation 2 · … », « Dépassement de séjour · … » — le total restant
toujours identique à celui de la réservation. Les factures déjà envoyées/payées
restent figées ; seuls les brouillons sont régénérés avec le détail (déjà le cas
via `sync_draft_invoice_on_booking_change`).

⚠️ L'historique n'est reconstitué qu'à partir de la migration : les prolongations
antérieures n'apparaîtront pas comme lignes détaillées (la facture retombe alors
sur une ligne unique).

### 2. Flux automatisé via API Wave Checkout (existant)

Optionnel, si la clé API Wave est disponible :

```env
WAVE_API_KEY=sk_live_...
WAVE_WEBHOOK_SECRET=whsec_...
```

- `WAVE_API_KEY` : clé API Wave côté serveur uniquement
- `WAVE_WEBHOOK_SECRET` : secret utilisé pour vérifier les webhooks Wave

#### Webhook Wave

En production, enregistrer l'URL suivante dans le portail Wave Business Portal :

```text
https://<votre-domaine>/api/webhooks/wave
```

Cette route reçoit les événements `checkout.session.completed` et met à jour
l'abonnement uniquement après vérification de la signature Wave.

### Variables Supabase requises

Pour les deux flux, le projet lit :

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

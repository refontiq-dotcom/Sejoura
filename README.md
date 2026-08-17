# Séjoura — Plateforme de gestion de résidences meublées

## 🧾 Paiement d'abonnement Wave

Deux flux coexistent pour le paiement des abonnements :

### 1. Flux semi-automatisé par lien Wave (recommandé)

Le gérant paie via un lien Wave direct, puis notifie l'administrateur qui valide
manuellement l'activation.

Déroulé :

1. Sur la page `/dashboard/subscription`, le gérant choisit son forfait
   (Essentiel 15 000 FCFA ou Entreprise 55 000 FCFA) et clique sur
   « Payer via Wave » (lien `https://pay.wave.com/...` ouvert dans un nouvel onglet).
2. Une fois le paiement effectué, il revient dans la modal et saisit le
   numéro Wave expéditeur puis clique sur « Soumettre pour activation rapide » :
   la route `POST /api/subscription/notify-payment` passe l'abonnement en
   `subscription_status = 'pending'` et crée une demande dans
   `subscription_payment_requests` (avec le numéro expéditeur) + une
   notification Super Admin.
3. Sur la page `/admin`, le Super Admin voit un bandeau d'alerte et la section
   « Gestion des Abonnements » (validations en attente, avec le numéro Wave du
   gérant pour vérifier le transfert). En cliquant sur « Valider l'abonnement »,
   la RPC `validate_subscription_payment` active l'abonnement (+30 jours),
   débloque les interrupteurs et réactive les utilisateurs de l'établissement.
   Un bouton « Rejeter » (avec confirmation) permet au contraire de marquer la
   demande comme `rejected` via la RPC `reject_subscription_payment` : le gérant
   est notifié et peut soumettre une nouvelle demande. Les demandes dont le
   montant ne correspond pas au tarif du plan (15 000 FCFA Essentiel /
   55 000 FCFA Entreprise) sont signalées visuellement avant validation.

Migrations correspondantes :
- `supabase/migrations/20260812_subscription_manual_payment_flow.sql`
  (table `subscription_payment_requests`, RLS, RPC `validate_subscription_payment`)
- `supabase/migrations/20260813_subscription_payment_sender_phone.sql`
  (colonne `sender_phone` sur `subscription_payment_requests`)
- `supabase/migrations/20260818_reject_subscription_payment.sql`
  (RPC `reject_subscription_payment`)
- `supabase/migrations/20260818_fix_subscription_payment_requests_fk.sql`
  (répare les clés étrangères manquantes sur `subscription_payment_requests`,
  nécessaire si la table existait avant l'ajout des contraintes : sans la FK
  `tenant_id -> tenants(id)`, la jointure `tenants(...)` de la page `/admin`
  échoue et les validations en attente ne s'affichent pas)

Idempotentes, à appliquer via `npm run db:push` avec `DATABASE_URL`.

Pour maintenir l'état `expired`, appeler périodiquement la fonction
`sync_subscription_statuses()` (cron Supabase / edge function) : elle bascule en
`expired` + soft lock les abonnements dont `subscription_end_date` est dépassée.

### Notifications Telegram du Super Admin

À chaque événement important, le Super Admin reçoit une alerte Telegram (mêmes
variables `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` que pour les suggestions) :

| Événement | Déclencheur |
|---|---|
| Nouvelle suggestion | `POST /api/feature-requests/notify` |
| Demande de validation d'abonnement | `POST /api/subscription/notify-payment` |
| Nouvelle inscription d'établissement | `POST /api/register` |
| Paiement Wave automatique reçu | `POST /api/webhooks/wave` (événement `checkout.session.completed`) |
| Abonnement passé en `expired` | Trigger SQL → outbox `telegram_alerts` → Vercel Cron `/api/cron/telegram-alerts` |

Pour l'abonnement expiré, le passage en `expired` (par `sync_subscription_statuses()`)
écrit une alerte dans la table `telegram_alerts` (migration
`20260828_subscription_expired_telegram.sql`). Un Vercel Cron (`vercel.json`,
toutes les minutes) vide cette file via la route `/api/cron/telegram-alerts`
(protégée par la variable `CRON_SECRET`).

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

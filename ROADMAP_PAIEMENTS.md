# 🗺️ Cahier des Charges & Roadmap : Activation des Paiements Automatiques

Ce document récapitule les étapes à suivre pour activer l'intégration directe des opérateurs mobiles (**Wave, Orange Money, MTN, Moov Africa, PI-SPI**) pour :
1. **Les réservations en ligne** (acompte client sur Trouvetou).
2. **Le renouvellement des abonnements** (facturation automatique de Séjoura).

---

## 1. Réservations en ligne (Trouvetou ➔ Séjoura)

L'infrastructure technique est prête dans `supabase/migrations/20260828_payment_groundwork.sql` et `src/app/api/v1/webhooks/payments/route.ts`.

### 📋 Ce qu'il reste à faire le Jour J :

#### Étape A : Activer l'API de l'opérateur choisi
Dans le fichier correspondant (`src/lib/payments/[wave|orange-money|mtn|moov-africa|pi-spi].ts`), **décommenter les blocs de code** marqués par `// TODO : Décommenter` pour remplacer les stubs de simulation par les appels HTTP réels de l'API.

#### Étape B : Activer le webhook sur le dashboard de l'opérateur
1. Renseigner l'URL de notification : `https://<votre-domaine-sejoura>.com/api/v1/webhooks/payments?provider=<provider>`
2. Choisir les événements : `checkout.session.completed` / `payment.success` selon la terminologie de l'opérateur.

#### Étape C : Intégration sur la plateforme Trouvetou
1. Lorsqu'un client clique sur "Réserver et Payer" sur Trouvetou :
   - Trouvetou appelle `POST /api/v1/external/bookings` sur Séjoura avec `p_initial_status := 'pending_payment'`.
   - L'API Séjoura initialise le paiement auprès du provider actif et renvoie la `checkoutUrl`.
   - Trouvetou redirige l'utilisateur vers cette URL pour effectuer le paiement.
2. Si le paiement réussit : Wave/Orange Money appelle notre webhook Séjoura qui confirme automatiquement la réservation (`status := 'confirmed'`).
3. Si le paiement échoue ou n'est pas fait dans les 30 minutes : la tâche cron appelle `expire_pending_bookings()` pour libérer la chambre.

---

## 2. Abonnements de Séjoura (Facturation des Gérants)

L'infrastructure est prête dans `supabase/migrations/20260829_subscription_auto_payment.sql` et `src/lib/payments/subscription-payment.ts`.

### 📋 Ce qu'il reste à faire le Jour J :

#### Étape A : Appliquer la migration SQL
Exécuter le script de migration `20260829_subscription_auto_payment.sql` sur la base de données Supabase pour créer :
- La table `tenant_billing_profiles` (stockage du choix de paiement préféré du gérant).
- La table `subscription_payment_intents` (historique des tentatives).

#### Étape B : Connecter l'activation dans l'interface
Ajouter un commutateur "Renouvellement automatique" et un champ "Numéro de téléphone de facturation" dans l'onglet **Paiements en ligne** des paramètres gérés par `PaymentGatewaysSection`.

#### Étape C : Décommenter la logique d'auto-renouvellement
Dans `src/lib/payments/subscription-payment.ts` :
1. Décommenter le bloc d'initiation automatique :
   ```typescript
   const service = await getPaymentService(tenantId, provider);
   // ...
   ```
2. Décommenter le webhook de confirmation `processSubscriptionPaymentWebhook` dans la route `/api/v1/webhooks/subscription-payments`.

#### Étape D : Déclencher le Cron Job
Activer le cron job quotidien de vérification à J-3 (via pg_cron ou le scheduler Vercel configuré dans `vercel.json` à l'adresse `/api/v1/cron/subscription-renewal`).

---

## 🔒 Détails des Identifiants requis par Opérateur

| Opérateur | Identifiants requis | Lien console développeur |
| :--- | :--- | :--- |
| **Wave 🌊** | Clé Secrète API (`api_key`), Identifiant Marchand (`merchant_id`) | [Wave Business Developer](https://developer.wave.com) |
| **Orange Money 🟠** | `client_id`, `client_secret`, Numéro Marchand | [Orange Developer Portal](https://developer.orange.com) |
| **MTN MoMo 🟡** | `subscription_key`, `api_user`, `api_key` | [MTN MoMo Developer](https://momodeveloper.mtn.com) |
| **Moov Africa 🔵** | Clé API (`api_key`), Code Marchand (`merchant_code`) | Contacter marchands@moov-africa.ci |
| **PI-SPI 🏦** | Identifiant Marchand, Clé Secrète, Code banque partenaire | Enrôlement auprès de votre banque (BNI, SIB, SGBCI...) |

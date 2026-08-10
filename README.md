# 🚀 Mes Projets (Monorepo)

Hub centralisé regroupant l'ensemble de mes applications.

## 📁 Projets
- **[Séjoura](./sejoura)** : Plateforme de gestion de résidences meublées.

## 🧾 Séjoura — configuration Wave Checkout

Pour activer le paiement d'abonnement via Wave dans Séjoura, ajouter dans `sejoura/.env.local` :

```env
WAVE_API_KEY=sk_live_...
WAVE_WEBHOOK_SECRET=whsec_...
```

- `WAVE_API_KEY` : clé API Wave côté serveur uniquement
- `WAVE_WEBHOOK_SECRET` : secret utilisé pour vérifier les webhooks Wave

### Webhook Wave

En production, enregistrer l'URL suivante dans le portail Wave Business Portal :

```text
https://<votre-domaine>/api/webhooks/wave
```

Cette route reçoit les événements `checkout.session.completed` et met à jour l'abonnement uniquement après vérification de la signature Wave.


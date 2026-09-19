# Intégration Séjoura ↔ Refontiq Control Center

## Architecture d'administration

**Refontiq Control Center est l'unique Super Admin de l'écosystème.**

Séjoura n'expose plus de console Super Admin locale, de page `/admin`, de rôle Super Admin actif, ni de script de création de Super Admin.

Le découpage est désormais :

- **Séjoura** : gestion opérationnelle des établissements et de leurs utilisateurs.
- **Refontiq Control Center** : administration globale, supervision, métriques, alertes et opérations centralisées.
- **Telegram** : canal d'alerte central relié au Control Center.

## Métriques

Séjoura expose `POST /api/metrics/push`, protégé par :

- `METRICS_PUSH_SECRET`
- `CONTROL_CENTER_URL`

Le endpoint collecte notamment :

- établissements actifs ;
- utilisateurs actifs hors clients ;
- MRR des abonnements actifs ;
- état de santé du produit.

Le Control Center reçoit ces données via `/api/metrics/push`.

## Sécurité

Le rôle historique `super_admin` est conservé uniquement pour compatibilité avec les anciennes migrations. La migration :

`supabase/migrations/20260919_refontiq_control_center_is_sole_super_admin.sql`

- désactive les anciens comptes locaux `super_admin` ;
- empêche toute création ou modification d'un utilisateur vers `super_admin` ;
- empêche le trigger Auth de créer un compte local avec ce rôle.

Toute administration globale doit donc passer par Refontiq Control Center.

## Variables d'environnement

```env
CONTROL_CENTER_URL=https://refontiq-control-center.vercel.app
METRICS_PUSH_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ADMIN_URL=https://refontiq-control-center.vercel.app/admin
```

Aucune variable `SUPER_ADMIN_EMAIL` ou `SUPER_ADMIN_PASSWORD` n'est nécessaire dans Séjoura.

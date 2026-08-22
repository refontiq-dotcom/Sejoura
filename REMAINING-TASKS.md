# Taches restantes — Audit Sejoura SaaS

Genere le 22/08/2026. Ce fichier liste tout ce qui reste a faire apres les corrections
de securite, logique metier et UI/UX. Coche chaque tache quand elle est terminee.

---

## SECURITE (critique)

- [ ] **Audit logging** — Ajouter un middleware qui enregistre qui a fait quoi, quand.
  - Table `audit_logs` dans Supabase (user_id, action, entity_type, entity_id, ip, timestamp)
  - Logger : connexions, modifications de donnees, suppressions, changements de role
  - Dashboard admin avec vue des logs recents
  - Fichier : `src/lib/audit.ts` + `src/middleware.ts`

- [ ] **CSRF protection** — Ajouter des tokens CSRF sur toutes les mutations (POST/PUT/DELETE).
  - Generer un token CSRF a la connexion, le stocker dans un cookie HttpOnly
  - Valider le token dans chaque route API qui recoit un body
  - Fichier : `src/lib/csrf.ts`

- [ ] **Rate limiting Redis** — Remplacer le rate limiter in-memory par Upstash Redis.
  - Installer `@upstash/ratelimit` + `@upstash/redis`
  - Configurer UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN
  - Modifier `src/lib/rate-limit.ts`

---

## SECURITE (basse priorite)

- [ ] **CSP verification** — Verifier apres deploiement que le Content-Security-Policy
  ne bloque pas de ressources legtimes. Ouvrir la console (F12) et corriger les
  erreurs `Refused to load` dans `next.config.ts`.

- [ ] **CORS** — Ajouter des en-tetes CORS sur les routes API pour n'autoriser
  que le domaine de production.

- [ ] **Session timeout** — Configurer un delai d'inactivation de session (ex: 30 min)
  pour les comptes admin.

---

## LOGIQUE METIER

- [ ] **Paiements automatiques** — Connecter les operateurs (Wave, Orange Money, MTN)
  au cron de renouvellement quand les cles API seront disponibles.
  - Decommenter le code dans `src/lib/payments/subscription-payment.ts`
  - Configurer WAVE_API_KEY, WAVE_WEBHOOK_SECRET

- [ ] **Notifications push employes** — Envoyer des notifications aux employes
  quand une tache de menage est creee ou assignee.
  - Utiliser les Push API du navigateur
  - Table `push_subscriptions` dans Supabase

- [ ] **Taux de change auto-refresh** — Verifier que le cache Frankfurter fonctionne
  en production. Si les taux sont trop anciens, forcer un refresh.

- [ ] **Check-out reminders** — Prevenir le personnel 2h avant l'heure de check-out
  des clients.

---

## UI/UX

- [ ] **Toast feedback CRUD** — Ajouter `toast.success()` / `toast.error()` dans
  les fonctions de suppression, modification et creation de toutes les pages :
  - `src/app/dashboard/bookings/page.tsx`
  - `src/app/dashboard/rooms/page.tsx` (via residences)
  - `src/app/dashboard/employees/page.tsx`
  - `src/app/dashboard/cleaning/page.tsx`
  - `src/app/dashboard/settings/page.tsx`

- [ ] **Image OG** — Creer `public/og-image.png` (1200x630px) avec le logo Sejoura
  pour les partages sur les reseaux sociaux.

- [ ] **Skeletons restants** — Installer les skeletons dans les pages qui n'en ont
  pas encore :
  - `src/app/dashboard/subscription/page.tsx`
  - `src/app/dashboard/accounting/page.tsx`
  - `src/app/dashboard/settings/page.tsx`
  - `src/app/dashboard/suggestions/page.tsx`

- [ ] **Micro-animations** — Ajouter `hover-lift` sur les cartes interactives
  et `animate-stagger-in` sur les listes d'elements.

---

## DEPLOIEMENT

- [ ] **Variables d'environnement production** — Configurer dans Freebuff
  Settings > Environment :
  - `CRON_SECRET` (pour securiser le cron)
  - `WAVE_WEBHOOK_SECRET` (quand Wave sera connecte)
  - `WEBHOOK_SECRET` (pour les webhooks non-Wave)

- [ ] **Test de deploiement** — Lancer `freebuff-deploy check` avant le prochain
  deploiement pour verifier que le build reussit.

- [ ] **Monitoring** — Configurer des alertes pour les erreurs serveur (Sentry ou
  equivalent).

---

## NOTES TECHNIQUES

- Le rate limiter in-memory (`src/lib/rate-limit.ts`) fonctionne pour le dev
  mais n'est PAS fiable sur Vercel (chaque instance a sa propre memoire).
  Pour la prod, il FAUT passer a Redis.

- Le CSP est en mode enforce. Si des ressources sont bloquees, verifier la
  console et ajouter les domaines manquants dans `next.config.ts`.

- Les webhooks Wave/Orange/MTN ne fonctionneront que quand les cles API seront
  configurees. En attendant, les routes retournent 501 ou utilisent le fallback
  paiement manuel.

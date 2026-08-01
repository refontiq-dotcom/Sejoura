# 🔍 Analyse UX/UI Complète — Séjoura

> Audit en profondeur de la structure de navigation, des menus, et de tous les éléments interactifs du projet Séjoura.

---

## 📋 Table des matières

1. [Vue d'ensemble de l'architecture](#1-vue-densemble-de-larchitecture)
2. [Structure de navigation](#2-structure-de-navigation)
3. [Éléments interactifs manquants — Critique](#3-éléments-interactifs-manquants--critique)
4. [Éléments interactifs manquants — Modéré](#4-éléments-interactifs-manquants--modéré)
5. [Améliorations UX/UI spécifiques par page](#5-améliorations-uxui-spécifiques-par-page)
6. [Améliorations transversales](#6-améliorations-transversales)
7. [Priorisation des actions](#7-priorisation-des-actions)

---

## 1. Vue d'ensemble de l'architecture

Séjoura est un SaaS de gestion d'établissements hôteliers (Next.js 16, React 19, Tailwind CSS v4, Supabase). L'application gère : établissements, chambres, réservations, ménage, comptabilité, employés, et abonnements. La devise est le FCFA (XOF), avec un focus marché ivoirien.

**Architecture de navigation :**

- **Sidebar** (gauche, fixe) : 8 items de navigation principaux avec filtrage par rôle
- **Header** (haut, sticky) : Recherche, thème, notifications, profil
- **Layout dashboard** : Auth guard + onboarding modal + sidebar + header + contenu
- **Pages publiques** : Login/register combiné, CGU, admin, menage, flights-demo

---

## 2. Structure de navigation

### 2.1 Sidebar (`src/components/dashboard/sidebar.tsx`)

| #   | Label           | Route                   | Rôles                               | Icône             |
| --- | --------------- | ----------------------- | ----------------------------------- | ----------------- |
| 1   | Tableau de bord | `/dashboard`            | tous                                | `LayoutDashboard` |
| 2   | Établissements  | `/dashboard/residences` | `admin_residence`                   | `Building2`       |
| 3   | Chambres        | `/dashboard/rooms`      | `admin_residence`, `receptionniste` | `BedDouble`       |
| 4   | Réservations    | `/dashboard/bookings`   | `admin_residence`, `receptionniste` | `CalendarCheck`   |
| 5   | Ménage          | `/dashboard/cleaning`   | `admin_residence`, `receptionniste` | `Sparkles`        |
| 6   | Comptabilité    | `/dashboard/accounting` | `admin_residence`                   | `Wallet`          |
| 7   | Employés        | `/dashboard/employees`  | `admin_residence`                   | `Users`           |
| 8   | Paramètres      | `/dashboard/settings`   | `admin_residence`                   | `Settings`        |

**Fonctionnalités présentes :** Détection de route active avec coins fluidides, collapse toggle, avatar utilisateur, label de rôle, bouton de déconnexion.

### 2.2 Header (`src/components/dashboard/header.tsx`)

**Fonctionnalités présentes :** Recherche (input expandable), toggle thème clair/sombre, notifications (dropdown avec fetch Supabase), profil (dropdown avec plan affiché).

### 2.3 Pages du dashboard

| Page                 | Route                        | Fonctionnalités principales                                                                |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Dashboard            | `/dashboard`                 | 4 KPIs, tableau mouvements du jour, donut chart état du parc, line chart recettes          |
| Établissements       | `/dashboard/residences`      | Grille cartes, add/edit modal, limites par plan                                            |
| Détail établissement | `/dashboard/residences/[id]` | Types de chambres, gestion chambres                                                        |
| Chambres             | `/dashboard/rooms`           | Types de chambres + chambres, add/edit/delete                                              |
| Réservations         | `/dashboard/bookings`        | Tableau, filtres, add modal, actions check-in/out/cancel/no-show                           |
| Ménage               | `/dashboard/cleaning`        | Tableau kanban, assignation, statuts                                                       |
| Comptabilité         | `/dashboard/accounting`      | KPIs, transactions, modal paiement                                                         |
| Employés             | `/dashboard/employees`       | Liste, add/edit, activation/désactivation                                                  |
| Abonnement           | `/dashboard/subscription`    | Plans, paiement                                                                            |
| Paramètres           | `/dashboard/settings`        | 7 sections (entreprise, compte, apparence, notifications, facturation, WhatsApp, sécurité) |

---

## 3. Éléments interactifs manquants — Critique

### 🔴 C1. Boutons "Check-in" / "Check-out" du tableau des mouvements SANS ACTION

**Fichier :** `src/app/dashboard/page.tsx` (lignes 630-635)

```tsx
<Button
  variant={m.movementType === "check_in" ? "primary" : "secondary"}
  size="sm"
>
  {m.movementType === "check_in" ? "Check-in" : "Check-out"}
</Button>
```

**Problème :** Aucun `onClick` — le bouton est purement décoratif. L'utilisateur clique mais rien ne se passe.

**Recommandation :** Ajouter un `onClick` qui appelle la même fonction RPC que la page bookings (`check_in_booking` / `check_out_booking`), avec un toast de confirmation et un rechargement des données.

---

### 🔴 C2. Bouton "Se déconnecter" de la sidebar SANS ACTION

**Fichier :** `src/components/dashboard/sidebar.tsx` (lignes 128-133)

```tsx
<button
  className="p-2 rounded-lg text-blue-200 hover:bg-blue-700/60 hover:text-white transition-colors"
  title="Se déconnecter"
>
  <LogOut className="w-4 h-4" />
</button>
```

**Problème :** Aucun `onClick` — le bouton ne déconnecte pas l'utilisateur.

**Recommandation :** Ajouter `onClick` qui appelle `supabase.auth.signOut()` puis redirige vers `/login`. Idéalement avec une boîte de dialogue de confirmation.

---

### 🔴 C3. Bouton "Marquer tout comme lu" SANS ACTION

**Fichier :** `src/components/dashboard/header.tsx` (ligne 209)

```tsx
<button className="w-full text-center text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
  Marquer tout comme lu
</button>
```

**Problème :** Aucun `onClick` — le bouton ne marque pas les notifications comme lues.

**Recommandation :** Ajouter `onClick` qui appelle `supabase.from("notifications").update({ is_read: true }).eq("tenant_id", ...)` puis rafraîchit la liste.

---

### 🔴 C4. Barre de recherche du header SANS FONCTIONNALITÉ

**Fichier :** `src/components/dashboard/header.tsx` (lignes 121-141)

**Problème :** L'input de recherche s'ouvre mais ne recherche rien — il se ferme juste au blur. Aucune logique de recherche, aucun résultat, aucune redirection.

**Recommandation :** Implémenter une recherche globale qui :

1. Ouvre un modal/overlay de recherche (style command palette `Cmd+K`)
2. Recherche dans : réservations (code, client), chambres (numéro), établissements (nom), clients (nom, téléphone)
3. Affiche les résultats avec icônes et redirection au clic

---

### 🔴 C5. Profil dropdown SANS LIENS NI ACTIONS

**Fichier :** `src/components/dashboard/header.tsx` (lignes 226-251)

**Problème :** Le dropdown de profil affiche le nom, le rôle et le plan, mais ne contient **aucun lien** vers :

- Paramètres du compte
- Page de profil
- Abonnement
- Déconnexion

**Recommandation :** Ajouter les liens suivants dans le dropdown :

- "Mon profil" → `/dashboard/settings` (section compte)
- "Paramètres" → `/dashboard/settings`
- "Abonnement" → `/dashboard/subscription`
- "Se déconnecter" (avec `supabase.auth.signOut()`)

---

### 🔴 C6. Bouton "Enregistrer" de la section Compte SANS ACTION

**Fichier :** `src/app/dashboard/settings/page.tsx` (ligne 263)

```tsx
<Button>Enregistrer</Button>
```

**Problème :** Aucun `onClick` — les modifications du compte utilisateur ne sont pas sauvegardées.

**Recommandation :** Ajouter `onClick` qui appelle `supabase.from("users").update({...})` avec les champs `full_name`, `phone`, `email`.

---

### 🔴 C7. Bouton "Enregistrer" de la section WhatsApp SANS ACTION

**Fichier :** `src/app/dashboard/settings/page.tsx` (ligne 395)

```tsx
<Button>Enregistrer</Button>
```

**Problème :** Aucun `onClick` — les tokens WhatsApp ne sont pas sauvegardés.

**Recommandation :** Créer une table `whatsapp_config` et implémenter la sauvegarde. Ajouter un test de connexion.

---

### 🔴 C8. Bouton "Modifier le mot de passe" SANS ACTION

**Fichier :** `src/app/dashboard/settings/page.tsx` (ligne 412)

```tsx
<Button>Modifier le mot de passe</Button>
```

**Problème :** Aucun `onClick` — le changement de mot de passe ne fonctionne pas.

**Recommandation :** Implémenter avec `supabase.auth.updateUser({ password: newPassword })` après vérification de l'ancien mot de passe.

---

### 🔴 C9. Notifications (toggles) non persistées

**Fichier :** `src/app/dashboard/settings/page.tsx` (lignes 338-365)

**Problème :** Les toggles de notifications ne modifient que l'état local React. Aucune sauvegarde en base de données.

**Recommandation :** Créer une table `user_preferences` et sauvegarder les préférences. Charger au montage du composant.

---

### 🔴 C10. Login page — `loading` non réinitialisé après succès d'inscription

**Fichier :** `src/app/login/page.tsx`

**Problème :** Après une inscription réussie, l'état `loading` reste à `true`, laissant le bouton en spinner indéfiniment.

**Recommandation :** Ajouter `setLoading(false)` dans le bloc de succès ou dans le `finally`.

---

### 🔴 C11. Onboarding modal — pas de bouton de fermeture/skip

**Fichier :** `src/components/dashboard/onboarding-modal.tsx`

**Problème :** L'utilisateur est prisonnier du modal d'onboarding. Aucun moyen de fermer sans compléter.

**Recommandation :** Ajouter un bouton "Passer pour l'instant" qui ferme le modal (l'utilisateur pourra compléter plus tard via les paramètres).

---

### 🔴 C12. Page détail établissement — retour `null` silencieux

**Fichier :** `src/app/dashboard/residences/[id]/page.tsx`

**Problème :** Si l'établissement n'est pas trouvé, la page retourne `null` — écran blanc sans message d'erreur.

**Recommandation :** Afficher un état d'erreur avec un message "Établissement introuvable" et un bouton de retour vers `/dashboard/residences`.

---

## 4. Éléments interactifs manquants — Modéré

### 🟡 M1. Aucun état vide sur le dashboard principal

**Fichier :** `src/app/dashboard/page.tsx`

**Problème :** Si aucune donnée (pas de réservations, pas de chambres), les KPIs affichent des zéros et les graphiques sont vides sans message d'encouragement.

**Recommandation :** Ajouter un état d'onboarding sur le dashboard : "Bienvenue ! Commencez par ajouter votre premier établissement" avec un CTA vers `/dashboard/residences`.

---

### 🟡 M2. Aucune pagination sur les réservations

**Fichier :** `src/app/dashboard/bookings/page.tsx`

**Problème :** Les réservations sont limitées à 50 (`limit(50)`) sans pagination. Au-delà de 50, les anciennes réservations sont invisibles.

**Recommandation :** Implémenter une pagination (10-20 par page) avec contrôles de navigation et compteur total.

---

### 🟡 M3. Aucun filtre par date sur les réservations

**Fichier :** `src/app/dashboard/bookings/page.tsx`

**Problème :** Pas de filtre par plage de dates (arrivée, départ). Seul le filtre par statut existe.

**Recommandation :** Ajouter un date range picker pour filtrer par date d'arrivée ou de départ.

---

### 🟡 M4. Aucune fonction d'export (PDF/CSV)

**Problème :** Aucune page ne propose d'export de données. Particulièrement critique pour la comptabilité.

**Recommandation :**

- Comptabilité : export CSV des transactions et PDF des reçus
- Réservations : export CSV de la liste filtrée
- Dashboard : export PDF du rapport mensuel

---

### 🟡 M5. Pas de navigation mobile (sidebar)

**Fichier :** `src/components/dashboard/sidebar.tsx` + `src/app/dashboard/layout.tsx`

**Problème :** La sidebar est `fixed` et n'a pas de version mobile (drawer/overlay). Le bouton `onMenuClick` du header existe mais bascule le collapse au lieu d'ouvrir un drawer mobile.

**Recommandation :** Sur mobile (< 1024px), transformer la sidebar en drawer coulissant avec overlay, déclenché par le bouton menu du header.

---

### 🟡 M6. Pas de breadcrumbs (fil d'Ariane)

**Problème :** Aucune hiérarchie de navigation visible. L'utilisateur ne sait pas où il est dans la hiérarchie (ex: Dashboard > Établissements > Hôtel Palm Beach).

**Recommandation :** Ajouter des breadcrumbs dans le header ou au-dessus du contenu principal.

---

### 🟡 M7. Pas de raccourcis clavier

**Procommandation :** Implémenter les raccourcis suivants :

- `Cmd/Ctrl + K` : Recherche globale
- `Cmd/Ctrl + N` : Nouvelle réservation
- `Esc` : Fermer modales
- `g` puis `d` : Aller au dashboard
- `g` puis `b` : Aller aux réservations

---

### 🟡 M8. Pas de dialogues de confirmation pour actions destructrices

**Fichiers concernés :** `bookings/page.tsx` (cancel, no-show), `rooms/page.tsx` (delete)

**Problème :** Les actions destructrices (annuler réservation, marquer no-show, supprimer chambre) s'exécutent immédiatement sans confirmation.

**Recommandation :** Utiliser le composant `Modal` existant pour ajouter des dialogues de confirmation : "Êtes-vous sûr de vouloir annuler cette réservation ?"

---

### 🟡 M9. Pas de skeletons de chargement

**Problème :** Toutes les pages utilisent un simple spinner centré. Pas de skeletons qui préviennent du layout.

**Recommandation :** Remplacer les spinners par des skeletons (rectangles gris animés) qui reproduisent la structure de la page.

---

### 🟡 M10. Pas de bouton "Réessayer" sur les erreurs

**Problème :** Quand une page échoue à charger, un toast d'erreur s'affiche mais la page reste vide ou avec des données vides.

**Recommandation :** Afficher un état d'erreur avec un bouton "Réessayer" qui relance le chargement.

---

### 🟡 M11. Page abonnement — bouton "Payer" force le plan "standard"

**Fichier :** `src/app/dashboard/subscription/page.tsx`

**Problème :** Le bouton "Payer maintenant" force le plan "standard" sans tenir compte du plan sélectionné par l'utilisateur.

**Recommandation :** Passer dynamiquement le plan sélectionné au lieu de le coder en dur.

---

### 🟡 M12. Pas de recherche/filtre sur la page Employés

**Fichier :** `src/app/dashboard/employees/page.tsx`

**Problème :** Pas de recherche par nom ni filtre par rôle/statut.

**Recommandation :** Ajouter une barre de recherche et des filtres par rôle et statut (actif/inactif).

---

### 🟡 M13. Pas de recherche/filtre sur la page Ménage

**Fichier :** `src/app/dashboard/cleaning/page.tsx`

**Problème :** Pas de filtre par statut ou par établissement sur les tâches de ménage.

**Recommandation :** Ajouter des filtres par statut (en attente, en cours, terminée) et par établissement.

---

### 🟡 M14. Pas de recherche/filtre sur la page Comptabilité

**Fichier :** `src/app/dashboard/accounting/page.tsx`

**Problème :** Pas de filtre par plage de dates, par type de paiement, ou par statut.

**Recommandation :** Ajouter un date range picker, un filtre par type (cash, mobile money, carte), et par statut (payé, partiel, impayé).

---

### 🟡 M15. Modales non soumissibles par Entrée

**Problème :** Les modales utilisent des `<div>` au lieu de `<form>`. L'utilisateur ne peut pas soumettre avec la touche Entrée.

**Recommandation :** Envelopper les formulaires dans des `<form onSubmit={...}>` avec `e.preventDefault()`.

---

## 5. Améliorations UX/UI spécifiques par page

### 5.1 Dashboard principal (`/dashboard`)

| #   | Amélioration                                                               | Priorité    |
| --- | -------------------------------------------------------------------------- | ----------- |
| D1  | Rendre les boutons Check-in/Check-out fonctionnels (onClick → RPC)         | 🔴 Critique |
| D2  | Ajouter un état vide d'onboarding (pas d'établissement → CTA)              | 🟡 Haute    |
| D3  | Rendre les KPIs cliquables (ex: clic sur "Ménage" → `/dashboard/cleaning`) | 🟡 Haute    |
| D4  | Ajouter un sélecteur de période (aujourd'hui, 7 jours, 30 jours)           | 🟡 Moyenne  |
| D5  | Ajouter des tooltips sur les graphiques (hover → valeur exacte)            | 🟡 Moyenne  |
| D6  | Ajouter un compteur "X mouvements aujourd'hui"                             | 🟢 Basse    |
| D7  | Permettre le rafraîchissement manuel (bouton "Actualiser")                 | 🟢 Basse    |

### 5.2 Réservations (`/dashboard/bookings`)

| #   | Amélioration                                                               | Priorité   |
| --- | -------------------------------------------------------------------------- | ---------- |
| B1  | Ajouter la pagination (20/page)                                            | 🟡 Haute   |
| B2  | Ajouter un filtre par plage de dates                                       | 🟡 Haute   |
| B3  | Ajouter des dialogues de confirmation pour cancel/no-show                  | 🟡 Haute   |
| B4  | Ajouter un tri par colonne (date, montant, client)                         | 🟡 Moyenne |
| B5  | Ajouter un export CSV de la liste filtrée                                  | 🟡 Moyenne |
| B6  | Ajouter un vue calendrier (alternative au tableau)                         | 🟢 Basse   |
| B7  | Permettre l'édition d'une réservation existante                            | 🟡 Moyenne |
| B8  | Afficher les détails complets au clic sur une ligne (modal ou page dédiée) | 🟡 Moyenne |

### 5.3 Établissements (`/dashboard/residences`)

| #   | Amélioration                                                 | Priorité   |
| --- | ------------------------------------------------------------ | ---------- |
| R1  | Ajouter un bouton d'édition rapide sur chaque carte          | 🟡 Haute   |
| R2  | Ajouter un bouton de suppression sur chaque carte            | 🟡 Haute   |
| R3  | Afficher le taux d'occupation par établissement sur la carte | 🟡 Moyenne |
| R4  | Ajouter une image/photo de l'établissement                   | 🟢 Basse   |
| R5  | Permettre le tri (nom, nombre de chambres, date)             | 🟢 Basse   |

### 5.4 Chambres (`/dashboard/rooms`)

| #   | Amélioration                                           | Priorité   |
| --- | ------------------------------------------------------ | ---------- |
| RM1 | Ajouter un filtre par établissement (si plusieurs)     | 🟡 Moyenne |
| RM2 | Ajouter un filtre par statut de chambre                | 🟡 Moyenne |
| RM3 | Ajouter une vue grille (cartes visuelles des chambres) | 🟢 Basse   |
| RM4 | Permettre le changement de statut rapide (clic → menu) | 🟡 Moyenne |

### 5.5 Ménage (`/dashboard/cleaning`)

| #   | Amélioration                                                        | Priorité   |
| --- | ------------------------------------------------------------------- | ---------- |
| C1  | Ajouter un filtre par établissement                                 | 🟡 Haute   |
| C2  | Ajouter un filtre par statut                                        | 🟡 Haute   |
| C3  | Ajouter un bouton "Réassigner" pour les tâches                      | 🟡 Moyenne |
| C4  | Afficher le temps écoulé depuis l'assignation                       | 🟡 Moyenne |
| C5  | Ajouter une notification visuelle pour les tâches en retard (+1h30) | 🟡 Haute   |

### 5.6 Comptabilité (`/dashboard/accounting`)

| #   | Amélioration                                  | Priorité    |
| --- | --------------------------------------------- | ----------- |
| A1  | Ajouter un filtre par plage de dates          | 🔴 Critique |
| A2  | Ajouter un export CSV des transactions        | 🔴 Critique |
| A3  | Ajouter un filtre par mode de paiement        | 🟡 Haute    |
| A4  | Ajouter un graphique d'évolution mensuelle    | 🟡 Moyenne  |
| A5  | Permettre l'édition/suppression d'un paiement | 🟡 Moyenne  |
| A6  | Ajouter un export PDF de reçu                 | 🟡 Moyenne  |

### 5.7 Employés (`/dashboard/employees`)

| #   | Amélioration                                               | Priorité   |
| --- | ---------------------------------------------------------- | ---------- |
| E1  | Ajouter une recherche par nom                              | 🟡 Haute   |
| E2  | Ajouter un filtre par rôle                                 | 🟡 Haute   |
| E3  | Ajouter un filtre par statut (actif/inactif)               | 🟡 Haute   |
| E4  | Afficher la date de dernière connexion                     | 🟢 Basse   |
| E5  | Permettre la réinitialisation du mot de passe d'un employé | 🟡 Moyenne |

### 5.8 Abonnement (`/dashboard/subscription`)

| #   | Amélioration                             | Priorité    |
| --- | ---------------------------------------- | ----------- |
| S1  | Corriger le plan forcé à "standard"      | 🔴 Critique |
| S2  | Afficher l'historique des paiements      | 🟡 Moyenne  |
| S3  | Ajouter un comparateur de plans détaillé | 🟡 Moyenne  |
| S4  | Permettre l'annulation d'abonnement      | 🟡 Haute    |

### 5.9 Paramètres (`/dashboard/settings`)

| #   | Amélioration                                                      | Priorité    |
| --- | ----------------------------------------------------------------- | ----------- |
| SE1 | Rendre fonctionnel le bouton "Enregistrer" de la section Compte   | 🔴 Critique |
| SE2 | Rendre fonctionnel le bouton "Enregistrer" de la section WhatsApp | 🔴 Critique |
| SE3 | Rendre fonctionnel le bouton "Modifier le mot de passe"           | 🔴 Critique |
| SE4 | Persister les préférences de notifications en base                | 🔴 Critique |
| SE5 | Ajouter une section "Intégrations" (Google Calendar, etc.)        | 🟢 Basse    |
| SE6 | Ajouter un bouton "Supprimer mon compte"                          | 🟡 Moyenne  |

### 5.10 Login/Register (`/login`)

| #   | Amélioration                                                              | Priorité    |
| --- | ------------------------------------------------------------------------- | ----------- |
| L1  | Corriger le bug `loading` non réinitialisé après signup                   | 🔴 Critique |
| L2  | Ajouter "Mot de passe oublié" fonctionnel (lien existe mais non connecté) | 🔴 Critique |
| L3  | Ajouter la validation en temps réel des champs                            | 🟡 Moyenne  |
| L4  | Ajouter le reCAPTCHA sur le formulaire d'inscription                      | 🟡 Moyenne  |
| L5  | Mémoriser l'email (checkbox "Se souvenir de moi")                         | 🟢 Basse    |

---

## 6. Améliorations transversales

### 6.1 Navigation

| #   | Amélioration                                           | Priorité    |
| --- | ------------------------------------------------------ | ----------- |
| N1  | Sidebar mobile (drawer avec overlay)                   | 🔴 Critique |
| N2  | Breadcrumbs sur toutes les pages                       | 🟡 Haute    |
| N3  | Raccourcis clavier (Cmd+K recherche, etc.)             | 🟡 Moyenne  |
| N4  | Indicateur de page de chargement (top loading bar)     | 🟡 Moyenne  |
| N5  | État actif plus visible dans la sidebar (badge coloré) | 🟢 Basse    |

### 6.2 Header

| #   | Amélioration                                          | Priorité    |
| --- | ----------------------------------------------------- | ----------- |
| H1  | Implémenter la recherche globale (command palette)    | 🔴 Critique |
| H2  | Ajouter les liens dans le dropdown profil             | 🔴 Critique |
| H3  | Rendre fonctionnel "Marquer tout comme lu"            | 🔴 Critique |
| H4  | Ajouter un compteur de notifications en temps réel    | 🟡 Moyenne  |
| H5  | Ajouter un sélecteur de langue (FR/EN) dans le header | 🟡 Moyenne  |
| H6  | Ajouter un indicateur de connexion (online/offline)   | 🟢 Basse    |

### 6.3 États et feedback

| #   | Amélioration                                                        | Priorité   |
| --- | ------------------------------------------------------------------- | ---------- |
| F1  | Skeletons de chargement (remplacer les spinners)                    | 🟡 Haute   |
| F2  | Boutons "Réessayer" sur les erreurs                                 | 🟡 Haute   |
| F3  | Toasts d'action plus descriptifs (avec undo pour suppressions)      | 🟡 Moyenne |
| F4  | Animations de transition entre les pages                            | 🟢 Basse   |
| F5  | Indicateur de chargement pour les actions (bouton → spinner inline) | 🟡 Moyenne |

### 6.4 Accessibilité

| #   | Amélioration                                                         | Priorité   |
| --- | -------------------------------------------------------------------- | ---------- |
| A1  | Ajouter les `aria-label` sur tous les boutons icônes                 | 🟡 Haute   |
| A2  | S'assurer que tous les formulaires ont des `<label>` associés        | 🟡 Haute   |
| A3  | Ajouter le support de la navigation au clavier (Tab, Entrée, Esc)    | 🟡 Haute   |
| A4  | Améliorer le contraste des couleurs (WCAG AA)                        | 🟡 Moyenne |
| A5  | Ajouter des `focus-visible` styles sur tous les éléments interactifs | 🟡 Moyenne |

### 6.5 Performance

| #   | Amélioration                                                    | Priorité   |
| --- | --------------------------------------------------------------- | ---------- |
| P1  | Implémenter le prefetch des routes sur hover de liens sidebar   | 🟡 Moyenne |
| P2  | Mettre en cache les données avec React Query ou SWR             | 🟡 Moyenne |
| P3  | Implémenter le polling ou WebSocket pour les données temps réel | 🟢 Basse   |
| P4  | Optimiser les images avec `next/image` (lazy loading)           | 🟢 Basse   |

---

## 7. Priorisation des actions

### Phase 1 — Critique (à corriger immédiatement)

1. **Rendre les boutons Check-in/Check-out du dashboard fonctionnels** (C1)
2. **Rendre le bouton déconnexion de la sidebar fonctionnel** (C2)
3. **Rendre "Marquer tout comme lu" fonctionnel** (C3)
4. **Ajouter les liens dans le dropdown profil** (C5)
5. **Rendre les boutons "Enregistrer" des paramètres fonctionnels** (C6, C7, C8)
6. **Persister les préférences de notifications** (C9)
7. **Corriger le bug loading du login** (C10)
8. **Corriger le plan forcé de l'abonnement** (S1)
9. **Corriger le retour null silencieux de la page détail** (C12)

### Phase 2 — Haute priorité

1. **Implémenter la recherche globale** (C4/H1)
2. **Ajouter la sidebar mobile** (N1)
3. **Ajouter les breadcrumbs** (N2)
4. **Ajouter les dialogues de confirmation** (M8)
5. **Ajouter les skeletons de chargement** (F1)
6. **Ajouter les boutons "Réessayer"** (F2)
7. **Ajouter l'export CSV/PDF** (M4)
8. **Ajouter la pagination sur les réservations** (M2)
9. **Ajouter les filtres par date** (M3, A1)
10. **Ajouter l'état vide du dashboard** (M1)

### Phase 3 — Moyenne priorité

1. Raccourcis clavier (M7)
2. Tri des colonnes (B4)
3. Filtres sur employés et ménage (M12, M13)
4. Tooltips sur les graphiques (D5)
5. Améliorations d'accessibilité (A1-A5)
6. Préfixe de cache des données (P2)

### Phase 4 — Basse priorité

1. Vue calendrier des réservations (B6)
2. Images des établissements (R4)
3. Animations de transition (F4)
4. Polling/WebSocket temps réel (P3)
5. Intégrations tierces (SE5)

---

## Conclusion

Le projet Séjoura présente une **base solide** avec une architecture bien structurée, un design system cohérent, et des fonctionnalités métier couvrant le cycle complet de gestion hôtelière. Cependant, **de nombreux éléments interactifs sont non fonctionnels** (boutons sans `onClick`, formulaires sans soumission), ce qui dégrade significativement l'expérience utilisateur.

Les **9 corrections critiques** de la Phase 1 peuvent être implémentées rapidement (quelques heures) et auront un impact immédiat sur la fiabilité perçue de l'application. Les améliorations des Phases 2 et 3 transformeront l'application d'un prototype fonctionnel en un produit SaaS mature et complet.

// ============================================================================
// Registre central des produits Refontiq.
//
// Source unique de vérité pour le hub Super Admin (/admin/dashboard) : chaque
// nouveau produit s'ajoute ici (icône, statut, lien interne) et apparaît
// automatiquement dans la console d'administration.
// ============================================================================

export type ProjectStatus = "active" | "coming-soon";

export interface RefontiqProject {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Nom de l'icône Lucide (importée dynamiquement par la console). */
  icon: string;
  /** Couleur d'accent (hex) utilisée pour la carte du produit. */
  accent: string;
  status: ProjectStatus;
  /** Route interne de la console d'administration du produit. */
  href?: string;
  /** Statut affiché sous la forme "En développement", "Bêta", etc. */
  statusLabel?: string;
}

export const REFONTIQ_PROJECTS: RefontiqProject[] = [
  {
    id: "sejoura",
    name: "Séjoura",
    tagline: "Résidences & hôtels",
    description:
      "Gestion complète des résidences meublées et hôtels : réservations, ménage, comptabilité, employés et paiements Wave.",
    icon: "BedDouble",
    accent: "#0C1C33",
    status: "active",
    href: "/admin/sejour",
    statusLabel: "En production",
  },
  {
    id: "docly",
    name: "Docly",
    tagline: "Gestion de cliniques",
    description:
      "Pilotez vos cliniques et cabinets : patients, rendez-vous, personnel médical, dossiers et facturation.",
    icon: "Stethoscope",
    accent: "#0E7490",
    status: "coming-soon",
    statusLabel: "En développement",
  },
  {
    id: "schooly",
    name: "Schooly",
    tagline: "Gestion des écoles",
    description:
      "Administration scolaire : inscriptions, classes, emplois du temps, frais de scolarité et suivi des élèves.",
    icon: "GraduationCap",
    accent: "#7C3AED",
    status: "coming-soon",
    statusLabel: "En développement",
  },
];

// Projets annoncés mais non encore détaillés dans la console.
export const REFONTIQ_ROADMAP = [
  {
    id: "next-projects",
    label: "D'autres projets à venir",
    hint: "La famille Refontiq continue de s'agrandir.",
  },
];

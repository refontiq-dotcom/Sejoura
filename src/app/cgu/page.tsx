import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Conditions Générales d'Utilisation — Séjoura by Refontiq",
  description: "CGU de la plateforme Séjoura by Refontiq",
};

export default function CGUPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Retour au portail
          </Link>
          <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">Séjoura by Refontiq</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-[0_16px_60px_rgba(15,23,42,0.06)] border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Title Area */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 sm:px-10 py-8 text-white">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Conditions Générales d'Utilisation</h1>
            <p className="text-blue-100 text-sm mt-2">Séjoura by Refontiq — Dernière mise à jour : juillet 2026</p>
          </div>

          {/* Body */}
          <div className="px-6 sm:px-10 py-8 space-y-8 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. Objet et Champ d'Application</h2>
              <p>
                Les présentes Conditions Générales d'Utilisation (CGU) ont pour objet de définir les modalités et conditions d'accès aux services proposés par la plateforme <strong>Séjoura</strong> (éditée par <strong>Refontiq</strong>), ainsi que les droits et obligations des utilisateurs dans le cadre de l'exploitation, de la gestion et de la location d'hébergements meublés et résidences.
              </p>
              <p className="mt-2">
                L'utilisation de la plateforme implique l'acceptation pleine, entière et sans réserve des présentes CGU par l'utilisateur dès sa première connexion ou son inscription.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Définitions</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Plateforme :</strong> Désigne l'application web et logicielle <strong>Séjoura</strong>, accessible en ligne, dédiée à la gestion centralisée des résidences meublées.</li>
                <li><strong>Éditeur / Société :</strong> Désigne <strong>Refontiq</strong>, responsable de la conception, du développement et de l'exploitation technique de la plateforme Séjoura.</li>
                <li><strong>Utilisateur :</strong> Désigne toute personne physique ou morale (propriétaire, gestionnaire, administrateur, réceptionniste ou prestataire) disposant d'un compte actif sur la plateforme.</li>
                <li><strong>Services :</strong> Désigne l'ensemble des fonctionnalités logistiques, financières, de planification et de communication proposées par Séjoura.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. Inscription et Accès au Compte</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Pour accéder aux services, l'utilisateur doit créer un compte en fournissant des informations exactes, à jour et complètes.</li>
                <li>L'utilisateur est seul responsable de la sécurité et de la confidentialité de ses identifiants de connexion (adresse e-mail et mot de passe). Toute action effectuée depuis son compte est réputée avoir été réalisée par lui-même.</li>
                <li>En validant son inscription, l'utilisateur certifie avoir pris connaissance et accepté les présentes conditions d'utilisation ainsi que la politique de confidentialité.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Description des Services</h2>
              <p className="mb-2">Séjoura met à disposition une solution logicielle intelligente comprenant :</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Centralisation des Plannings :</strong> Gestion unifiée des réservations et multi-plateformes en temps réel.</li>
                <li><strong>Suivi Financier :</strong> Outils de pilotage des encaissements, de suivi des loyers et d'analyse de la rentabilité.</li>
                <li><strong>Gestion Opérationnelle :</strong> Tableaux de bord intuitifs adaptés aux différents rôles (propriétaires, gestionnaires, personnel de réception).</li>
                <li><strong>Sécurité :</strong> Protection des données d'exploitation et traçabilité des actions réalisées sur la plateforme.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Engagements et Obligations de l'Utilisateur</h2>
              <p className="mb-2">L'utilisateur s'engage expressément à :</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Utiliser la plateforme conformément aux lois en vigueur, à l'ordre public et aux bonnes mœurs.</li>
                <li>Ne pas perturber, entraver ou endommager le bon fonctionnement technique de Séjoura.</li>
                <li>Ne pas introduire de codes malveillants, virus ou scripts non autorisés.</li>
                <li>Fournir des données relatives aux résidences, aux clients et aux transactions qui soient rigoureusement exactes.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Propriété Intellectuelle</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>L'ensemble des éléments constituant la plateforme <strong>Séjoura</strong> (textes, logos, chartes graphiques, codes sources, bases de données, interfaces, architectures) est la propriété exclusive de <strong>Refontiq</strong>.</li>
                <li>Toute reproduction, représentation, modification, adaptation ou exploitation totale ou partielle des éléments de la plateforme, par quelque procédé que ce soit, sans l'autorisation écrite préalable de Refontiq, est strictement interdite et constitutive d'une contrefaçon.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">7. Données Personnelles et Confidentialité</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Les données collectées sur la plateforme sont traitées dans le strict respect de la confidentialité et de la protection des données personnelles.</li>
                <li>Séjoura s'engage à mettre en œuvre toutes les mesures techniques et organisationnelles nécessaires pour garantir la sécurité et l'intégrité des données stockées.</li>
                <li>L'utilisateur dispose d'un droit d'accès, de rectification et de suppression des données le concernant, qu'il peut exercer en contactant le support technique de Refontiq.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">8. Limitation de Responsabilité et Maintenance</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>L'éditeur s'efforce d'assurer un accès continu à la plateforme 24h/24 et 7j/7, mais ne saurait être tenu responsable en cas d'interruption temporaire pour cause de maintenance corrective ou évolutive, de pannes de réseaux ou de cas de force majeure.</li>
                <li>Séjoura agit en tant qu'outil d'aide à la gestion ; l'utilisateur demeure seul responsable des décisions prises, des contrats conclus avec ses propres clients et du respect de ses obligations fiscales et légales locales.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">9. Modification et Résiliation</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Refontiq</strong> se réserve le droit de modifier unilatéralement les termes des présentes CGU à tout moment afin de les adapter aux évolutions techniques ou réglementaires. Les utilisateurs seront informés des mises à jour majeures.</li>
                <li>L'utilisateur peut à tout moment fermer son compte et cesser d'utiliser les services en formulant une demande de résiliation via les paramètres de son espace ou auprès du support.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">10. Droit Applicable et Juridiction Compétente</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>Les présentes Conditions Générales d'Utilisation sont régies et interprétées conformément aux lois en vigueur.</li>
                <li>En cas de litige relatif à l'interprétation ou à l'exécution des présentes CGU, et à défaut de résolution amiable, compétence expresse est attribuée aux juridictions compétentes.</li>
              </ul>
            </section>

            <section className="border-t border-slate-200 dark:border-slate-800 pt-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Sections Complémentaires</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Abonnements, Tarifs et Modalités de Paiement</h3>
                  <p className="mb-1"><strong>Souscription et Formules :</strong> L'accès à certaines fonctionnalités avancées de la plateforme Séjoura est soumis à la souscription d'un abonnement payant (mensuel, trimestriel ou annuel) dont les tarifs en vigueur sont affichés sur le site de l'entreprise.</p>
                  <p className="mb-1"><strong>Facturation et Renouvellement :</strong> Les abonnements sont facturés à l'avance. Sauf mention contraire, les abonnements sont renouvelés tacitement pour une période équivalente, sauf résiliation notifiée par l'utilisateur avant la date d'échéance.</p>
                  <p><strong>Défaut de Paiement :</strong> En cas de non-paiement ou de rejet d'un prélèvement à l'échéance, Refontiq se réserve le droit de suspendre ou de restreindre l'accès aux services de Séjoura jusqu'à régularisation complète de la situation.</p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Gestion des Flux Financiers et Paiements des Clients Finaux</h3>
                  <p className="mb-1"><strong>Rôle de la Plateforme :</strong> Séjoura met à disposition des outils techniques facilitant le suivi financier, l'enregistrement des encaissements et la gestion des loyers ou des séjours des clients finaux de l'utilisateur.</p>
                  <p className="mb-1"><strong>Responsabilité des Transactions :</strong> L'utilisateur demeure seul responsable de la fixation de ses tarifs, de la collecte des fonds auprès de ses propres clients (voyageurs, locataires), ainsi que du paiement des taxes, impôts et charges fiscales applicables dans sa juridiction.</p>
                  <p><strong>Sécurisation des Données Financières :</strong> Les informations relatives aux transactions financières enregistrées sur la plateforme sont traitées avec un haut niveau de sécurité. Toutefois, Séjoura ne saurait être tenu responsable des incidents ou refus de paiement imputables aux institutions bancaires ou aux passerelles de paiement tierces.</p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Moyens de Paiement Acceptés</h3>
                  <p className="mb-1"><strong>Pour l'abonnement à Séjoura :</strong> Les règlements des abonnements s'effectuent par les moyens de paiement sécurisés mis à disposition par l'éditeur (cartes bancaires, virements, ou solutions de paiement mobile locales autorisées).</p>
                  <p><strong>Pour les réservations gérées via Séjoura :</strong> La plateforme permet de consigner et de suivre différents modes de paiement utilisés par les clients des résidences (espèces, cartes bancaires, paiements mobiles, virements), selon les configurations choisies par l'exploitant de la résidence.</p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Propriété des Données de l'Utilisateur</h3>
                  <p className="mb-1"><strong>Propriété exclusive :</strong> L'utilisateur demeure seul propriétaire de l'ensemble des données, fichiers, informations, listes de clients et plannings qu'il importe, saisit ou génère dans le cadre de son utilisation de la plateforme Séjoura.</p>
                  <p className="mb-1"><strong>Licence d'exploitation technique :</strong> L'utilisateur accorde à Refontiq une licence limitée strictement nécessaire à l'hébergement, au traitement technique et à l'affichage desdites données pour les besoins exclusifs de l'exécution des services de la plateforme.</p>
                  <p><strong>Restitution en fin de contrat :</strong> En cas de résiliation du compte, l'utilisateur dispose d'un droit d'exportation de ses données dans un format standard, conformément aux dispositions légales en matière de portabilité des données.</p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Politique de Résiliation et de Remboursement des Abonnements</h3>
                  <p className="mb-1"><strong>Absence de remboursement :</strong> Sauf dispositions légales impératives contraires, les abonnements payés d'avance (mensuels ou annuels) ne font l'objet d'aucun remboursement prorata temporis en cas de résiliation anticipée à l'initiative de l'utilisateur.</p>
                  <p><strong>Prise d'effet de la résiliation :</strong> Toute demande de résiliation d'un abonnement prend effet à la date d'échéance de la période en cours déjà réglée, garantissant l'accès aux services jusqu'à cette date.</p>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Support Technique, Assistance et Maintenance</h3>
                  <p className="mb-1"><strong>Modalités de contact :</strong> Le support technique de Séjoura est accessible aux utilisateurs selon les canaux définis sur la plateforme (e-mail, espace client ou messagerie dédiée).</p>
                  <p><strong>Niveaux de service :</strong> L'éditeur s'engage à traiter les demandes d'assistance dans les meilleurs délais ouvrés. Les interventions de maintenance corrective ou évolutive sont planifiées de préférence aux heures de faible affluence afin de minimiser l'impact sur l'exploitation des résidences.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

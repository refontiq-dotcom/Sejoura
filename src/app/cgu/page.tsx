import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "CGU — Séjoura by Refontiq",
  description: "Conditions Générales d'Utilisation de Séjoura.",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h2>
    <div className="space-y-2">{children}</div>
  </section>
);

export default function CGUPage() {
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
    <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"><ArrowLeft className="w-4 h-4"/>Retour au portail</Link>
        <span className="text-xs font-semibold text-slate-500">Séjoura by Refontiq</span>
      </div>
    </header>
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 sm:px-10 py-8 text-white">
          <h1 className="text-2xl sm:text-3xl font-bold">Conditions Générales d'Utilisation</h1>
          <p className="text-blue-100 text-sm mt-2">Version 2.0 — mise à jour : 24 septembre 2026</p>
        </div>
        <div className="px-6 sm:px-10 py-8 space-y-8 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <Section title="1. Éditeur et objet">
            <p><strong>Refontiq</strong>, représentée par <strong>Dukoua N'guessan Samuel junior</strong>, conçoit et exploite le SaaS Séjoura. Contact : <strong>+225 01 00 37 29 00</strong>. Site : <a className="text-blue-600 underline" href="https://refontiq.com" target="_blank" rel="noopener noreferrer">refontiq.com</a>.</p>
            <p>Ces CGU encadrent l'accès et l'utilisation de Séjoura par les hôtels, résidences, propriétaires, gestionnaires et membres de leurs équipes.</p>
          </Section>
          <Section title="2. Rôle de Séjoura">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Refontiq</strong> est l'éditeur et prestataire technique de Séjoura.</li>
              <li><strong>Utilisateur</strong> désigne toute personne autorisée à utiliser un compte.</li>
              <li><strong>Établissement</strong> désigne l'activité d'hébergement gérée avec Séjoura.</li>
              <li><strong>Client final</strong> désigne toute personne dont les données sont saisies par l'établissement.</li>
            </ul>
            <p>Sauf contrat distinct, Séjoura est un outil logiciel : Refontiq n'est pas l'exploitant de l'établissement et n'est pas partie aux contrats conclus entre l'établissement et ses clients.</p>
          </Section>
          <Section title="3. Inscription et compte">
            <ul className="list-disc pl-5 space-y-1">
              <li>L'inscription nécessite l'acceptation des présentes CGU.</li>
              <li>L'utilisateur fournit des informations exactes, actuelles et complètes.</li>
              <li>Les identifiants sont personnels et doivent rester confidentiels.</li>
              <li>Refontiq peut suspendre un compte en cas de fraude, d'usage illicite, de risque de sécurité ou de violation substantielle des CGU.</li>
            </ul>
          </Section>
          <Section title="4. Services et limites">
            <p>Séjoura peut fournir des fonctions de réservations, chambres, clients, caisse, paiements enregistrés, facturation, équipes, tâches, statistiques, notifications et pilotage. Les fonctionnalités peuvent évoluer.</p>
            <p>Les résultats dépendent des données saisies par l'utilisateur. Séjoura ne garantit aucun niveau déterminé de chiffre d'affaires, réservations, rentabilité ou performance commerciale.</p>
          </Section>
          <Section title="5. Données saisies par l'utilisateur">
            <ul className="list-disc pl-5 space-y-1">
              <li>L'établissement est responsable de l'exactitude, de la licéité et de la pertinence des données qu'il saisit.</li>
              <li>L'établissement doit informer ses clients, salariés et autres personnes concernées lorsque la loi l'exige et disposer de la base légale nécessaire.</li>
              <li>Les données sensibles ou documents d'identité ne doivent être collectés que lorsqu'ils sont nécessaires et légalement autorisés.</li>
              <li>L'utilisateur ne doit pas introduire de contenu illicite, malveillant ou sans rapport avec le service.</li>
            </ul>
          </Section>
          <Section title="6. Données personnelles">
            <p>La protection des données personnelles est détaillée dans la <Link href="/politique-confidentialite" className="text-blue-600 underline">Politique de confidentialité</Link>.</p>
            <p>Pour les données de clients finaux saisies par un établissement, celui-ci détermine généralement les finalités de son traitement et Refontiq agit principalement comme prestataire technique, sous réserve des traitements que Refontiq réalise pour ses propres finalités (compte, sécurité, facturation, support, etc.).</p>
          </Section>
          <Section title="7. Hébergement et prestataires">
            <p>Les données applicatives sont stockées dans la base Supabase utilisée par le projet Séjoura de Refontiq. D'autres prestataires peuvent intervenir pour l'hébergement, l'authentification, les paiements ou les notifications. Les transferts internationaux sont soumis aux exigences légales applicables.</p>
          </Section>
          <Section title="8. Sécurité et disponibilité">
            <ul className="list-disc pl-5 space-y-1">
              <li>Refontiq met en œuvre des mesures techniques et organisationnelles adaptées au service.</li>
              <li>Aucun service Internet ne peut être garanti comme absolument invulnérable.</li>
              <li>Des interruptions peuvent résulter d'une maintenance, d'une panne, d'un incident de sécurité, d'un fournisseur tiers, d'un problème réseau ou d'un cas de force majeure.</li>
              <li>En cas d'incident affectant les données, Refontiq prend les mesures et notifications requises par la réglementation applicable.</li>
            </ul>
          </Section>
          <Section title="9. Propriété intellectuelle">
            <p>Les logiciels, codes, interfaces, marques, designs et éléments propres à Séjoura restent la propriété de Refontiq ou de ses concédants. L'abonnement ne transfère aucun droit de propriété intellectuelle. L'utilisateur conserve ses droits sur les données qu'il apporte.</p>
          </Section>
          <Section title="10. Abonnements et paiements">
            <ul className="list-disc pl-5 space-y-1">
              <li>Les tarifs et fonctionnalités payantes sont ceux affichés au moment de la souscription.</li>
              <li>Les modalités de période, renouvellement, paiement, suspension et résiliation sont précisées lors de la souscription.</li>
              <li>En cas d'impayé, les fonctionnalités payantes peuvent être suspendues après information de l'utilisateur.</li>
              <li>Tout remboursement est soumis aux conditions contractuelles et aux dispositions légales impératives.</li>
            </ul>
          </Section>
          <Section title="11. Flux financiers">
            <p>Séjoura peut permettre d'enregistrer et suivre des paiements. Sauf service de paiement expressément fourni par Refontiq, la plateforme n'est pas partie au contrat de paiement entre l'établissement et son client. L'établissement reste responsable de ses tarifs, encaissements, justificatifs, taxes et relations avec les banques ou opérateurs de paiement.</p>
          </Section>
          <Section title="12. Données, export et fin de compte">
            <p>L'utilisateur conserve ses droits sur ses données. Il peut demander leur export dans les formats disponibles. Après fermeture, certaines données peuvent être conservées pour les obligations légales, la preuve, la sécurité ou la lutte contre la fraude. Les sauvegardes peuvent subsister temporairement selon les cycles techniques.</p>
          </Section>
          <Section title="13. Modifications">
            <p>Refontiq peut faire évoluer les CGU pour les besoins du service, de la sécurité ou de la réglementation. La version publiée indique sa date de mise à jour. Les changements substantiels feront l'objet d'une information appropriée.</p>
          </Section>
          <Section title="14. Réclamations">
            <p>Toute réclamation peut être adressée à Refontiq au <strong>+225 01 00 37 29 00</strong> afin de rechercher une solution amiable. Les droits impératifs des consommateurs et des personnes concernées par les données restent applicables.</p>
          </Section>
          <Section title="15. Droit applicable">
            <p>Les présentes CGU sont régies par le droit ivoirien, sous réserve des dispositions impératives qui ne peuvent être écartées par contrat. Tout litige non résolu amiablement relève des juridictions ivoiriennes compétentes.</p>
          </Section>
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6 flex flex-wrap gap-4">
            <Link href="/politique-confidentialite" className="text-blue-600 underline">Politique de confidentialité</Link>
            <Link href="/mentions-legales" className="text-blue-600 underline">Mentions légales</Link>
          </div>
        </div>
      </div>
    </main>
  </div>;
}
